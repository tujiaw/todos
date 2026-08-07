import { authenticate, getSupabaseAuthConfig } from '../server/auth.js';
import {
  DeepSeekTaskDraftProvider,
  type TaskDraftProvider,
} from '../server/providers.js';
import {
  DAILY_AI_LIMIT,
  DAILY_LIMIT_MESSAGE,
  InMemoryDailyRateLimiter,
  consumeAiQuota,
} from '../server/rate-limit.js';
import {
  validateTaskDraft,
  validateTaskDraftRequest,
  type TaskDraftRequest,
} from '../server/task-draft.js';

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

function getServerConfig() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseAuthConfig();
  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  if (!deepSeekApiKey) {
    throw new Error('DeepSeek API is not configured on the server.');
  }
  return { supabaseUrl, supabaseAnonKey, deepSeekApiKey };
}

function createProvider(apiKey: string): TaskDraftProvider {
  return new DeepSeekTaskDraftProvider({
    apiKey,
    model: process.env.AI_MODEL || 'deepseek-v4-flash',
    baseUrl: process.env.DEEPSEEK_BASE_URL,
  });
}

async function generateValidatedDraft(
  provider: TaskDraftProvider,
  request: TaskDraftRequest
) {
  let previousInvalidOutput: string | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rawDraft = await provider.generate(request, previousInvalidOutput);
      return validateTaskDraft(rawDraft, request);
    } catch (error) {
      lastError = error;
      previousInvalidOutput =
        error instanceof SyntaxError ? 'The response was not valid JSON.' : String(error);
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

  console.error('Task draft validation failed:', lastError);
  throw new Error('AI returned an invalid task draft. Please try again.');
}

function getStatus(message: string): number {
  if (message.includes('not configured') || message.includes('project mismatch')) {
    return 500;
  }
  if (
    message.includes('Authentication') ||
    message.includes('session') ||
    message.includes('authenticated')
  ) {
    return 401;
  }
  if (message === DAILY_LIMIT_MESSAGE) return 429;
  if (message.includes('credits') || message.includes('balance')) return 402;
  if (message.includes('rate limited')) return 429;
  if (message.includes('unavailable') || message.includes('timed out')) return 503;
  if (
    message.includes('required') ||
    message.includes('invalid') ||
    message.includes('Too many categories')
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
    const config = getServerConfig();
    const input = validateTaskDraftRequest(
      typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    );
    const user = await authenticate(
      request.headers,
      config.supabaseUrl,
      config.supabaseAnonKey
    );
    const provider = createProvider(config.deepSeekApiKey);
    const quota = await consumeAiQuota({
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
      accessToken: user.accessToken,
      userId: user.id,
      memoryLimiter: dailyLimiter,
    });
    if (quota.count < 0) throw new Error(DAILY_LIMIT_MESSAGE);

    const draft = await generateValidatedDraft(provider, input);
    response.status(200).json({
      draft,
      meta: {
        provider: provider.name,
        model: provider.model,
        dailyUsage: quota.count,
        dailyLimit: DAILY_AI_LIMIT,
        limitScope: quota.limitScope,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI task drafting failed.';
    response.status(getStatus(message)).json({ error: message });
  }
}
