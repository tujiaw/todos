import {
  runAiAssistAgent,
  validateAiAssistRequest,
} from '../server/ai-assist.js';
import { authenticate, getSupabaseAuthConfig } from '../server/auth.js';
import { DeepSeekJsonProvider } from '../server/providers.js';
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

function getConfig() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseAuthConfig();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DeepSeek API is not configured on the server.');
  return { supabaseUrl, supabaseAnonKey, apiKey };
}

function getStatus(message: string): number {
  if (message.includes('not configured')) return 500;
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
  if (
    message.includes('Invalid') ||
    message.includes('Too many') ||
    message.includes('maximum number of tool loops')
  ) {
    return 400;
  }
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
    const input = validateAiAssistRequest(
      typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    );
    const user = await authenticate(
      request.headers,
      config.supabaseUrl,
      config.supabaseAnonKey
    );
    const quota = await consumeAiQuota({
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
      accessToken: user.accessToken,
      userId: user.id,
      memoryLimiter: dailyLimiter,
    });
    if (quota.count < 0) throw new Error(DAILY_LIMIT_MESSAGE);

    const provider = new DeepSeekJsonProvider({
      apiKey: config.apiKey,
      model: process.env.AI_MODEL || 'deepseek-v4-flash',
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      timeoutMs: 45_000,
    });

    const result = await runAiAssistAgent(provider, input);

    response.status(200).json({
      result,
      meta: {
        provider: provider.name,
        model: provider.model,
        loops: result.loops,
        toolCalls: result.toolCalls,
        dailyUsage: quota.count,
        dailyLimit: DAILY_AI_LIMIT,
        limitScope: quota.limitScope,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI assist failed.';
    response.status(getStatus(message)).json({ error: message });
  }
}
