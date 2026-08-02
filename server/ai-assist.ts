export const AI_ASSIST_MAX_LOOPS = 6;
export const AI_ASSIST_MAX_MESSAGE = 2000;
export const AI_ASSIST_MAX_TASKS = 200;
export const AI_ASSIST_MAX_ANSWER = 6000;
export const QUERY_TODOS_TOOL_NAME = 'query_todos';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const RELATIVE_RANGES = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'all',
] as const;

export type AiAssistPriority = (typeof PRIORITIES)[number];
export type AiAssistRelativeRange = (typeof RELATIVE_RANGES)[number];

export interface AiAssistTaskBrief {
  title: string;
  category: string;
  categoryId?: string;
  priority: AiAssistPriority;
  date: string;
  completed: boolean;
}

export interface AiAssistCategoryBrief {
  id: string;
  name: string;
}

export interface AiAssistRequest {
  message: string;
  timezone: string;
  todayDate: string;
  categories: AiAssistCategoryBrief[];
  tasks: AiAssistTaskBrief[];
}

export interface AiAssistResult {
  answer: string;
  loops: number;
  toolCalls: number;
}

export interface QueryTodosArgs {
  dateFrom?: string;
  dateTo?: string;
  relativeRange?: AiAssistRelativeRange;
  category?: string;
  categoryId?: string;
  priority?: AiAssistPriority;
  completed?: boolean;
  search?: string;
  limit?: number;
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

export interface AssistantChatMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ChatToolCall[];
}

export interface AiAssistToolChatProvider {
  readonly name: string;
  readonly model: string;
  chatWithTools(input: {
    messages: ChatMessage[];
    tools: unknown[];
    maxTokens?: number;
  }): Promise<AssistantChatMessage>;
}

export const QUERY_TODOS_TOOL = {
  type: 'function',
  function: {
    name: QUERY_TODOS_TOOL_NAME,
    description:
      'Query the user todo list with filters. Call this before summarizing or answering questions about tasks. Combine filters as needed.',
    parameters: {
      type: 'object',
      properties: {
        relativeRange: {
          type: 'string',
          enum: [...RELATIVE_RANGES],
          description:
            'Relative date window based on todayDate. Prefer this over raw dates when the user says today/this week/etc. Use all when no date filter is needed.',
        },
        dateFrom: {
          type: 'string',
          description: 'Inclusive start date YYYY-MM-DD. Overrides relativeRange start when both are set.',
        },
        dateTo: {
          type: 'string',
          description: 'Inclusive end date YYYY-MM-DD. Overrides relativeRange end when both are set.',
        },
        category: {
          type: 'string',
          description: 'Category name filter, case-insensitive (e.g. work, personal).',
        },
        categoryId: {
          type: 'string',
          description: 'Exact category id when known from the category list.',
        },
        priority: {
          type: 'string',
          enum: [...PRIORITIES],
          description: 'Filter by priority.',
        },
        completed: {
          type: 'boolean',
          description:
            'true = completed only, false = pending only. Omit to include both.',
        },
        search: {
          type: 'string',
          description: 'Case-insensitive substring match against task title.',
        },
        limit: {
          type: 'integer',
          description: 'Max tasks to return (1-80, default 40).',
        },
      },
      additionalProperties: false,
    },
  },
} as const;

function isPriority(value: unknown): value is AiAssistPriority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

function isRelativeRange(value: unknown): value is AiAssistRelativeRange {
  return typeof value === 'string' && (RELATIVE_RANGES as readonly string[]).includes(value);
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDate(dateStr: string, delta: number): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + delta);
  return formatDate(date);
}

export function getWeekBounds(anchorDate: string): { start: string; end: string } {
  const anchor = parseDate(anchorDate);
  const dayOfWeek = anchor.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatDate(monday), end: formatDate(sunday) };
}

export function resolveRelativeRange(
  todayDate: string,
  relativeRange: AiAssistRelativeRange
): { dateFrom?: string; dateTo?: string } {
  if (relativeRange === 'all') return {};
  if (relativeRange === 'today') return { dateFrom: todayDate, dateTo: todayDate };
  if (relativeRange === 'yesterday') {
    const yesterday = shiftDate(todayDate, -1);
    return { dateFrom: yesterday, dateTo: yesterday };
  }
  if (relativeRange === 'this_week') {
    const bounds = getWeekBounds(todayDate);
    return { dateFrom: bounds.start, dateTo: bounds.end };
  }
  if (relativeRange === 'last_week') {
    const lastWeekAnchor = shiftDate(todayDate, -7);
    const bounds = getWeekBounds(lastWeekAnchor);
    return { dateFrom: bounds.start, dateTo: bounds.end };
  }
  // this_month
  const today = parseDate(todayDate);
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { dateFrom: formatDate(start), dateTo: formatDate(end) };
}

