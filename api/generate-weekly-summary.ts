import { DeepSeekJsonProvider } from '../server/providers.js';
import {
  DAILY_AI_LIMIT,
  DAILY_LIMIT_MESSAGE,
  getShanghaiDate,
  InMemoryDailyRateLimiter,
} from '../server/rate-limit.js';
import {
  buildWeeklySummaryPrompt,
  validateWeeklySummaryRequest,
  validateWeeklySummaryResult,
  type WeeklySummaryResult,
} from '../server/weekly-summary.js';

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: Record<string, unknown>): void;
}

const dailyLimiter = new InMemoryDailyRateLimiter();

function getHeader(request: ApiRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Auth is not configured on the server.');
  }
  if (!apiKey) throw new Error('DeepSeek API is not configured on the server.');
  return { supabaseUrl, supabaseAnonKey, apiKey };
}

async function authenticate(
  request: ApiRequest,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ id: string }> {
  const authorization = getHeader(request, 'authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication is required.');
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: supabaseAnonKey },
  });
  if (!authResponse.ok) throw new Error('Your session is invalid or expired.');
  const user = await authResponse.json();
  if (!user?.id || user?.is_anonymous) throw new Error('Authentication is required.');
  return { id: user.id };
}

function getStatus(message: string): number {
  if (
    message.includes('Authentication') ||
    message.includes('session') ||
    message.includes('authenticated')
  ) {
    return 401;
  }
  if (message === DAILY_LIMIT_MESSAGE) return 429;
  if (message.includes('balance')) return 402;
  if (message.includes('rate limited')) return 429;
  if (message.includes('unavailable') || message.includes('timed out')) return 503;
  if (message.includes('Invalid') || message.includes('Too many')) return 400;
  return 502;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const config = getConfig();
    const input = validateWeeklySummaryRequest(
      typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    );
    const user = await authenticate(request, config.supabaseUrl, config.supabaseAnonKey);
    const dailyUsage = dailyLimiter.consume(user.id, getShanghaiDate());
    if (dailyUsage < 0) throw new Error(DAILY_LIMIT_MESSAGE);

    const provider = new DeepSeekJsonProvider({
      apiKey: config.apiKey,
      model: process.env.AI_MODEL || 'deepseek-v4-flash',
      baseUrl: process.env.DEEPSEEK_BASE_URL,
    });
    const prompt = buildWeeklySummaryPrompt(input);
    let lastError: unknown;
    let summary: WeeklySummaryResult | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const retryPrompt =
          attempt === 0
            ? prompt
            : `${prompt}\n上一份输出无效。请只返回修正后的 JSON 对象。`;
        summary = validateWeeklySummaryResult(
          await provider.generate(
            '你撰写简洁、可直接用于周会的中文工作纪要。只返回一个合法 JSON 对象，不要 markdown。',
            retryPrompt,
            2200
          )
        );
        break;
      } catch (error) {
        lastError = error;
        if (
          error instanceof Error &&
          (error.message.includes('authentication') ||
            error.message.includes('balance') ||
            error.message.includes('HTTP') ||
            error.message.includes('rejected') ||
            error.message.includes('rate limited') ||
            error.message.includes('unavailable') ||
            error.message.includes('timed out'))
        ) {
          throw error;
        }
      }
    }

    if (!summary) {
      console.error('Weekly summary validation failed:', lastError);
      throw new Error('AI returned invalid weekly summary.');
    }

    response.status(200).json({
      summary,
      meta: {
        provider: provider.name,
        model: provider.model,
        dailyUsage,
        dailyLimit: DAILY_AI_LIMIT,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI weekly summary failed.';
    response.status(getStatus(message)).json({ error: message });
  }
}
