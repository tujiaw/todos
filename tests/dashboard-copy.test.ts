import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDashboardCopyPrompt,
  getDefaultDashboardCopy,
  validateDashboardCopy,
} from '../server/dashboard-copy.js';

test('validates and trims dashboard copy', () => {
  assert.deepEqual(
    validateDashboardCopy({
      title: '  Start with what matters.  ',
      subtitle: '  Give one meaningful task your full attention today.  ',
    }),
    {
      title: 'Start with what matters.',
      subtitle: 'Give one meaningful task your full attention today.',
    }
  );
});

test('rejects missing or oversized dashboard copy', () => {
  assert.throws(
    () => validateDashboardCopy({ title: '', subtitle: 'Keep going.' }),
    /invalid dashboard copy/
  );
  assert.throws(
    () => validateDashboardCopy({ title: 'A'.repeat(61), subtitle: 'Keep going.' }),
    /invalid dashboard copy/
  );
});

test('dashboard prompt requests concise JSON and includes context', () => {
  const prompt = buildDashboardCopyPrompt({
    currentDate: '2026-07-30',
    pendingTasks: 3,
    completedTasks: 2,
  });
  assert.match(prompt, /2026-07-30/);
  assert.match(prompt, /Pending tasks: 3/);
  assert.match(prompt, /title, subtitle/);
  assert.match(prompt, /Return one JSON object/);
});

test('returns a fresh default dashboard copy', () => {
  const first = getDefaultDashboardCopy();
  const second = getDefaultDashboardCopy();
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
});
