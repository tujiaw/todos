import { Category, TaskDraft } from '../types';
import type { AiAssistRequestPayload, AiAssistResult } from '../utils/aiAssist';
import type { DashboardCopy } from './dashboardCopyCache';
import { supabase } from './supabase';

export type { AiAssistResult } from '../utils/aiAssist';
export type { DashboardCopy } from './dashboardCopyCache';
export {
  loadCachedDashboardCopy,
  saveCachedDashboardCopy,
} from './dashboardCopyCache';

interface GenerateTaskDraftInput {
  text: string;
  currentDate: string;
  selectedDate: string;
  timezone: string;
  categories: Pick<Category, 'id' | 'name' | 'isDefault'>[];
}

interface GenerateTaskDraftResponse {
  draft: TaskDraft;
  meta?: {
    provider: string;
    model: string;
    dailyUsage?: number;
    dailyLimit?: number;
  };
}

async function getAccessToken(signInMessage: string): Promise<string> {
  // Always refresh before AI calls so we never send a stale access token that
  // the Supabase JS client would silently renew for its own REST requests.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  let session = refreshed.session;
  if (!session?.access_token) {
    const { data: sessionData } = await supabase.auth.getSession();
    session = sessionData.session;
  }

  if (!session?.access_token || session.user?.is_anonymous) {
    throw new Error(
      refreshError
        ? 'Your session is invalid or expired. Please sign in again.'
        : signInMessage
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(
    session.access_token
  );
  if (userError || !userData.user || userData.user.is_anonymous) {
    throw new Error('Your session is invalid or expired. Please sign in again.');
  }

  return session.access_token;
}

function getPlatformErrorCode(body: string): string | undefined {
  return body.match(/\b(?:FUNCTION|EDGE_FUNCTION)_[A-Z0-9_]+\b/)?.[0];
}

function readApiError(
  response: Response,
  responseBody: string,
  data: { error?: string } | null,
  fallbackSuffix = ''
): never {
  const platformCode = getPlatformErrorCode(responseBody);
  throw new Error(
    data?.error ||
      `AI service request failed (HTTP ${response.status}${
        platformCode ? `: ${platformCode}` : ''
      }).${fallbackSuffix}`
  );
}

export async function generateTaskDraft(
  input: GenerateTaskDraftInput
): Promise<TaskDraft> {
  const text = input.text.trim();
  if (!text) throw new Error('Enter some text before asking AI to create a task.');
  if (text.length > 4000) throw new Error('AI task input must be 4,000 characters or fewer.');
  if (input.categories.length === 0) {
    throw new Error('Create a task category before asking AI to draft a task.');
  }

  const accessToken = await getAccessToken(
    'Please sign in before asking AI to draft a task.'
  );

  const response = await fetch('/api/generate-task-draft', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      text,
      categories: input.categories.map(({ id, name, isDefault }) => ({
        id,
        name,
        isDefault: Boolean(isDefault),
      })),
    }),
  });
  const responseBody = await response.text();
  let data: (GenerateTaskDraftResponse & { error?: string }) | null = null;
  try {
    data = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    // Vercel platform errors can be plain text instead of the API's JSON shape.
  }
  if (!response.ok) {
    readApiError(response, responseBody, data, ' Please try again shortly.');
  }
  if (!data?.draft) throw new Error('The AI service returned an empty task draft.');
  return data.draft;
}

export async function generateDashboardCopy(
  input: {
    currentDate: string;
    pendingTasks: number;
    completedTasks: number;
  },
  signal?: AbortSignal
): Promise<DashboardCopy> {
  const accessToken = await getAccessToken('Please sign in before using AI features.');

  const response = await fetch('/api/generate-dashboard-copy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });
  const responseBody = await response.text();
  let data: { copy?: DashboardCopy; error?: string } | null = null;
  try {
    data = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    // Vercel platform errors can be plain text.
  }
  if (!response.ok) {
    readApiError(response, responseBody, data);
  }
  if (!data?.copy) throw new Error('The AI service returned empty dashboard copy.');
  return data.copy;
}

export async function generateAiAssist(
  input: AiAssistRequestPayload,
  signal?: AbortSignal
): Promise<AiAssistResult> {
  const message = input.message.trim();
  if (!message) throw new Error('Describe what you need before asking AI assist.');
  if (message.length > 2000) throw new Error('AI assist input must be 2,000 characters or fewer.');

  const accessToken = await getAccessToken('Please sign in before using AI assist.');

  const response = await fetch('/api/generate-ai-assist', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...input, message }),
    signal,
  });
  const responseBody = await response.text();
  let data: { result?: AiAssistResult; error?: string } | null = null;
  try {
    data = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    // Vercel platform errors can be plain text.
  }
  if (!response.ok) {
    readApiError(response, responseBody, data);
  }
  if (!data?.result?.answer?.trim()) {
    throw new Error('The AI service returned an empty assist result.');
  }
  return data.result;
}
