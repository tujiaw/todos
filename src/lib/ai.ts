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
        ? '登录状态已失效或过期，请重新登录。'
        : signInMessage
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(
    session.access_token
  );
  if (userError || !userData.user || userData.user.is_anonymous) {
    throw new Error('登录状态已失效或过期，请重新登录。');
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
      `智能服务请求失败（HTTP ${response.status}${
        platformCode ? `: ${platformCode}` : ''
      }).${fallbackSuffix}`
  );
}

export async function generateTaskDraft(
  input: GenerateTaskDraftInput
): Promise<TaskDraft> {
  const text = input.text.trim();
  if (!text) throw new Error('请输入内容，再让智能助手创建任务。');
  if (text.length > 4000) throw new Error('任务输入内容不能超过 4,000 个字符。');
  if (input.categories.length === 0) {
    throw new Error('请先创建任务分类。');
  }

  const accessToken = await getAccessToken(
    '请登录后生成任务草稿。'
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
    readApiError(response, responseBody, data, ' 请稍后重试。');
  }
  if (!data?.draft) throw new Error('智能服务返回了空的任务草稿。');
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
  const accessToken = await getAccessToken('请登录后使用智能功能。');

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
  if (!data?.copy) throw new Error('智能服务返回了空的首页文案。');
  return data.copy;
}

export async function generateAiAssist(
  input: AiAssistRequestPayload,
  signal?: AbortSignal
): Promise<AiAssistResult> {
  const message = input.message.trim();
  if (!message) throw new Error('请先描述你的需求。');
  if (message.length > 2000) throw new Error('输入内容不能超过 2,000 个字符。');

  const accessToken = await getAccessToken('请登录后使用智能助手。');

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
    throw new Error('智能助手返回了空的结果。');
  }
  return data.result;
}
