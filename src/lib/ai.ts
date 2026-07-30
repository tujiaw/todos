import { Category, TaskDraft } from '../types';
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
  const data = (await response.json().catch(() => null)) as GenerateTaskDraftResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data?.error || 'AI task drafting is unavailable.');
  }
  if (!data?.draft) throw new Error('The AI service returned an empty task draft.');
  return data.draft;
}
