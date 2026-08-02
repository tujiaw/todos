import type { Category, Task } from '../types';
import type { TaskTombstone } from '../lib/supabase';
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

export interface ApplyTombstonesResult {
  tasks: Task[];
  staleOps: SyncOp[];
}

/**
 * Apply remote tombstones to the local task list before merging.
 * A pending local edit newer than the deletion wins (the outbox upsert will
 * revive the row); otherwise the deletion wins and any pending op for the row
 * is dropped as stale.
 */
export function applyTaskTombstones(
  localTasks: Task[],
  tombstones: TaskTombstone[],
  pendingOps: SyncOp[]
): ApplyTombstonesResult {
  if (tombstones.length === 0) {
    return { tasks: localTasks, staleOps: [] };
  }

  // compactOps guarantees at most one pending op per entity.
  const pendingByTaskId = new Map(
    pendingOps
      .filter((op) => op.type === 'upsert_task' || op.type === 'delete_task')
      .map((op) => [op.entityId, op])
  );

  const deletedIds = new Set<string>();
  const staleOps: SyncOp[] = [];

  for (const tombstone of tombstones) {
    const pendingOp = pendingByTaskId.get(tombstone.id);

    if (pendingOp?.type === 'upsert_task' && pendingOp.payload) {
      const pendingTask = pendingOp.payload as Task;
      if (pendingTask.updatedAt >= tombstone.deletedAt) {
        continue; // local edit is newer — keep the row, outbox will revive it
      }
      staleOps.push(pendingOp);
    } else if (pendingOp?.type === 'delete_task') {
      staleOps.push(pendingOp); // remote already deleted; local delete is redundant
    }

    deletedIds.add(tombstone.id);
  }

  return {
    tasks: localTasks.filter((task) => !deletedIds.has(task.id)),
    staleOps,
  };
}

/**
 * Incremental counterpart of mergeTasksLww: remote rows are only the ones
 * changed since the sync cursor, so local rows they do not mention stay as-is.
 */
export function applyRemoteTaskUpserts(
  localTasks: Task[],
  changedRemoteTasks: Task[],
  pendingOps: SyncOp[]
): MergeTasksResult {
  const pendingByTaskId = new Map(
    pendingOps
      .filter((op) => op.type === 'upsert_task' || op.type === 'delete_task')
      .map((op) => [op.entityId, op])
  );

  const byId = new Map(localTasks.map((task) => [task.id, task]));
  const toPush: Task[] = [];
  const staleOps: SyncOp[] = [];

  for (const remote of changedRemoteTasks) {
    const pendingOp = pendingByTaskId.get(remote.id);

    if (pendingOp?.type === 'delete_task') {
      if (remote.updatedAt > pendingOp.createdAt) {
        // Remote edit is newer than the local delete — keep remote.
        staleOps.push(pendingOp);
        byId.set(remote.id, remote);
      } else {
        byId.delete(remote.id);
      }
      continue;
    }

    if (pendingOp?.type === 'upsert_task' && pendingOp.payload) {
      const pendingTask = pendingOp.payload as Task;
      if (pendingTask.updatedAt >= remote.updatedAt) {
        byId.set(remote.id, pendingTask);
        toPush.push(pendingTask);
      } else {
        staleOps.push(pendingOp);
        byId.set(remote.id, remote);
      }
      continue;
    }

    const local = byId.get(remote.id);
    if (!local || remote.updatedAt >= local.updatedAt) {
      byId.set(remote.id, remote);
    } else {
      // Local is newer but has no outbox entry (e.g. a failed outbox write) —
      // push it so the edit is not silently lost.
      toPush.push(local);
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  return { merged, toPush, staleOps };
}

/**
 * Drop locally cached categories that were tombstoned remotely, unless a
 * pending upsert exists (flushing it revives the category by design).
 */
export function withoutTombstonedCategories(
  localCategories: Category[],
  deletedIds: string[],
  pendingOps: SyncOp[]
): Category[] {
  if (deletedIds.length === 0) return localCategories;

  const pendingUpsertIds = new Set(
    pendingOps.filter((op) => op.type === 'upsert_category').map((op) => op.entityId)
  );
  const deleted = new Set(deletedIds);

  return localCategories.filter(
    (cat) => !deleted.has(cat.id) || pendingUpsertIds.has(cat.id)
  );
}

function categorySyncSnapshot(cat: Category): string {
  return [
    cat.id,
    cat.name,
    cat.color,
    cat.bgClass,
    cat.textClass,
    cat.borderClass,
    String(cat.sortOrder ?? 0),
    cat.isDefault ? '1' : '0',
  ].join('\0');
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
  const hasPendingCategoryWork = pendingDeletes.size > 0 || pendingUpserts.size > 0;

  const byId = new Map<string, Category>();
  const toPush: Category[] = [];
  const staleOps: SyncOp[] = [];
  const remoteById = new Map(remoteCategories.map((cat) => [cat.id, cat]));

  if (hasPendingCategoryWork) {
    // While category ops are in flight, keep optimistic local order/metadata.
    for (const cat of localCategories) {
      if (pendingDeletes.has(cat.id)) continue;
      const payload = pendingUpserts.get(cat.id)?.payload as Category | undefined;
      const next = payload || cat;
      byId.set(next.id, next);
      const remote = remoteById.get(next.id);
      if (!remote || categorySyncSnapshot(remote) !== categorySyncSnapshot(next)) {
        toPush.push(next);
      }
    }
    for (const cat of remoteCategories) {
      if (pendingDeletes.has(cat.id) || byId.has(cat.id)) continue;
      byId.set(cat.id, cat);
    }
  } else {
    for (const cat of remoteCategories) {
      if (!pendingDeletes.has(cat.id)) {
        byId.set(cat.id, cat);
      }
    }

    for (const cat of localCategories) {
      if (pendingDeletes.has(cat.id)) continue;
      if (!byId.has(cat.id)) {
        byId.set(cat.id, cat);
        toPush.push(cat);
      }
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
