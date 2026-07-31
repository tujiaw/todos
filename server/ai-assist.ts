import {
  buildWeeklySummaryPrompt,
  validateWeeklySummaryRequest,
  validateWeeklySummaryResult,
  type WeeklySummaryRequest,
  type WeeklySummaryResult,
} from './weekly-summary.js';

export const AI_ASSIST_MODES = [
  'weekly_minutes',
  'today_focus',
  'daily_standup',
  'backlog_triage',
] as const;

export type AiAssistMode = (typeof AI_ASSIST_MODES)[number];

export interface AiAssistTaskBrief {
  title: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  date: string;
  completed?: boolean;
}

export interface AiAssistSection {
  heading: string;
  items: string[];
}

export interface AiAssistResult {
  title: string;
  overview: string;
  sections: AiAssistSection[];
  copyText: string;
}

export interface AiAssistDayRequest {
  mode: Exclude<AiAssistMode, 'weekly_minutes'>;
  timezone: string;
  focusDate: string;
  todayDate: string;
  pendingTasks: AiAssistTaskBrief[];
  completedTasks: AiAssistTaskBrief[];
}

export type AiAssistRequest =
  | ({ mode: 'weekly_minutes' } & WeeklySummaryRequest)
  | AiAssistDayRequest;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TASKS = 40;
const MAX_TITLE = 80;
const MAX_COPY = 4500;

function isMode(value: unknown): value is AiAssistMode {
  return typeof value === 'string' && (AI_ASSIST_MODES as readonly string[]).includes(value);
}

function isPriority(value: unknown): value is AiAssistTaskBrief['priority'] {
  return value === 'low' || value === 'medium' || value === 'high';
}

