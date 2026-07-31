import { Category, Priority, Task } from '../types';
import {
  buildLocalWeeklyMinutes,
  buildWeeklySummaryPayload,
  type WeeklySummaryPayload,
} from './week';

export type AiAssistMode =
  | 'weekly_minutes'
  | 'today_focus'
  | 'daily_standup'
  | 'backlog_triage';

export interface AiAssistTaskBrief {
  title: string;
  category: string;
  priority: Priority;
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

export interface AiAssistDayPayload {
  mode: Exclude<AiAssistMode, 'weekly_minutes'>;
  timezone: string;
  focusDate: string;
  todayDate: string;
  pendingTasks: AiAssistTaskBrief[];
  completedTasks: AiAssistTaskBrief[];
}

export type AiAssistPayload =
  | ({ mode: 'weekly_minutes' } & WeeklySummaryPayload)
  | AiAssistDayPayload;

const MAX_TASKS = 40;
const MAX_TITLE = 80;

function truncateTitle(title: string): string {
  const trimmed = title.trim() || 'Untitled task';
  if (trimmed.length <= MAX_TITLE) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE - 1)}…`;
}

function toBrief(task: Task, categories: Category[]): AiAssistTaskBrief {
  const category = categories.find((item) => item.id === task.categoryId);
  return {
    title: truncateTitle(task.title),
    category: category?.name || 'Uncategorized',
    priority: task.priority,
    date: task.date,
    completed: task.completed,
  };
}

function priorityRank(priority: Priority): number {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}

function sortPending(a: AiAssistTaskBrief, b: AiAssistTaskBrief): number {
  if (priorityRank(a.priority) !== priorityRank(b.priority)) {
    return priorityRank(a.priority) - priorityRank(b.priority);
  }
  return a.date.localeCompare(b.date);
}

export function buildTodayFocusPayload(
  tasks: Task[],
  categories: Category[],
  focusDate: string,
  todayDate: string,
  timezone = 'Asia/Shanghai'
): AiAssistDayPayload {
  const dayTasks = tasks.filter((task) => task.date === focusDate);
  return {
    mode: 'today_focus',
    timezone,
    focusDate,
    todayDate,
    pendingTasks: dayTasks
      .filter((task) => !task.completed)
      .map((task) => toBrief(task, categories))
      .sort(sortPending)
      .slice(0, MAX_TASKS),
    completedTasks: dayTasks
      .filter((task) => task.completed)
      .map((task) => toBrief(task, categories))
      .slice(0, MAX_TASKS),
  };
}

export function buildDailyStandupPayload(
  tasks: Task[],
  categories: Category[],
  todayDate: string,
  timezone = 'Asia/Shanghai'
): AiAssistDayPayload {
  const yesterday = shiftDate(todayDate, -1);
  const relevant = tasks.filter(
    (task) => task.date === todayDate || task.date === yesterday || !task.completed
  );
  const completedTasks = relevant
    .filter((task) => task.completed && (task.date === todayDate || task.date === yesterday))
    .map((task) => toBrief(task, categories))
    .slice(0, MAX_TASKS);
  const pendingTasks = relevant
    .filter((task) => !task.completed)
    .map((task) => toBrief(task, categories))
    .sort(sortPending)
    .slice(0, MAX_TASKS);

  return {
    mode: 'daily_standup',
    timezone,
    focusDate: todayDate,
    todayDate,
    pendingTasks,
    completedTasks,
  };
}

export function buildBacklogTriagePayload(
  tasks: Task[],
  categories: Category[],
  todayDate: string,
  timezone = 'Asia/Shanghai'
): AiAssistDayPayload {
  const pendingTasks = tasks
    .filter((task) => !task.completed)
    .map((task) => toBrief(task, categories))
    .sort(sortPending)
    .slice(0, MAX_TASKS);
  const completedTasks = tasks
    .filter((task) => task.completed)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12)
    .map((task) => toBrief(task, categories));

  return {
    mode: 'backlog_triage',
    timezone,
    focusDate: todayDate,
    todayDate,
    pendingTasks,
    completedTasks,
  };
}

export function buildWeeklyAssistPayload(
  tasks: Task[],
  categories: Category[],
  weekAnchorDate: string,
  timezone = 'Asia/Shanghai'
): AiAssistPayload {
  return {
    mode: 'weekly_minutes',
    ...buildWeeklySummaryPayload(tasks, categories, weekAnchorDate, timezone),
  };
}

function shiftDate(dateStr: string, delta: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + delta);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lines(...parts: string[]): string {
  return parts.join('\n');
}

function bulletList(items: string[], empty = '- （无）'): string {
  if (items.length === 0) return empty;
  return items.map((item) => `- ${item}`).join('\n');
}

export function buildLocalAiAssistResult(payload: AiAssistPayload): AiAssistResult {
  if (payload.mode === 'weekly_minutes') {
    const minutesText = buildLocalWeeklyMinutes(payload);
    return {
      title: `工作周报（${payload.periodLabel}）`,
      overview: `本周共 ${payload.stats.total} 项任务，已完成 ${payload.stats.completed} 项，完成率 ${payload.stats.completionRate}%。`,
      sections: [
        {
          heading: 'Completed',
          items: payload.completedTasks
            .slice(0, 8)
            .map((task) => `${task.title}（${task.category}）`),
        },
        {
          heading: 'Follow-ups',
          items: payload.pendingTasks
            .slice(0, 8)
            .map((task) => `${task.title}（${task.category}）`),
        },
        {
          heading: 'Risks',
          items:
            payload.stats.pendingByPriority.high > 0
              ? [`高优先级未完成 ${payload.stats.pendingByPriority.high} 项，建议优先跟进。`]
              : [],
        },
        {
          heading: 'Next week',
          items: payload.pendingTasks.slice(0, 5).map((task) => `跟进：${task.title}`),
        },
      ].filter((section) => section.items.length > 0),
      copyText: minutesText,
    };
  }

  if (payload.mode === 'today_focus') {
    const top = payload.pendingTasks.slice(0, 3);
    const later = payload.pendingTasks.slice(3, 6);
    const wait = payload.pendingTasks.slice(6, 10);
    const overview =
      payload.pendingTasks.length === 0
        ? '今天没有未完成任务，可以规划下一项重点。'
        : `今天还有 ${payload.pendingTasks.length} 项待办，建议先推进高优先级事项。`;
    const copyText = lines(
      `今日焦点（${payload.focusDate}）`,
      '',
      '一、建议顺序',
      bulletList(top.map((task) => task.title)),
      '',
      '二、稍后处理',
      bulletList(later.map((task) => task.title)),
      '',
      '三、可延后',
      bulletList(wait.map((task) => task.title))
    );
    return {
      title: "Today's focus",
      overview,
      sections: [
        { heading: 'Top priorities', items: top.map((task) => task.title) },
        { heading: 'Later today', items: later.map((task) => task.title) },
        { heading: 'Can wait', items: wait.map((task) => task.title) },
      ].filter((section) => section.items.length > 0),
      copyText,
    };
  }

  if (payload.mode === 'daily_standup') {
    const done = payload.completedTasks.slice(0, 6).map((task) => task.title);
    const doing = payload.pendingTasks.slice(0, 4).map((task) => task.title);
    const next = payload.pendingTasks.slice(4, 8).map((task) => task.title);
    const blockers = payload.pendingTasks
      .filter((task) => task.priority === 'high')
      .slice(0, 3)
      .map((task) => task.title);
    const copyText = lines(
      `站会简报（${payload.todayDate}）`,
      '',
      '一、已完成',
      bulletList(done),
      '',
      '二、进行中',
      bulletList(doing),
      '',
      '三、下一步',
      bulletList(next),
      '',
      '四、阻塞/风险',
      bulletList(blockers, '- （暂无）')
    );
    return {
      title: 'Daily standup',
      overview: `已完成 ${done.length} 项，待推进 ${payload.pendingTasks.length} 项。`,
      sections: [
        { heading: 'Done', items: done },
        { heading: 'Doing', items: doing },
        { heading: 'Next', items: next },
        { heading: 'Blockers', items: blockers },
      ].filter((section) => section.items.length > 0),
      copyText,
    };
  }

  const doNow = payload.pendingTasks
    .filter((task) => task.priority === 'high' || task.date <= payload.todayDate)
    .slice(0, 6);
  const defer = payload.pendingTasks
    .filter((task) => !doNow.some((item) => item.title === task.title && item.date === task.date))
    .filter((task) => task.priority === 'medium')
    .slice(0, 6);
  const drop = payload.pendingTasks
    .filter((task) => task.priority === 'low')
    .slice(0, 6);
  const copyText = lines(
    `待办分拣（${payload.todayDate}）`,
    '',
    '一、立刻做',
    bulletList(doNow.map((task) => `${task.title}（${task.date}）`)),
    '',
    '二、可延后',
    bulletList(defer.map((task) => `${task.title}（${task.date}）`)),
    '',
    '三、考虑砍掉',
    bulletList(drop.map((task) => `${task.title}（${task.date}）`), '- （暂无低优先级项）')
  );
  return {
    title: 'Backlog triage',
    overview: `未完成 ${payload.pendingTasks.length} 项，建议先清理高优与过期事项。`,
    sections: [
      { heading: 'Do now', items: doNow.map((task) => `${task.title} · ${task.date}`) },
      { heading: 'Defer', items: defer.map((task) => `${task.title} · ${task.date}`) },
      { heading: 'Consider dropping', items: drop.map((task) => `${task.title} · ${task.date}`) },
    ].filter((section) => section.items.length > 0),
    copyText,
  };
}

export function getAiAssistLabel(mode: AiAssistMode): string {
  if (mode === 'weekly_minutes') return 'Weekly minutes';
  if (mode === 'today_focus') return "Today's focus";
  if (mode === 'daily_standup') return 'Daily standup';
  return 'Backlog triage';
}

export function getAiAssistHint(mode: AiAssistMode): string {
  if (mode === 'weekly_minutes') return 'Meeting-ready weekly report';
  if (mode === 'today_focus') return 'What to do first today';
  if (mode === 'daily_standup') return 'Short standup briefing';
  return 'Keep, defer, or drop';
}
