import { Category, Priority, Task } from '../types';

export function getWeekDays(anchorDateStr: string): string[] {
  const anchor = new Date(`${anchorDateStr}T00:00:00`);
  const dayOfWeek = anchor.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);

  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

export function formatWeekRangeLabel(startDate: string, endDate: string): string {
  return `${startDate} ~ ${endDate}`;
}

export interface WeeklyTaskBrief {
  title: string;
  category: string;
  priority: Priority;
  date: string;
}

export interface WeeklyCategoryStat {
  name: string;
  total: number;
  completed: number;
  pending: number;
}

export interface WeeklySummaryStats {
  total: number;
  completed: number;
  pending: number;
  completionRate: number;
  byCategory: WeeklyCategoryStat[];
  pendingByPriority: Record<Priority, number>;
}

export interface WeeklySummaryPayload {
  startDate: string;
  endDate: string;
  periodLabel: string;
  timezone: string;
  stats: WeeklySummaryStats;
  completedTasks: WeeklyTaskBrief[];
  pendingTasks: WeeklyTaskBrief[];
}

const MAX_TASK_ITEMS = 40;
const MAX_TITLE_LENGTH = 80;

function truncateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LENGTH - 1)}…`;
}

function toBrief(task: Task, categories: Category[]): WeeklyTaskBrief {
  const category = categories.find((c) => c.id === task.categoryId);
  return {
    title: truncateTitle(task.title || '未命名任务'),
    category: category?.name || '未分类',
    priority: task.priority,
    date: task.date,
  };
}

export function buildWeeklySummaryPayload(
  tasks: Task[],
  categories: Category[],
  anchorDate: string,
  timezone = 'Asia/Shanghai'
): WeeklySummaryPayload {
  const weekDays = getWeekDays(anchorDate);
  const startDate = weekDays[0];
  const endDate = weekDays[6];
  const weekTaskSet = new Set(weekDays);
  const weekTasks = tasks.filter((task) => weekTaskSet.has(task.date));

  const completed = weekTasks.filter((task) => task.completed);
  const pending = weekTasks.filter((task) => !task.completed);
  const total = weekTasks.length;
  const completedCount = completed.length;
  const pendingCount = pending.length;
  const completionRate = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  const categoryMap = new Map<string, WeeklyCategoryStat>();
  for (const task of weekTasks) {
    const name = categories.find((c) => c.id === task.categoryId)?.name || '未分类';
    const current = categoryMap.get(name) || {
      name,
      total: 0,
      completed: 0,
      pending: 0,
    };
    current.total += 1;
    if (task.completed) current.completed += 1;
    else current.pending += 1;
    categoryMap.set(name, current);
  }

  const pendingByPriority: Record<Priority, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const task of pending) {
    pendingByPriority[task.priority] += 1;
  }

  const sortByPriorityThenDate = (a: WeeklyTaskBrief, b: WeeklyTaskBrief) => {
    const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    if (order[a.priority] !== order[b.priority]) {
      return order[a.priority] - order[b.priority];
    }
    return a.date.localeCompare(b.date);
  };

  const completedTasks = completed
    .map((task) => toBrief(task, categories))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_TASK_ITEMS);
  const pendingTasks = pending
    .map((task) => toBrief(task, categories))
    .sort(sortByPriorityThenDate)
    .slice(0, MAX_TASK_ITEMS);

  return {
    startDate,
    endDate,
    periodLabel: formatWeekRangeLabel(startDate, endDate),
    timezone,
    stats: {
      total,
      completed: completedCount,
      pending: pendingCount,
      completionRate,
      byCategory: Array.from(categoryMap.values()).sort((a, b) => b.total - a.total),
      pendingByPriority,
    },
    completedTasks,
    pendingTasks,
  };
}

function priorityLabel(priority: Priority): string {
  if (priority === 'high') return '高';
  if (priority === 'medium') return '中';
  return '低';
}

/** Local fallback minutes when AI is unavailable — still usable in meetings. */
export function buildLocalWeeklyMinutes(payload: WeeklySummaryPayload): string {
  const { periodLabel, stats, completedTasks, pendingTasks } = payload;
  const lines: string[] = [
    `工作周报（${periodLabel}）`,
    '',
    '一、本周概况',
    `本周共 ${stats.total} 项任务，已完成 ${stats.completed} 项，未完成 ${stats.pending} 项，完成率 ${stats.completionRate}%。`,
    '',
    '二、已完成事项',
  ];

  if (completedTasks.length === 0) {
    lines.push('- （无）');
  } else {
    for (const task of completedTasks) {
      lines.push(`- [${task.date}] ${task.title}（${task.category}）`);
    }
  }

  lines.push('', '三、未完成 / 待跟进');
  if (pendingTasks.length === 0) {
    lines.push('- （无）');
  } else {
    for (const task of pendingTasks) {
      lines.push(
        `- [${task.date}] ${task.title}（${task.category} · 优先级${priorityLabel(task.priority)}）`
      );
    }
  }

  lines.push('', '四、分类进展');
  if (stats.byCategory.length === 0) {
    lines.push('- （本周暂无任务）');
  } else {
    for (const category of stats.byCategory) {
      lines.push(
        `- ${category.name}：${category.completed}/${category.total}（待办 ${category.pending}）`
      );
    }
  }

  lines.push('', '五、下周关注');
  if (pendingTasks.length === 0) {
    lines.push('- 保持节奏，按需规划下周重点事项。');
  } else {
    const topPending = pendingTasks.slice(0, 5);
    for (const task of topPending) {
      lines.push(`- 跟进：${task.title}`);
    }
  }

  return lines.join('\n');
}