function parseTaskList(value: unknown): AiAssistTaskBrief[] {
  if (!Array.isArray(value)) throw new Error('Invalid AI assist request: tasks.');
  if (value.length > AI_ASSIST_MAX_TASKS) {
    throw new Error(`Too many tasks (max ${AI_ASSIST_MAX_TASKS}).`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid AI assist request: tasks[${index}].`);
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const category = typeof record.category === 'string' ? record.category.trim() : '';
    const categoryId =
      typeof record.categoryId === 'string' ? record.categoryId.trim() : undefined;
    const date = typeof record.date === 'string' ? record.date : '';
    if (
      !title ||
      title.length > 120 ||
      !category ||
      category.length > 64 ||
      !DATE_RE.test(date) ||
      !isPriority(record.priority)
    ) {
      throw new Error(`Invalid AI assist request: tasks[${index}].`);
    }
    return {
      title,
      category,
      categoryId: categoryId || undefined,
      priority: record.priority,
      date,
      completed: Boolean(record.completed),
    };
  });
}

function parseCategories(value: unknown): AiAssistCategoryBrief[] {
  if (!Array.isArray(value)) throw new Error('Invalid AI assist request: categories.');
  if (value.length > 40) throw new Error('Too many categories (max 40).');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid AI assist request: categories[${index}].`);
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!id || !name || name.length > 64) {
      throw new Error(`Invalid AI assist request: categories[${index}].`);
    }
    return { id, name };
  });
}

export function validateAiAssistRequest(value: unknown): AiAssistRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI assist request.');
  const input = value as Record<string, unknown>;
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const timezone = typeof input.timezone === 'string' ? input.timezone.trim() : '';
  const todayDate = typeof input.todayDate === 'string' ? input.todayDate : '';
  if (!message || message.length > AI_ASSIST_MAX_MESSAGE) {
    throw new Error('Invalid AI assist request: message.');
  }
  if (!timezone || timezone.length > 64 || !DATE_RE.test(todayDate)) {
    throw new Error('Invalid AI assist request.');
  }
  return {
    message,
    timezone,
    todayDate,
    categories: parseCategories(input.categories),
    tasks: parseTaskList(input.tasks),
  };
}

export function parseQueryTodosArgs(raw: unknown): QueryTodosArgs {
  let record: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid query_todos arguments.');
      }
      record = parsed as Record<string, unknown>;
    } catch {
      throw new Error('Invalid query_todos arguments.');
    }
  } else if (raw && typeof raw === 'object') {
    record = raw as Record<string, unknown>;
  } else {
    record = {};
  }

  const args: QueryTodosArgs = {};
  if (record.relativeRange !== undefined) {
    if (!isRelativeRange(record.relativeRange)) {
      throw new Error('Invalid query_todos relativeRange.');
    }
    args.relativeRange = record.relativeRange;
  }
  if (record.dateFrom !== undefined) {
    if (typeof record.dateFrom !== 'string' || !DATE_RE.test(record.dateFrom)) {
      throw new Error('Invalid query_todos dateFrom.');
    }
    args.dateFrom = record.dateFrom;
  }
  if (record.dateTo !== undefined) {
    if (typeof record.dateTo !== 'string' || !DATE_RE.test(record.dateTo)) {
      throw new Error('Invalid query_todos dateTo.');
    }
    args.dateTo = record.dateTo;
  }
  if (record.category !== undefined) {
    if (typeof record.category !== 'string' || !record.category.trim()) {
      throw new Error('Invalid query_todos category.');
    }
    args.category = record.category.trim();
  }
  if (record.categoryId !== undefined) {
    if (typeof record.categoryId !== 'string' || !record.categoryId.trim()) {
      throw new Error('Invalid query_todos categoryId.');
    }
    args.categoryId = record.categoryId.trim();
  }
  if (record.priority !== undefined) {
    if (!isPriority(record.priority)) throw new Error('Invalid query_todos priority.');
    args.priority = record.priority;
  }
  if (record.completed !== undefined) {
    if (typeof record.completed !== 'boolean') {
      throw new Error('Invalid query_todos completed.');
    }
    args.completed = record.completed;
  }
  if (record.search !== undefined) {
    if (typeof record.search !== 'string') throw new Error('Invalid query_todos search.');
    args.search = record.search.trim();
  }
  if (record.limit !== undefined) {
    if (typeof record.limit !== 'number' || !Number.isInteger(record.limit)) {
      throw new Error('Invalid query_todos limit.');
    }
    args.limit = Math.min(80, Math.max(1, record.limit));
  }
  return args;
}

