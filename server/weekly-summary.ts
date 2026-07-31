export interface WeeklyTaskBrief {
  title: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  date: string;
}

export interface WeeklyCategoryStat {
  name: string;
  total: number;
  completed: number;
  pending: number;
}

export interface WeeklySummaryRequest {
  startDate: string;
  endDate: string;
  periodLabel: string;
  timezone: string;
  stats: {
    total: number;
    completed: number;
    pending: number;
    completionRate: number;
    byCategory: WeeklyCategoryStat[];
    pendingByPriority: {
      high: number;
      medium: number;
      low: number;
    };
  };
  completedTasks: WeeklyTaskBrief[];
  pendingTasks: WeeklyTaskBrief[];
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TASKS = 40;
const MAX_TITLE = 80;
const MAX_LIST = 8;
const MAX_MINUTES = 4500;

function isPriority(value: unknown): value is WeeklyTaskBrief['priority'] {
  return value === 'low' || value === 'medium' || value === 'high';
}

function parseTaskList(value: unknown, field: string): WeeklyTaskBrief[] {
  if (!Array.isArray(value)) throw new Error(`Invalid weekly summary request: ${field}.`);
  if (value.length > MAX_TASKS) throw new Error(`Too many ${field} (max ${MAX_TASKS}).`);
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid weekly summary request: ${field}[${index}].`);
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const category = typeof record.category === 'string' ? record.category.trim() : '';
    const date = typeof record.date === 'string' ? record.date : '';
    if (!title || title.length > MAX_TITLE || !category || !DATE_RE.test(date) || !isPriority(record.priority)) {
      throw new Error(`Invalid weekly summary request: ${field}[${index}].`);
    }
    return {
      title,
      category,
      priority: record.priority,
      date,
    };
  });
}

function parseCategoryStats(value: unknown): WeeklyCategoryStat[] {
  if (!Array.isArray(value)) throw new Error('Invalid weekly summary request: byCategory.');
  if (value.length > 30) throw new Error('Too many categories.');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid weekly summary request: byCategory[${index}].`);
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const total = Number.isInteger(record.total) ? Number(record.total) : -1;
    const completed = Number.isInteger(record.completed) ? Number(record.completed) : -1;
    const pending = Number.isInteger(record.pending) ? Number(record.pending) : -1;
    if (!name || total < 0 || completed < 0 || pending < 0 || total > 999) {
      throw new Error(`Invalid weekly summary request: byCategory[${index}].`);
    }
    return { name, total, completed, pending };
  });
}

export function validateWeeklySummaryRequest(value: unknown): WeeklySummaryRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid weekly summary request.');
  }
  const input = value as Record<string, unknown>;
  const startDate = typeof input.startDate === 'string' ? input.startDate : '';
  const endDate = typeof input.endDate === 'string' ? input.endDate : '';
  const periodLabel = typeof input.periodLabel === 'string' ? input.periodLabel.trim() : '';
  const timezone = typeof input.timezone === 'string' ? input.timezone.trim() : '';
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || !periodLabel || !timezone) {
    throw new Error('Invalid weekly summary request.');
  }
  if (periodLabel.length > 64 || timezone.length > 64) {
    throw new Error('Invalid weekly summary request.');
  }
  if (!input.stats || typeof input.stats !== 'object') {
    throw new Error('Invalid weekly summary request: stats.');
  }
  const stats = input.stats as Record<string, unknown>;
  const total = Number.isInteger(stats.total) ? Number(stats.total) : -1;
  const completed = Number.isInteger(stats.completed) ? Number(stats.completed) : -1;
  const pending = Number.isInteger(stats.pending) ? Number(stats.pending) : -1;
  const completionRate = Number.isInteger(stats.completionRate)
    ? Number(stats.completionRate)
    : -1;
  if (
    total < 0 ||
    total > 999 ||
    completed < 0 ||
    pending < 0 ||
    completionRate < 0 ||
    completionRate > 100
  ) {
    throw new Error('Invalid weekly summary request: stats.');
  }
  if (!stats.pendingByPriority || typeof stats.pendingByPriority !== 'object') {
    throw new Error('Invalid weekly summary request: pendingByPriority.');
  }
  const pendingByPriority = stats.pendingByPriority as Record<string, unknown>;
  const high = Number.isInteger(pendingByPriority.high) ? Number(pendingByPriority.high) : -1;
  const medium = Number.isInteger(pendingByPriority.medium)
    ? Number(pendingByPriority.medium)
    : -1;
  const low = Number.isInteger(pendingByPriority.low) ? Number(pendingByPriority.low) : -1;
  if (high < 0 || medium < 0 || low < 0) {
    throw new Error('Invalid weekly summary request: pendingByPriority.');
  }

  return {
    startDate,
    endDate,
    periodLabel,
    timezone,
    stats: {
      total,
      completed,
      pending,
      completionRate,
      byCategory: parseCategoryStats(stats.byCategory),
      pendingByPriority: { high, medium, low },
    },
    completedTasks: parseTaskList(input.completedTasks, 'completedTasks'),
    pendingTasks: parseTaskList(input.pendingTasks, 'pendingTasks'),
  };
}

