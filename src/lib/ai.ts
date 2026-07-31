import { Category, TaskDraft } from '../types';
import type { WeeklySummaryPayload } from '../utils/week';
import { supabase } from './supabase';

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

export interface DashboardCopy {
  title: string;
  subtitle: string;
}

interface CachedDashboardCopy extends DashboardCopy {
  date: string;
}

const DASHBOARD_COPY_STORAGE_KEY = 'daily_todos_dashboard_copy_v1';

function getPlatformErrorCode(body: string): string | undefined {
  return body.match(/\b(?:FUNCTION|EDGE_FUNCTION)_[A-Z0-9_]+\b/)?.[0];
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

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in before asking AI to draft a task.');

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
    const platformCode = getPlatformErrorCode(responseBody);
    throw new Error(
      data?.error ||
        `AI service request failed (HTTP ${response.status}${
          platformCode ? `: ${platformCode}` : ''
        }). Please try again shortly.`
    );
  }
  if (!data?.draft) throw new Error('The AI service returned an empty task draft.');
  return data.draft;
}

export function loadCachedDashboardCopy(date: string): DashboardCopy | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_COPY_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedDashboardCopy;
    if (
      cached.date !== date ||
      typeof cached.title !== 'string' ||
      !cached.title.trim() ||
      cached.title.length > 60 ||
      typeof cached.subtitle !== 'string' ||
      !cached.subtitle.trim() ||
      cached.subtitle.length > 120
    ) {
      return null;
    }
    return { title: cached.title, subtitle: cached.subtitle };
  } catch {
    return null;
  }
}

export function saveCachedDashboardCopy(date: string, copy: DashboardCopy): void {
  try {
    localStorage.setItem(
      DASHBOARD_COPY_STORAGE_KEY,
      JSON.stringify({ date, ...copy } satisfies CachedDashboardCopy)
    );
  } catch (error) {
    console.warn('Failed to cache dashboard copy', error);
  }
}

export async function generateDashboardCopy(
  input: {
    currentDate: string;
    pendingTasks: number;
    completedTasks: number;
  },
  signal?: AbortSignal
): Promise<DashboardCopy> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in before using AI features.');

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
    const platformCode = getPlatformErrorCode(responseBody);
    throw new Error(
      data?.error ||
        `AI service request failed (HTTP ${response.status}${
          platformCode ? `: ${platformCode}` : ''
        }).`
    );
  }
  if (!data?.copy) throw new Error('The AI service returned empty dashboard copy.');
  return data.copy;
}

export interface WeeklySummaryResult {
  title: string;
  overview: string;
  completedHighlights: string[];
  unfinishedItems: string[];
  risksOrBlockers: string[];
  nextWeekFocus: string[];
  minutesText: string;
}

export async function generateWeeklySummary(
  input: WeeklySummaryPayload,
  signal?: AbortSignal
): Promise<WeeklySummaryResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('请先登录后再生成周会纪要。');

  const response = await fetch('/api/generate-weekly-summary', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });
  const responseBody = await response.text();
  let data: { summary?: WeeklySummaryResult; error?: string } | null = null;
  try {
    data = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    // Vercel platform errors can be plain text.
  }
  if (!response.ok) {
    const platformCode = getPlatformErrorCode(responseBody);
    throw new Error(
      data?.error ||
        `AI service request failed (HTTP ${response.status}${
          platformCode ? `: ${platformCode}` : ''
        }).`
    );
  }
  if (!data?.summary) throw new Error('AI 未返回周会纪要内容。');
  return data.summary;
}
