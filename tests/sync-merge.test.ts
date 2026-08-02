import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Category, Task } from '../src/types.ts';
import {
  applyRemoteTaskUpserts,
  applyTaskTombstones,
  mergeCategories,
  mergeTasksLww,
  withoutStaleOps,
  withoutTombstonedCategories,
} from '../src/utils/mergeSync.ts';
import { compactOps, type SyncOp } from '../src/utils/syncQueue.ts';
import { trimTasksToRecentWindow } from '../src/utils/storage.ts';

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

describe('applyTaskTombstones', () => {
  it('removes tombstoned tasks from the local list', () => {
    const local = [task({ id: 't1', updatedAt: 10 }), task({ id: 't2', updatedAt: 10 })];
    const { tasks, staleOps } = applyTaskTombstones(local, [{ id: 't1', deletedAt: 20 }], []);
    assert.deepEqual(tasks.map((t) => t.id), ['t2']);
    assert.equal(staleOps.length, 0);
  });

  it('keeps the row when a pending edit is newer than the deletion', () => {
    const local = [task({ id: 't1', updatedAt: 30 })];
    const pending: SyncOp[] = [
      {
        id: 'op',
        type: 'upsert_task',
        entityId: 't1',
        payload: task({ id: 't1', updatedAt: 30 }),
        createdAt: 30,
      },
    ];
    const { tasks, staleOps } = applyTaskTombstones(
      local,
      [{ id: 't1', deletedAt: 20 }],
      pending
    );
    assert.equal(tasks.length, 1);
    assert.equal(staleOps.length, 0);
  });

  it('drops a stale pending upsert older than the deletion', () => {
    const local = [task({ id: 't1', updatedAt: 10 })];
    const pending: SyncOp[] = [
      {
        id: 'op',
        type: 'upsert_task',
        entityId: 't1',
        payload: task({ id: 't1', updatedAt: 10 }),
        createdAt: 10,
      },
    ];
    const { tasks, staleOps } = applyTaskTombstones(
      local,
      [{ id: 't1', deletedAt: 20 }],
      pending
    );
    assert.equal(tasks.length, 0);
    assert.equal(staleOps[0].id, 'op');
  });

  it('drops a redundant pending delete for an already-tombstoned row', () => {
    const pending: SyncOp[] = [
      { id: 'del', type: 'delete_task', entityId: 't1', createdAt: 5 },
    ];
    const { staleOps } = applyTaskTombstones([], [{ id: 't1', deletedAt: 20 }], pending);
    assert.equal(staleOps[0].id, 'del');
  });
});

describe('applyRemoteTaskUpserts', () => {
  it('leaves local rows untouched when remote changes do not mention them', () => {
    const local = [task({ id: 'old', updatedAt: 1 })];
    const { merged, toPush } = applyRemoteTaskUpserts(
      local,
      [task({ id: 'new', updatedAt: 50 })],
      []
    );
    assert.deepEqual(merged.map((t) => t.id).sort(), ['new', 'old']);
    assert.equal(toPush.length, 0);
  });

  it('applies newer remote rows over local ones', () => {
    const local = [task({ id: 't1', updatedAt: 10, title: 'local' })];
    const { merged } = applyRemoteTaskUpserts(
      local,
      [task({ id: 't1', updatedAt: 20, title: 'remote' })],
      []
    );
    assert.equal(merged[0].title, 'remote');
  });

  it('keeps and pushes a newer local row without an outbox entry', () => {
    const local = [task({ id: 't1', updatedAt: 30, title: 'local' })];
    const { merged, toPush } = applyRemoteTaskUpserts(
      local,
      [task({ id: 't1', updatedAt: 20, title: 'remote' })],
      []
    );
    assert.equal(merged[0].title, 'local');
    assert.equal(toPush[0].title, 'local');
  });

  it('keeps a newer pending upsert over the changed remote row', () => {
    const pending: SyncOp[] = [
      {
        id: 'op',
        type: 'upsert_task',
        entityId: 't1',
        payload: task({ id: 't1', updatedAt: 40, title: 'pending' }),
        createdAt: 40,
      },
    ];
    const { merged, staleOps } = applyRemoteTaskUpserts(
      [task({ id: 't1', updatedAt: 10 })],
      [task({ id: 't1', updatedAt: 20, title: 'remote' })],
      pending
    );
    assert.equal(merged[0].title, 'pending');
    assert.equal(staleOps.length, 0);
  });

  it('honors a pending delete newer than the remote edit', () => {
    const pending: SyncOp[] = [
      { id: 'del', type: 'delete_task', entityId: 't1', createdAt: 50 },
    ];
    const { merged, staleOps } = applyRemoteTaskUpserts(
      [task({ id: 't1', updatedAt: 10 })],
      [task({ id: 't1', updatedAt: 20 })],
      pending
    );
    assert.equal(merged.length, 0);
    assert.equal(staleOps.length, 0);
  });

  it('drops a stale pending delete when the remote edit is newer', () => {
    const pending: SyncOp[] = [
      { id: 'del', type: 'delete_task', entityId: 't1', createdAt: 10 },
    ];
    const { merged, staleOps } = applyRemoteTaskUpserts(
      [],
      [task({ id: 't1', updatedAt: 20, title: 'remote' })],
      pending
    );
    assert.equal(merged[0].title, 'remote');
    assert.equal(staleOps[0].id, 'del');
  });
});

describe('withoutTombstonedCategories', () => {
  const cat = (id: string): Category => ({
    id,
    name: id,
    color: '#000',
    bgClass: '',
    textClass: '',
    borderClass: '',
  });

  it('removes tombstoned categories', () => {
    const next = withoutTombstonedCategories([cat('a'), cat('b')], ['a'], []);
    assert.deepEqual(next.map((c) => c.id), ['b']);
  });

  it('keeps a tombstoned category with a pending upsert (revive)', () => {
    const pending: SyncOp[] = [
      { id: 'op', type: 'upsert_category', entityId: 'a', payload: cat('a'), createdAt: 1 },
    ];
    const next = withoutTombstonedCategories([cat('a')], ['a'], pending);
    assert.equal(next.length, 1);
  });
});

describe('trimTasksToRecentWindow', () => {
  const nowMs = new Date('2026-08-02T12:00:00Z').getTime();

  it('keeps tasks within the 30-day window and future tasks', () => {
    const tasks = [
      task({ id: 'recent', updatedAt: 1, date: '2026-07-20' }),
      task({ id: 'future', updatedAt: 1, date: '2026-09-01' }),
      task({ id: 'old', updatedAt: 1, date: '2026-06-01' }),
    ];
    const trimmed = trimTasksToRecentWindow(tasks, { nowMs });
    assert.deepEqual(trimmed.map((t) => t.id), ['recent', 'future']);
  });

  it('always keeps tasks listed in keepIds', () => {
    const tasks = [task({ id: 'old-unsynced', updatedAt: 1, date: '2026-01-01' })];
    const trimmed = trimTasksToRecentWindow(tasks, {
      nowMs,
      keepIds: new Set(['old-unsynced']),
    });
    assert.equal(trimmed.length, 1);
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
