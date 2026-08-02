import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeCreateTask,
  executeQueryTodos,
  getAiAssistSystemPrompt,
  getWeekBounds,
  parseQueryTodosArgs,
  resolveRelativeRange,
  validateAiAssistRequest,
} from '../server/ai-assist.ts';
import {
  buildAiAssistCatalog,
  getAiAssistSuggestions,
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
  {
    id: 'life',
    name: 'Life',
    color: '#10b981',
    bgClass: '',
    textClass: '',
    borderClass: '',
  },
];

const tasks: Task[] = [
  {
    id: '1',
    title: 'Write report',
    date: '2026-07-28',
    completed: false,
    categoryId: 'work',
    priority: 'high',
    subtasks: [],
    createdAt: 1,
    updatedAt: 3,
  },
  {
    id: '2',
    title: 'Ship patch',
    date: '2026-07-30',
    completed: true,
    categoryId: 'work',
    priority: 'medium',
    subtasks: [],
    createdAt: 1,
    updatedAt: 2,
  },
  {
    id: '3',
    title: 'Buy milk',
    date: '2026-07-31',
    completed: false,
    categoryId: 'life',
    priority: 'low',
    subtasks: [],
    createdAt: 1,
    updatedAt: 1,
  },
];

test('validates natural-language AI assist request', () => {
  const request = validateAiAssistRequest({
    message: 'Summarize this week’s work items',
    timezone: 'Asia/Shanghai',
    todayDate: '2026-07-31',
    selectedDate: '2026-07-31',
    language: 'en',
    categories: [{ id: 'work', name: 'Work', isDefault: true }],
    tasks: [
      {
        title: 'Write report',
        category: 'Work',
        categoryId: 'work',
        priority: 'high',
        date: '2026-07-28',
        completed: false,
      },
    ],
  });
  assert.equal(request.message, 'Summarize this week’s work items');
  assert.equal(request.selectedDate, '2026-07-31');
  assert.equal(request.language, 'en');
  assert.equal(request.tasks.length, 1);
});

test('defaults AI assist language to zh and rejects invalid values', () => {
  const request = validateAiAssistRequest({
    message: '总结本周任务',
    timezone: 'Asia/Shanghai',
    todayDate: '2026-07-31',
    selectedDate: '2026-07-31',
    categories: [{ id: 'work', name: 'Work', isDefault: true }],
    tasks: [],
  });
  assert.equal(request.language, 'zh');
  assert.throws(
    () =>
      validateAiAssistRequest({
        message: 'hello',
        timezone: 'Asia/Shanghai',
        todayDate: '2026-07-31',
        selectedDate: '2026-07-31',
        language: 'fr',
        categories: [{ id: 'work', name: 'Work', isDefault: true }],
        tasks: [],
      }),
    /language/
  );
});

test('system prompt enforces the selected reply language', () => {
  const zhPrompt = getAiAssistSystemPrompt({
    timezone: 'Asia/Shanghai',
    todayDate: '2026-07-31',
    selectedDate: '2026-07-31',
    language: 'zh',
    categories: [{ id: 'work', name: 'Work', isDefault: true }],
  });
  const enPrompt = getAiAssistSystemPrompt({
    timezone: 'Asia/Shanghai',
    todayDate: '2026-07-31',
    selectedDate: '2026-07-31',
    language: 'en',
    categories: [{ id: 'work', name: 'Work', isDefault: true }],
  });
  assert.match(zhPrompt, /Simplified Chinese/);
  assert.match(enPrompt, /Always answer in English/);
});

test('create_task builds a validated task without review step', () => {
  const created = executeCreateTask(
    {
      todayDate: '2026-07-31',
      selectedDate: '2026-07-31',
      timezone: 'Asia/Shanghai',
      categories: [
        { id: 'work', name: 'Work', isDefault: true },
        { id: 'life', name: 'Life' },
      ],
    },
    {
      title: 'Prepare weekly report',
      date: '2026-08-01',
      dueTime: '15:00',
      priority: 'high',
      category: 'Work',
      subtasks: ['Collect data', 'Draft slides'],
    }
  );
  assert.equal(created.title, 'Prepare weekly report');
  assert.equal(created.date, '2026-08-01');
  assert.equal(created.dueTime, '15:00');
  assert.equal(created.priority, 'high');
  assert.equal(created.categoryId, 'work');
  assert.deepEqual(created.subtasks, ['Collect data', 'Draft slides']);
});

test('resolves this_week relative range to Monday-Sunday', () => {
  const bounds = resolveRelativeRange('2026-07-31', 'this_week');
  const week = getWeekBounds('2026-07-31');
  assert.equal(bounds.dateFrom, week.start);
  assert.equal(bounds.dateTo, week.end);
  assert.equal(week.start, '2026-07-27');
  assert.equal(week.end, '2026-08-02');
});

test('query_todos filters by this week and work category', () => {
  const catalog = buildAiAssistCatalog(tasks, categories);
  const result = executeQueryTodos(catalog.tasks, '2026-07-31', {
    relativeRange: 'this_week',
    category: 'work',
  });
  assert.equal(result.totalMatched, 2);
  assert.deepEqual(
    result.tasks.map((task) => task.title),
    ['Write report', 'Ship patch']
  );
});

test('query_todos supports pending-only and search', () => {
  const catalog = buildAiAssistCatalog(tasks, categories);
  const result = executeQueryTodos(catalog.tasks, '2026-07-31', {
    completed: false,
    search: 'milk',
  });
  assert.equal(result.totalMatched, 1);
  assert.equal(result.tasks[0].title, 'Buy milk');
});

test('parseQueryTodosArgs rejects bad dates', () => {
  assert.throws(() => parseQueryTodosArgs({ dateFrom: '07-31' }), /dateFrom/);
});

test('builds client suggestions', () => {
  const zhSuggestions = getAiAssistSuggestions({
    selectedDate: '2026-07-31',
    todayDate: '2026-07-31',
    language: 'zh',
  });
  assert.equal(zhSuggestions.length, 4);
  assert.match(
    zhSuggestions.find((item) => item.id === 'create_task')?.prompt || '',
    /今天创建一个任务/
  );
  assert.equal(zhSuggestions.find((item) => item.id === 'create_task')?.label, '创建任务');

  const enSuggestions = getAiAssistSuggestions({
    selectedDate: '2026-07-31',
    todayDate: '2026-07-31',
    language: 'en',
  });
  assert.match(
    enSuggestions.find((item) => item.id === 'create_task')?.prompt || '',
    /Create a task today:/
  );
  assert.equal(
    enSuggestions.find((item) => item.id === 'today_focus')?.sendOnClick,
    true
  );
});