function priorityRank(priority: AiAssistPriority): number {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}

export function executeQueryTodos(
  tasks: AiAssistTaskBrief[],
  todayDate: string,
  rawArgs: unknown
): {
  filters: QueryTodosArgs & { dateFrom?: string; dateTo?: string };
  totalMatched: number;
  returned: number;
  tasks: AiAssistTaskBrief[];
} {
  const args = parseQueryTodosArgs(rawArgs);
  let dateFrom = args.dateFrom;
  let dateTo = args.dateTo;
  if (args.relativeRange) {
    const bounds = resolveRelativeRange(todayDate, args.relativeRange);
    dateFrom = args.dateFrom ?? bounds.dateFrom;
    dateTo = args.dateTo ?? bounds.dateTo;
  }

  const categoryNeedle = args.category?.toLowerCase();
  const searchNeedle = args.search?.toLowerCase();
  const limit = args.limit ?? 40;

  const matched = tasks
    .filter((task) => {
      if (dateFrom && task.date < dateFrom) return false;
      if (dateTo && task.date > dateTo) return false;
      if (args.categoryId && task.categoryId !== args.categoryId) return false;
      if (categoryNeedle && task.category.toLowerCase() !== categoryNeedle) return false;
      if (args.priority && task.priority !== args.priority) return false;
      if (args.completed !== undefined && task.completed !== args.completed) return false;
      if (searchNeedle && !task.title.toLowerCase().includes(searchNeedle)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (priorityRank(a.priority) !== priorityRank(b.priority)) {
        return priorityRank(a.priority) - priorityRank(b.priority);
      }
      return a.title.localeCompare(b.title);
    });

  return {
    filters: { ...args, dateFrom, dateTo },
    totalMatched: matched.length,
    returned: Math.min(matched.length, limit),
    tasks: matched.slice(0, limit),
  };
}

export function getAiAssistSystemPrompt(
  request: Pick<AiAssistRequest, 'timezone' | 'todayDate' | 'categories'>
): string {
  const categoryList =
    request.categories.length > 0
      ? request.categories.map((item) => `${item.name} (id:${item.id})`).join(', ')
      : '(none)';
  return [
    'You are a todo assistant for a personal task app.',
    `Timezone: ${request.timezone}. Today: ${request.todayDate}.`,
    `Available categories: ${categoryList}.`,
    'You have one tool: query_todos. Use it to fetch relevant tasks before answering.',
    'When the user mentions a time window (this week, today, etc.) or category/priority, pass those filters to query_todos.',
    'Do not invent tasks. If query_todos returns nothing, say so clearly.',
    'When you have enough data, answer in the user language with clear, copy-ready text. Do not mention tools or AI.',
    'Stop calling tools once you can answer. Final replies must be plain text (no JSON wrapper).',
  ].join('\n');
}

export function buildInitialMessages(request: AiAssistRequest): ChatMessage[] {
  return [
    { role: 'system', content: getAiAssistSystemPrompt(request) },
    { role: 'user', content: request.message },
  ];
}

export async function runAiAssistAgent(
  provider: AiAssistToolChatProvider,
  request: AiAssistRequest
): Promise<AiAssistResult> {
  const messages = buildInitialMessages(request);
  let loops = 0;
  let toolCalls = 0;

  for (let i = 0; i < AI_ASSIST_MAX_LOOPS; i += 1) {
    loops += 1;
    const assistant = await provider.chatWithTools({
      messages,
      tools: [QUERY_TODOS_TOOL],
      maxTokens: 1600,
    });

    const calls = assistant.tool_calls?.filter(
      (call) => call.type === 'function' && call.function?.name
    );

    if (!calls?.length) {
      const answer = (assistant.content || '').trim();
      if (!answer) throw new Error('AI returned an empty assist result.');
      if (answer.length > AI_ASSIST_MAX_ANSWER) {
        throw new Error('AI returned an assist result that is too long.');
      }
      return { answer, loops, toolCalls };
    }

    messages.push({
      role: 'assistant',
      content: assistant.content,
      tool_calls: calls,
    });

    for (const call of calls) {
      toolCalls += 1;
      let content: string;
      try {
        if (call.function.name !== QUERY_TODOS_TOOL_NAME) {
          content = JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
        } else {
          content = JSON.stringify(
            executeQueryTodos(request.tasks, request.todayDate, call.function.arguments)
          );
        }
      } catch (error) {
        content = JSON.stringify({
          error: error instanceof Error ? error.message : 'Tool execution failed.',
        });
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content,
      });
    }
  }

  throw new Error('AI assist stopped after the maximum number of tool loops.');
}
