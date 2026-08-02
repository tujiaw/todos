import { Category, Priority, Task } from '../types';

export interface AiAssistTaskBrief {
  title: string;
  category: string;
  categoryId: string;
  priority: Priority;
  date: string;
  completed: boolean;
}

export interface AiAssistCategoryBrief {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface AiAssistCreatedTask {
  title: string;
  description?: string;
  date: string;
  dueTime?: string;
  estimatedMinutes?: number;
  categoryId: string;
  category: string;
  priority: Priority;
  subtasks: string[];
}

export interface AiAssistRequestPayload {
  message: string;
  timezone: string;
  todayDate: string;
  selectedDate: string;
  categories: AiAssistCategoryBrief[];
  tasks: AiAssistTaskBrief[];
}

export interface AiAssistResult {
  answer: string;
  loops?: number;
  toolCalls?: number;
  createdTasks?: AiAssistCreatedTask[];
}

export interface AiAssistChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdTasks?: AiAssistCreatedTask[];
  error?: boolean;
}

export interface AiAssistSuggestion {
  id: string;
  label: string;
  hint: string;
  prompt: string;
}

export function createAiAssistMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_TASKS = 200;
const MAX_TITLE = 120;

function truncateTitle(title: string): string {
  const trimmed = title.trim() || 'Untitled task';
  if (trimmed.length <= MAX_TITLE) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE - 1)}…`;
}

export function buildAiAssistCatalog(
  tasks: Task[],
  categories: Category[]
): { categories: AiAssistCategoryBrief[]; tasks: AiAssistTaskBrief[] } {
  const categoryBriefs = categories.map((item) => ({
    id: item.id,
    name: item.name,
    isDefault: Boolean(item.isDefault),
  }));
  const categoryNameById = new Map(categories.map((item) => [item.id, item.name]));

  const briefs = [...tasks]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_TASKS)
    .map((task) => ({
      title: truncateTitle(task.title),
      category: categoryNameById.get(task.categoryId) || 'Uncategorized',
      categoryId: task.categoryId,
      priority: task.priority,
      date: task.date,
      completed: task.completed,
    }));

  return { categories: categoryBriefs, tasks: briefs };
}

export function getAiAssistSuggestions(options?: {
  selectedDate?: string;
  todayDate?: string;
}): AiAssistSuggestion[] {
  const focusDate = options?.selectedDate;
  const today = options?.todayDate;
  const focusLabel =
    focusDate && today && focusDate === today
      ? 'today'
      : focusDate
        ? focusDate
        : 'today';

  return [
    {
      id: 'create_task',
      label: 'Create task',
      hint: 'Natural language → task',
      prompt:
        'Create a task for tomorrow afternoon: prepare the weekly work report, high priority, category work, with subtasks collect data and draft slides.',
    },
    {
      id: 'weekly_minutes',
      label: 'Weekly summary',
      hint: 'This week overview',
      prompt:
        'Summarize this week’s tasks as meeting-ready weekly minutes. Group by category when helpful.',
    },
    {
      id: 'today_focus',
      label: "Today's focus",
      hint: 'What to do first',
      prompt: `What should I focus on for ${focusLabel}? Prioritize high-priority pending tasks and suggest an order.`,
    },
    {
      id: 'daily_standup',
      label: 'Daily standup',
      hint: 'Short briefing',
      prompt:
        'Write a short daily standup: done recently, doing now, next, and any high-priority risks.',
    },
    {
      id: 'backlog_triage',
      label: 'Backlog triage',
      hint: 'Keep, defer, or drop',
      prompt:
        'Triage my open backlog: what to do now, what to defer, and what to consider dropping.',
    },
    {
      id: 'week_work',
      label: 'This week · Work',
      hint: 'Work category only',
      prompt: 'Summarize this week’s work items (category: work). Include completed and pending.',
    },
  ];
}
