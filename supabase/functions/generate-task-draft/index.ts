import {
  validateTaskDraft,
  validateTaskDraftRequest,
  type TaskDraftRequest,
} from './task-draft.ts';
import { DeepSeekTaskDraftProvider, type TaskDraftProvider } from './providers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const DAILY_LIMIT_MESSAGE = '今日 AI 调用次数已达 50 次，请明天再继续使用。';

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function authenticate(request: Request): Promise<{ id: string }> {
  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey) {
    throw new Error('Authentication is required.');
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) throw new Error('Your session is invalid or expired.');
  const user = await response.json();
  if (!user?.id || user?.is_anonymous) throw new Error('Authentication is required.');
  return { id: user.id };
}

async function consumeDailyQuota(request: Request): Promise<number> {
  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization || !supabaseUrl || !anonKey) {
    throw new Error('Authentication is required.');
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/consume_ai_daily_quota`,
    {
      method: 'POST',
      headers: {
        Authorization: authorization,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }
  );
  if (!response.ok) {
    console.error('Failed to consume AI quota:', response.status, await response.text());
    throw new Error('AI daily quota is not configured. Run the latest Supabase schema.');
  }

  const count = Number(await response.json());
  if (!Number.isInteger(count)) throw new Error('AI daily quota returned an invalid result.');
  if (count < 0) throw new Error(DAILY_LIMIT_MESSAGE);
  return count;
}

function createProvider(): TaskDraftProvider {
  const provider = Deno.env.get('AI_PROVIDER') || 'deepseek';
  if (provider !== 'deepseek') throw new Error(`Unsupported AI provider: ${provider}`);
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
  if (!apiKey) throw new Error('DeepSeek is not configured on the server.');
  return new DeepSeekTaskDraftProvider({
    apiKey,
    model: Deno.env.get('AI_MODEL') || 'deepseek-v4-flash',
    baseUrl: Deno.env.get('DEEPSEEK_BASE_URL') || undefined,
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });

  try {
    await authenticate(request);
    const input = validateTaskDraftRequest(await request.json());
    const provider = createProvider();
    const dailyUsage = await consumeDailyQuota(request);
    const draft = await generateValidatedDraft(provider, input);
    return respond(200, {
      draft,
      meta: { provider: provider.name, model: provider.model, dailyUsage, dailyLimit: 50 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI task drafting failed.';
    const status =
      message.includes('Authentication') ||
      message.includes('session') ||
      message.includes('authenticated')
        ? 401
        : message === DAILY_LIMIT_MESSAGE
          ? 429
          : message.includes('required') ||
              message.includes('invalid') ||
              message.includes('Too many categories')
            ? 400
            : 502;
    return respond(status, { error: message });
  }
});
