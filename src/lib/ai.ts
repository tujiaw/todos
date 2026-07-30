import { FunctionsHttpError } from '@supabase/supabase-js';
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

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (typeof payload?.error === 'string') return payload.error;
    } catch {
      // Fall through to the SDK error when the response body is not JSON.
    }
  }

  return error instanceof Error ? error.message : 'AI task drafting is unavailable.';
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

  const { data, error } = await supabase.functions.invoke<GenerateTaskDraftResponse>(
    'generate-task-draft',
    {
      body: {
        ...input,
        text,
        categories: input.categories.map(({ id, name, isDefault }) => ({
          id,
          name,
          isDefault: Boolean(isDefault),
        })),
      },
    }
  );

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data?.draft) throw new Error('The AI service returned an empty task draft.');
  return data.draft;
}
