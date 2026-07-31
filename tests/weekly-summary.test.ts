import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWeeklySummaryPrompt,
  validateWeeklySummaryRequest,
  validateWeeklySummaryResult,
} from '../server/weekly-summary.ts';
import {
  buildLocalWeeklyMinutes,
  buildWeeklySummaryPayload,
  formatWeekDisplayLabel,
  getWeekDays,
} from '../src/utils/week.ts';
import type { Category, Task } from '../src/types.ts';

const sampleRequest = {
  startDate: '2026-07-27',
  endDate: '2026-08-02',
  periodLabel: '2026-07-27 ~ 2026-08-02',
  timezone: 'Asia/Shanghai',
  stats: {
    total: 3,
    completed: 2,
    pending: 1,
    completionRate: 67,
    byCategory: [{ name: 'Work', total: 3, completed: 2, pending: 1 }],
    pendingByPriority: { high: 1, medium: 0, low: 0 },
  },
  completedTasks: [
    {
      title: '完成周报',
      category: 'Work',
      priority: 'medium' as const,
      date: '2026-07-28',
    },
  ],
  pendingTasks: [
    {
      title: '跟进客户反馈',
      category: 'Work',
      priority: 'high' as const,
      date: '2026-07-30',
    },
  ],
};

test('getWeekDays returns Monday-Sunday for midweek anchor', () => {
  assert.deepEqual(getWeekDays('2026-07-29'), [
    '2026-07-27',
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
  ]);
});

test('formatWeekDisplayLabel prefers This Week when current', () => {
  assert.equal(
    formatWeekDisplayLabel('2026-07-27', '2026-08-02', {
      preferThisWeek: true,
      today: '2026-07-29',
    }),
    'This Week'
  );
  assert.match(
    formatWeekDisplayLabel('2026-07-20', '2026-07-26', {
      preferThisWeek: true,
      today: '2026-07-29',
    }),
    /Jul/
  );
});

test('buildWeeklySummaryPayload aggregates week tasks', () => {
  const categories: Category[] = [
    {
      id: 'work',
      name: 'Work',
      color: '#3b82f6',
      bgClass: '',
      textClass: '',
      borderClass: '',
    },
  ];
  const tasks: Task[] = [
    {
      id: '1',
      title: 'A',
      date: '2026-07-28',
      completed: true,
      categoryId: 'work',
      priority: 'medium',
      subtasks: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: '2',
      title: 'B',
      date: '2026-07-30',
      completed: false,
      categoryId: 'work',
      priority: 'high',
      subtasks: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: '3',
      title: 'Outside',
      date: '2026-07-20',
      completed: true,
      categoryId: 'work',
      priority: 'low',
      subtasks: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  const payload = buildWeeklySummaryPayload(tasks, categories, '2026-07-29');
  assert.equal(payload.startDate, '2026-07-27');
  assert.equal(payload.endDate, '2026-08-02');
  assert.equal(payload.stats.total, 2);
  assert.equal(payload.stats.completed, 1);
  assert.equal(payload.stats.pending, 1);
  assert.equal(payload.stats.pendingByPriority.high, 1);
  assert.match(buildLocalWeeklyMinutes(payload), /工作周报/);
  assert.match(buildLocalWeeklyMinutes(payload), /跟进客户|B/);
});

test('validates weekly summary request and result', () => {
  const request = validateWeeklySummaryRequest(sampleRequest);
  assert.equal(request.stats.total, 3);

  const result = validateWeeklySummaryResult({
    title: ' 工作周报（2026-07-27 ~ 2026-08-02） ',
    overview: ' 本周完成率 67%，重点推进客户反馈。 ',
    completedHighlights: ['完成周报'],
    unfinishedItems: ['跟进客户反馈'],
    risksOrBlockers: [],
    nextWeekFocus: ['优先处理高优待办'],
    minutesText: '工作周报\n\n一、本周概况\n本周完成率 67%。',
  });
  assert.equal(result.title, '工作周报（2026-07-27 ~ 2026-08-02）');
  assert.equal(result.completedHighlights.length, 1);
});

test('weekly summary prompt asks for meeting minutes structure', () => {
  const prompt = buildWeeklySummaryPrompt(validateWeeklySummaryRequest(sampleRequest));
  assert.match(prompt, /周会/);
  assert.match(prompt, /minutesText/);
  assert.match(prompt, /2026-07-27/);
  assert.match(prompt, /跟进客户反馈/);
});

test('rejects invalid weekly summary payloads', () => {
  assert.throws(() => validateWeeklySummaryRequest({}), /Invalid weekly summary request/);
  assert.throws(
    () =>
      validateWeeklySummaryResult({
        title: '',
        overview: 'x',
        completedHighlights: [],
        unfinishedItems: [],
        risksOrBlockers: [],
        nextWeekFocus: [],
        minutesText: 'x',
      }),
    /invalid weekly summary/i
  );
});
