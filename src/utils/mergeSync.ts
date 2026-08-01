import type { Category, Task } from '../types';
import { sortCategoriesByOrder } from './categories';
import type { SyncOp } from './syncQueue';

export interface MergeTasksResult {
  merged: Task[];
  toPush: Task[];
  /** Outbox ops that lost the LWW contest and should be dropped. */
  staleOps: SyncOp[];
}

export interface MergeCategoriesResult {
  merged: Category[];
  toPush: Category[];
  staleOps: SyncOp[];
}

/**
 * Last-write-wins merge.
 * - Pending upsert wins only when its updatedAt >= remote.updatedAt.
 * - Pending delete wins only when op.createdAt >= remote.updatedAt.
 * - Local-only rows are kept and pushed (avoid silent loss if outbox write failed).
 */
export function mergeTasksLww(
  localTasks: Task[],
  remoteTasks: Task[],
  pendingOps: SyncOp[]
): MergeTasksResult {
  const pendingDeleteOps = pendingOps.filter((op) => op.type === 'delete_task');
  const pendingDeletes = new Map(pendingDeleteOps.map((op) => [op.entityId, op]));
  const pendingUpsertOps = pendingOps.filter(
    (op) => op.type === 'upsert_task' && op.payload
  );
  const pendingUpserts = new Map(
    pendingUpsertOps.map((op) => [op.entityId, op])
  );

  const localById = new Map(localTasks.map((task) => [task.id, task]));
  const remoteById = new Map(remoteTasks.map((task) => [task.id, task]));
  const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

  const merged: Task[] = [];
  const toPush: Task[] = [];
  const staleOps: SyncOp[] = [];

  for (const id of allIds) {
    const deleteOp = pendingDeletes.get(id);
    const upsertOp = pendingUpserts.get(id);
    const pendingTask = upsertOp?.payload as Task | undefined;
    const local = pendingTask || localById.get(id);
    const remote = remoteById.get(id);

    if (deleteOp) {
      if (remote && remote.updatedAt > deleteOp.createdAt) {
        // Remote edit is newer than the delete — keep remote, drop stale delete.
        staleOps.push(deleteOp);
        if (upsertOp) staleOps.push(upsertOp);
        merged.push(remote);
        continue;
      }
      // Delete wins: omit from merged; flushOutbox will remove remote.
      if (upsertOp) staleOps.push(upsertOp);
      continue;
    }

    if (local && remote) {
      if (upsertOp && pendingTask) {
        if (pendingTask.updatedAt >= remote.updatedAt) {
          merged.push(pendingTask);
          toPush.push(pendingTask);
        } else {
          staleOps.push(upsertOp);
          merged.push(remote);
        }
        continue;
      }

      if (local.updatedAt >= remote.updatedAt) {
        merged.push(local);
        if (local.updatedAt !== remote.updatedAt) {
          toPush.push(local);
        }
      } else {
        merged.push(remote);
      }
      continue;
    }

    if (local && !remote) {
      merged.push(local);
      toPush.push(local);
      continue;
    }

    if (!local && remote) {
      merged.push(remote);
    }
  }

  merged.sort((a, b) => b.createdAt - a.createdAt);
  return { merged, toPush, staleOps };
}

export function mergeCategories(
  localCategories: Category[],
  remoteCategories: Category[],
  pendingOps: SyncOp[]
): MergeCategoriesResult {
  const pendingDeletes = new Set(
    pendingOps.filter((op) => op.type === 'delete_category').map((op) => op.entityId)
  );
  const pendingUpserts = new Map(
    pendingOps
      .filter((op) => op.type === 'upsert_category' && op.payload)
      .map((op) => [op.entityId, op])
  );

  const byId = new Map<string, Category>();
  const toPush: Category[] = [];
  const staleOps: SyncOp[] = [];

  for (const cat of remoteCategories) {
    if (!pendingDeletes.has(cat.id)) {
      byId.set(cat.id, cat);
    }
  }

  for (const cat of localCategories) {
    if (pendingDeletes.has(cat.id)) continue;
    const upsertOp = pendingUpserts.get(cat.id);
    if (upsertOp?.payload) {
      byId.set(cat.id, upsertOp.payload as Category);
      toPush.push(upsertOp.payload as Category);
      continue;
    }
    if (!byId.has(cat.id)) {
      byId.set(cat.id, cat);
      toPush.push(cat);
    }
  }

  for (const [id, op] of pendingUpserts) {
    if (pendingDeletes.has(id) || !op.payload) continue;
    const cat = op.payload as Category;
    byId.set(id, cat);
    if (!toPush.some((item) => item.id === id)) {
      toPush.push(cat);
    }
  }

  const merged = sortCategoriesByOrder(Array.from(byId.values()));
  return { merged, toPush, staleOps };
}

/** Remove stale ops (by id) from an outbox list. */
export function withoutStaleOps(ops: SyncOp[], staleOps: SyncOp[]): SyncOp[] {
  if (staleOps.length === 0) return ops;
  const staleIds = new Set(staleOps.map((op) => op.id));
  return ops.filter((op) => !staleIds.has(op.id));
}
