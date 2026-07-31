import { DeepSeekJsonProvider } from '../server/providers.js';
import {
  buildDashboardCopyPrompt,
  validateDashboardCopy,
  type DashboardCopy,
} from '../server/dashboard-copy.js';
import {
  DAILY_AI_LIMIT,
  DAILY_LIMIT_MESSAGE,
  InMemoryDailyRateLimiter,
  consumeAiQuota,
} from '../server/rate-limit.js';

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

function validateInput(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid dashboard copy request.');
  const input = value as Record<string, unknown>;
  const currentDate =
    typeof input.currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.currentDate)
      ? input.currentDate
      : '';
  const pendingTasks = Number.isInteger(input.pendingTasks) ? Number(input.pendingTasks) : -1;
  const completedTasks = Number.isInteger(input.completedTasks)
    ? Number(input.completedTasks)
    : -1;
  if (
    !currentDate ||
    pendingTasks < 0 ||
    pendingTasks > 999 ||
    completedTasks < 0 ||
    completedTasks > 999
  ) {
    throw new Error('Invalid dashboard copy request.');
  }
  return { currentDate, pendingTasks, completedTasks };
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
  if (message.includes('Invalid')) return 400;
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
    const input = validateInput(
      typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    );
    const user = await authenticate(request, config.supabaseUrl, config.supabaseAnonKey);
    const authorization = getHeader(request, 'authorization') || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    const quota = await consumeAiQuota({
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
      accessToken,
      userId: user.id,
      memoryLimiter: dailyLimiter,
    });
    if (quota.count < 0) throw new Error(DAILY_LIMIT_MESSAGE);

    const provider = new DeepSeekJsonProvider({
      apiKey: config.apiKey,
      model: process.env.AI_MODEL || 'deepseek-v4-flash',
      baseUrl: process.env.DEEPSEEK_BASE_URL,
    });
    const prompt = buildDashboardCopyPrompt(input);
    let lastError: unknown;
    let copy: DashboardCopy | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const retryPrompt =
          attempt === 0
            ? prompt
            : `${prompt}\nThe previous output was invalid. Return corrected JSON only.`;
        copy = validateDashboardCopy(
          await provider.generate(
            'You write concise motivational UI copy. Return one valid JSON object and no markdown.',
            retryPrompt,
            220
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
    if (!copy) {
      console.error('Dashboard copy validation failed:', lastError);
      throw new Error('AI returned invalid dashboard copy.');
    }

    response.status(200).json({
      copy,
      meta: {
        provider: provider.name,
        model: provider.model,
        dailyUsage: quota.count,
        dailyLimit: DAILY_AI_LIMIT,
        limitScope: quota.limitScope,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI dashboard copy failed.';
    response.status(getStatus(message)).json({ error: message });
  }
}