function parseStringList(value: unknown, field: string, max = MAX_LIST): string[] {
  if (!Array.isArray(value)) throw new Error(`AI returned invalid ${field}.`);
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
  for (const item of items) {
    if (item.length > 200) throw new Error(`AI returned invalid ${field}.`);
  }
  return items;
}

export function validateWeeklySummaryResult(value: unknown): WeeklySummaryResult {
  if (!value || typeof value !== 'object') {
    throw new Error('AI returned invalid weekly summary.');
  }
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const overview = typeof record.overview === 'string' ? record.overview.trim() : '';
  const minutesText =
    typeof record.minutesText === 'string' ? record.minutesText.trim() : '';

  if (!title || title.length > 80) throw new Error('AI returned invalid weekly summary.');
  if (!overview || overview.length > 280) throw new Error('AI returned invalid weekly summary.');
  if (!minutesText || minutesText.length > MAX_MINUTES) {
    throw new Error('AI returned invalid weekly summary.');
  }

  return {
    title,
    overview,
    completedHighlights: parseStringList(record.completedHighlights, 'completedHighlights'),
    unfinishedItems: parseStringList(record.unfinishedItems, 'unfinishedItems'),
    risksOrBlockers: parseStringList(record.risksOrBlockers, 'risksOrBlockers', 5),
    nextWeekFocus: parseStringList(record.nextWeekFocus, 'nextWeekFocus', 5),
    minutesText,
  };
}

export function buildWeeklySummaryPrompt(request: WeeklySummaryRequest): string {
  return [
    '你是一名务实的产品/项目助理，根据待办数据撰写可直接用于周会的工作纪要。',
    '要求：中文、简洁、客观、可粘贴到会议纪要；不要编造数据中不存在的事项；不要提到 AI。',
    `周期：${request.periodLabel}（${request.startDate} 至 ${request.endDate}，时区 ${request.timezone}）`,
    `统计：总数 ${request.stats.total}，已完成 ${request.stats.completed}，未完成 ${request.stats.pending}，完成率 ${request.stats.completionRate}%`,
    `未完成优先级：高 ${request.stats.pendingByPriority.high}，中 ${request.stats.pendingByPriority.medium}，低 ${request.stats.pendingByPriority.low}`,
    `分类进展：${JSON.stringify(request.stats.byCategory)}`,
    `已完成任务：${JSON.stringify(request.completedTasks)}`,
    `未完成任务：${JSON.stringify(request.pendingTasks)}`,
    '返回一个 JSON 对象，字段如下：',
    '- title: 纪要标题，含周期，不超过 80 字',
    '- overview: 1-2 句本周概况，不超过 280 字',
    '- completedHighlights: 已完成亮点字符串数组，最多 8 条',
    '- unfinishedItems: 待跟进事项字符串数组，最多 8 条',
    '- risksOrBlockers: 风险/阻塞字符串数组，最多 5 条；没有则空数组',
    '- nextWeekFocus: 下周关注点字符串数组，最多 5 条',
    '- minutesText: 完整周会纪要纯文本，使用以下五段标题（用中文数字）：一、本周概况 二、已完成事项 三、未完成 / 待跟进 四、风险与阻塞 五、下周计划；用短横线列表；不要 markdown 代码块',
    '若本周没有任何任务，如实说明，并给出简短的下周规划建议。',
  ].join('\n');
}
