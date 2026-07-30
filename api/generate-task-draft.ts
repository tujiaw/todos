import {
  VercelAiGatewayTaskDraftProvider,
  type TaskDraftProvider,
} from '../server/providers.js';
import {
  DAILY_AI_LIMIT,
  DAILY_LIMIT_MESSAGE,
  getShanghaiDate,
  InMemoryDailyRateLimiter,
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

function getHeader(request: ApiRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getServerConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Auth is not configured on the server.');
  }
  if (!deepSeekApiKey) {
    throw new Error('DeepSeek BYOK is not configured on the server.');
  }
  return { supabaseUrl, supabaseAnonKey, deepSeekApiKey };
}

async function authenticate(
  request: ApiRequest,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ id: string }> {
  const authorization = getHeader(request, 'authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication is required.');

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: supabaseAnonKey },
  });
  if (!response.ok) throw new Error('Your session is invalid or expired.');
  const user = await response.json();
  if (!user?.id || user?.is_anonymous) throw new Error('Authentication is required.');
  return { id: user.id };
}

function createProvider(userId: string, apiKey: string): TaskDraftProvider {
  return new VercelAiGatewayTaskDraftProvider({
    apiKey,
    userId,
    model: process.env.AI_MODEL || 'deepseek/deepseek-v4-flash',
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
  if (
    message.includes('Authentication') ||
    message.includes('session') ||
    message.includes('authenticated')
  ) {
    return 401;
  }
  if (message === DAILY_LIMIT_MESSAGE) return 429;
  if (message.includes('credits')) return 402;
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
      request,
      config.supabaseUrl,
      config.supabaseAnonKey
    );
    const provider = createProvider(user.id, config.deepSeekApiKey);
    const dailyUsage = dailyLimiter.consume(user.id, getShanghaiDate());
    if (dailyUsage < 0) throw new Error(DAILY_LIMIT_MESSAGE);

    const draft = await generateValidatedDraft(provider, input);
    response.status(200).json({
      draft,
      meta: {
        provider: provider.name,
        model: provider.model,
        dailyUsage,
        dailyLimit: DAILY_AI_LIMIT,
        limitScope: 'vercel-instance',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI task drafting failed.';
    response.status(getStatus(message)).json({ error: message });
  }
}
