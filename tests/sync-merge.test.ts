import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Category, Task } from '../src/types.ts';
import { mergeCategories, mergeTasksLww, withoutStaleOps } from '../src/utils/mergeSync.ts';
import { compactOps, type SyncOp } from '../src/utils/syncQueue.ts';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'updatedAt'>): Task {
  return {
    title: partial.title || partial.id,
    date: '2026-07-31',
    completed: false,
    categoryId: 'cat-1',
    priority: 'medium',
    subtasks: [],
    createdAt: partial.createdAt || 1,
    ...partial,
  };
}

describe('compactOps', () => {
  it('keeps the latest op per entity', () => {
    const ops: SyncOp[] = [
      {
        id: '1',
        type: 'upsert_task',
        entityId: 't1',
        payload: task({ id: 't1', updatedAt: 1, title: 'a' }),
        createdAt: 1,
      },
      {
        id: '2',
        type: 'upsert_task',
        entityId: 't1',
        payload: task({ id: 't1', updatedAt: 2, title: 'b' }),
        createdAt: 2,
      },
      {
        id: '3',
        type: 'delete_task',
        entityId: 't1',
        createdAt: 3,
      },
    ];
    const compacted = compactOps(ops);
    assert.equal(compacted.length, 1);
    assert.equal(compacted[0].type, 'delete_task');
  });
});

describe('mergeTasksLww', () => {
  it('picks the newer updatedAt winner', () => {
    const local = [task({ id: 't1', updatedAt: 20, title: 'local' })];
    const remote = [task({ id: 't1', updatedAt: 10, title: 'remote' })];
    const { merged, toPush } = mergeTasksLww(local, remote, []);
    assert.equal(merged[0].title, 'local');
    assert.equal(toPush.length, 1);
  });

  it('keeps local-only tasks and marks them to push', () => {
    const local = [task({ id: 'local-only', updatedAt: 5 })];
    const { merged, toPush } = mergeTasksLww(local, [], []);
    assert.equal(merged.length, 1);
    assert.equal(toPush.length, 1);
  });

  it('drops stale pending upsert when remote is newer', () => {
    const local = [task({ id: 't1', updatedAt: 1, title: 'old-local' })];
    const remote = [task({ id: 't1', updatedAt: 50, title: 'remote' })];
    const pending: SyncOp[] = [
      {
        id: 'op',
        type: 'upsert_task',
        entityId: 't1',
        payload: task({ id: 't1', updatedAt: 2, title: 'pending' }),
        createdAt: 99,
      },
    ];
    const { merged, staleOps } = mergeTasksLww(local, remote, pending);
    assert.equal(merged[0].title, 'remote');
    assert.equal(staleOps.length, 1);
    assert.equal(staleOps[0].id, 'op');
  });

  it('keeps newer pending upsert over older remote', () => {
    const local = [task({ id: 't1', updatedAt: 1, title: 'old-local' })];
    const remote = [task({ id: 't1', updatedAt: 10, title: 'remote' })];
    const pending: SyncOp[] = [
      {
        id: 'op',
        type: 'upsert_task',
        entityId: 't1',
        payload: task({ id: 't1', updatedAt: 20, title: 'pending' }),
        createdAt: 99,
      },
    ];
    const { merged, toPush, staleOps } = mergeTasksLww(local, remote, pending);
    assert.equal(merged[0].title, 'pending');
    assert.equal(toPush[0].title, 'pending');
    assert.equal(staleOps.length, 0);
  });

  it('drops stale pending delete when remote edit is newer', () => {
    const remote = [task({ id: 't1', updatedAt: 100, title: 'edited-elsewhere' })];
    const pending: SyncOp[] = [
      { id: 'del', type: 'delete_task', entityId: 't1', createdAt: 50 },
    ];
    const { merged, staleOps } = mergeTasksLww([], remote, pending);
    assert.equal(merged[0].title, 'edited-elsewhere');
    assert.equal(staleOps[0].id, 'del');
  });

  it('honors pending delete when it is newer than remote', () => {
    const remote = [task({ id: 't1', updatedAt: 10, title: 'remote' })];
    const pending: SyncOp[] = [
      { id: 'del', type: 'delete_task', entityId: 't1', createdAt: 50 },
    ];
    const { merged, staleOps } = mergeTasksLww([], remote, pending);
    assert.equal(merged.length, 0);
    assert.equal(staleOps.length, 0);
  });
});

describe('withoutStaleOps', () => {
  it('removes stale ops by id', () => {
    const ops: SyncOp[] = [
      { id: 'a', type: 'delete_task', entityId: 't1', createdAt: 1 },
      { id: 'b', type: 'upsert_task', entityId: 't2', createdAt: 2 },
    ];
    const next = withoutStaleOps(ops, [ops[0]]);
    assert.equal(next.length, 1);
    assert.equal(next[0].id, 'b');
  });
});

describe('mergeCategories', () => {
  it('unions remote and local-only categories', () => {
    const local: Category[] = [
      {
        id: 'a',
        name: 'A',
        color: '#000',
        bgClass: '',
        textClass: '',
        borderClass: '',
      },
    ];
    const remote: Category[] = [
      {
        id: 'b',
        name: 'B',
        color: '#111',
        bgClass: '',
        textClass: '',
        borderClass: '',
      },
    ];
    const { merged, toPush } = mergeCategories(local, remote, []);
    assert.equal(merged.length, 2);
    assert.equal(toPush.some((cat) => cat.id === 'a'), true);
  });
});