function parseTaskList(value: unknown, field: string): AiAssistTaskBrief[] {
  if (!Array.isArray(value)) throw new Error(`Invalid AI assist request: ${field}.`);
  if (value.length > MAX_TASKS) throw new Error(`Too many ${field} (max ${MAX_TASKS}).`);
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid AI assist request: ${field}[${index}].`);
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const category = typeof record.category === 'string' ? record.category.trim() : '';
    const date = typeof record.date === 'string' ? record.date : '';
    if (!title || title.length > MAX_TITLE || !category || !DATE_RE.test(date) || !isPriority(record.priority)) {
      throw new Error(`Invalid AI assist request: ${field}[${index}].`);
    }
    return {
      title,
      category,
      priority: record.priority,
      date,
      completed: Boolean(record.completed),
    };
  });
}

function parseDayRequest(input: Record<string, unknown>): AiAssistDayRequest {
  const mode = input.mode;
  if (mode !== 'today_focus' && mode !== 'daily_standup' && mode !== 'backlog_triage') {
    throw new Error('Invalid AI assist request: mode.');
  }
  const timezone = typeof input.timezone === 'string' ? input.timezone.trim() : '';
  const focusDate = typeof input.focusDate === 'string' ? input.focusDate : '';
  const todayDate = typeof input.todayDate === 'string' ? input.todayDate : '';
  if (!timezone || timezone.length > 64 || !DATE_RE.test(focusDate) || !DATE_RE.test(todayDate)) {
    throw new Error('Invalid AI assist request.');
  }
  return {
    mode,
    timezone,
    focusDate,
    todayDate,
    pendingTasks: parseTaskList(input.pendingTasks, 'pendingTasks'),
    completedTasks: parseTaskList(input.completedTasks, 'completedTasks'),
  };
}

export function validateAiAssistRequest(value: unknown): AiAssistRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI assist request.');
  const input = value as Record<string, unknown>;
  if (!isMode(input.mode)) throw new Error('Invalid AI assist request: mode.');
  if (input.mode === 'weekly_minutes') {
    const weekly = validateWeeklySummaryRequest(input);
    return { mode: 'weekly_minutes', ...weekly };
  }
  return parseDayRequest(input);
}

function parseSections(value: unknown): AiAssistSection[] {
  if (!Array.isArray(value)) throw new Error('AI returned invalid sections.');
  return value
    .slice(0, 6)
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`AI returned invalid sections[${index}].`);
      }
      const record = item as Record<string, unknown>;
      const heading = typeof record.heading === 'string' ? record.heading.trim() : '';
      if (!heading || heading.length > 40 || !Array.isArray(record.items)) {
        throw new Error(`AI returned invalid sections[${index}].`);
      }
      const items = record.items
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 8);
      for (const entry of items) {
        if (entry.length > 200) throw new Error(`AI returned invalid sections[${index}].`);
      }
      return { heading, items };
    })
    .filter((section) => section.items.length > 0);
}

export function validateAiAssistResult(value: unknown): AiAssistResult {
  if (!value || typeof value !== 'object') throw new Error('AI returned invalid assist result.');
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const overview = typeof record.overview === 'string' ? record.overview.trim() : '';
  const copyText = typeof record.copyText === 'string' ? record.copyText.trim() : '';
  if (!title || title.length > 80) throw new Error('AI returned invalid assist result.');
  if (!overview || overview.length > 280) throw new Error('AI returned invalid assist result.');
  if (!copyText || copyText.length > MAX_COPY) throw new Error('AI returned invalid assist result.');
  return {
    title,
    overview,
    sections: parseSections(record.sections),
    copyText,
  };
}

function weeklyResultToAssist(result: WeeklySummaryResult): AiAssistResult {
  const sections: AiAssistSection[] = [
    { heading: 'Completed', items: result.completedHighlights },
    { heading: 'Follow-ups', items: result.unfinishedItems },
    { heading: 'Risks', items: result.risksOrBlockers },
    { heading: 'Next week', items: result.nextWeekFocus },
  ].filter((section) => section.items.length > 0);

  return {
    title: result.title,
    overview: result.overview,
    sections,
    copyText: result.minutesText,
  };
}

export function buildAiAssistPrompt(request: AiAssistRequest): string {
  if (request.mode === 'weekly_minutes') {
    return [
      buildWeeklySummaryPrompt(request),
      '额外要求：除 minutesText 外，仍按周会纪要 JSON 字段返回（title/overview/completedHighlights/unfinishedItems/risksOrBlockers/nextWeekFocus/minutesText）。',
    ].join('\n');
  }

  const shared = [
    `时区：${request.timezone}`,
    `关注日：${request.focusDate}`,
    `今天：${request.todayDate}`,
    `待办：${JSON.stringify(request.pendingTasks)}`,
    `已完成：${JSON.stringify(request.completedTasks)}`,
    '返回 JSON：title, overview, sections[{heading, items}], copyText。',
    'title ≤ 80 字；overview ≤ 280 字；sections 最多 6 组，每组最多 8 条；copyText 为可直接粘贴的中文纯文本。',
    '不要编造任务；不要提到 AI；不要用 markdown 代码块。',
  ];

  if (request.mode === 'today_focus') {
    return [
      '你是务实的执行助理。根据待办给出今日优先清单。',
      ...shared,
      'sections 建议：Top priorities / Later today / Can wait。',
      'copyText 用中文，含「今日焦点」「建议顺序」「可延后」三段。',
    ].join('\n');
  }

  if (request.mode === 'daily_standup') {
    return [
      '你是团队站会助理。根据任务写可口述的日报/站会简报。',
      ...shared,
      'sections 建议：Done / Doing / Next / Blockers。',
      'copyText 用中文，适合晨会口述，简洁分点。',
    ].join('\n');
  }

  return [
    '你是待办分拣助理。对积压事项给出保留/延后/砍掉建议。',
    ...shared,
    'sections 建议：Do now / Defer / Consider dropping。',
    'copyText 用中文，语气克制，适合复盘清理。',
  ].join('\n');
}

export function getAiAssistSystemPrompt(mode: AiAssistMode): string {
  if (mode === 'weekly_minutes') {
    return '你撰写简洁、可直接用于周会的中文工作纪要。只返回一个合法 JSON 对象，不要 markdown。';
  }
  return '你提供简洁实用的待办建议。只返回一个合法 JSON 对象，不要 markdown。';
}

export function normalizeAiAssistOutput(
  mode: AiAssistMode,
  raw: unknown
): AiAssistResult {
  if (mode === 'weekly_minutes') {
    return weeklyResultToAssist(validateWeeklySummaryResult(raw));
  }
  return validateAiAssistResult(raw);
}

export function getAiAssistMaxTokens(mode: AiAssistMode): number {
  return mode === 'weekly_minutes' ? 2200 : 1400;
}
