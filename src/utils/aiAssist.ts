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

export type AiAssistLanguage = 'zh' | 'en';

export interface AiAssistRequestPayload {
  message: string;
  timezone: string;
  todayDate: string;
  selectedDate: string;
  language: AiAssistLanguage;
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
  stopped?: boolean;
}

export interface AiAssistSuggestion {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  /** When true, clicking the chip sends immediately instead of only filling the input. */
  sendOnClick?: boolean;
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
  language?: AiAssistLanguage;
}): AiAssistSuggestion[] {
  const focusDate = options?.selectedDate;
  const today = options?.todayDate;
  const language = options?.language === 'en' ? 'en' : 'zh';
  const isToday = Boolean(focusDate && today && focusDate === today);

  if (language === 'zh') {
    const focusLabel = isToday ? '今天' : focusDate || '今天';
    const createStub = isToday ? '今天创建一个任务：' : `在 ${focusLabel} 创建一个任务：`;
    return [
      {
        id: 'create_task',
        label: '创建任务',
        hint: '补全内容后发送',
        prompt: createStub,
      },
      {
        id: 'today_focus',
        label: isToday ? '今日焦点' : '当日焦点',
        hint: '优先做什么',
        prompt: `${focusLabel}我应该优先做什么？按高优先级未完成任务给出顺序建议。`,
        sendOnClick: true,
      },
      {
        id: 'weekly_minutes',
        label: '本周总结',
        hint: '周会纪要',
        prompt: '总结本周任务，写成可直接用于周会的纪要。可按分类整理。',
        sendOnClick: true,
      },
      {
        id: 'daily_standup',
        label: '每日站会',
        hint: '简短汇报',
        prompt: '写一段简短的每日站会：最近完成、正在做、下一步，以及高优先级风险。',
        sendOnClick: true,
      },
    ];
  }

  const focusLabel = isToday ? 'today' : focusDate || 'today';
  const createStub = isToday
    ? 'Create a task today: '
    : `Create a task on ${focusLabel}: `;

  return [
    {
      id: 'create_task',
      label: 'Create task',
      hint: 'Fill in what to create, then Send',
      prompt: createStub,
    },
    {
      id: 'today_focus',
      label: isToday ? "Today's focus" : 'Day focus',
      hint: 'Prioritized next steps',
      prompt: `What should I focus on for ${focusLabel}? Prioritize high-priority pending tasks and suggest an order.`,
      sendOnClick: true,
    },
    {
      id: 'weekly_minutes',
      label: 'Weekly summary',
      hint: 'This week overview',
      prompt:
        'Summarize this week’s tasks as meeting-ready weekly minutes. Group by category when helpful.',
      sendOnClick: true,
    },
    {
      id: 'daily_standup',
      label: 'Daily standup',
      hint: 'Short briefing',
      prompt:
        'Write a short daily standup: done recently, doing now, next, and any high-priority risks.',
      sendOnClick: true,
    },
  ];
}
