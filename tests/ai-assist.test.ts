import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAiAssistPrompt,
  normalizeAiAssistOutput,
  validateAiAssistRequest,
} from '../server/ai-assist.ts';
import {
  buildLocalAiAssistResult,
  buildTodayFocusPayload,
  getAiAssistLabel,
} from '../src/utils/aiAssist.ts';
import type { Category, Task } from '../src/types.ts';

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
    title: 'Write report',
    date: '2026-07-31',
    completed: false,
    categoryId: 'work',
    priority: 'high',
    subtasks: [],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: '2',
    title: 'Ship patch',
    date: '2026-07-31',
    completed: true,
    categoryId: 'work',
    priority: 'medium',
    subtasks: [],
    createdAt: 1,
    updatedAt: 1,
  },
];

test('validates today_focus assist request', () => {
  const request = validateAiAssistRequest({
    mode: 'today_focus',
    timezone: 'Asia/Shanghai',
    focusDate: '2026-07-31',
    todayDate: '2026-07-31',
    pendingTasks: [
      {
        title: 'Write report',
        category: 'Work',
        priority: 'high',
        date: '2026-07-31',
      },
    ],
    completedTasks: [],
  });
  assert.equal(request.mode, 'today_focus');
  assert.match(buildAiAssistPrompt(request), /今日焦点|Today|优先/);
});

test('normalizes non-weekly assist result', () => {
  const result = normalizeAiAssistOutput('today_focus', {
    title: ' Focus ',
    overview: ' Do the high priority item first. ',
    sections: [{ heading: 'Top', items: ['Write report'] }],
    copyText: '今日焦点\n- Write report',
  });
  assert.equal(result.title, 'Focus');
  assert.equal(result.sections[0].items[0], 'Write report');
});

test('builds local today focus draft', () => {
  const payload = buildTodayFocusPayload(tasks, categories, '2026-07-31', '2026-07-31');
  const local = buildLocalAiAssistResult(payload);
  assert.equal(getAiAssistLabel(payload.mode), "Today's focus");
  assert.match(local.copyText, /Write report/);
  assert.ok(local.sections.some((section) => section.heading === 'Top priorities'));
});
