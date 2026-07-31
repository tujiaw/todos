import type { Category, Task } from '../types';
import type { SyncOp } from './syncQueue';

export function mergeTasksLww(
  localTasks: Task[],
  remoteTasks: Task[],
  pendingOps: SyncOp[]
): { merged: Task[]; toPush: Task[] } {
  const pendingDeletes = new Set(
    pendingOps.filter((op) => op.type === 'delete_task').map((op) => op.entityId)
  );
  const pendingUpserts = new Map(
    pendingOps
      .filter((op) => op.type === 'upsert_task' && op.payload)
      .map((op) => [op.entityId, op.payload as Task])
  );

  const localById = new Map(localTasks.map((task) => [task.id, task]));
  const remoteById = new Map(remoteTasks.map((task) => [task.id, task]));
  const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

  const merged: Task[] = [];
  const toPush: Task[] = [];

  for (const id of allIds) {
    if (pendingDeletes.has(id)) {
      continue;
    }

    const pending = pendingUpserts.get(id);
    const local = pending || localById.get(id);
    const remote = remoteById.get(id);

    if (local && remote) {
      // Pending outbox upsert always wins over remote (unsynced local edit).
      const winner = pending || (local.updatedAt >= remote.updatedAt ? local : remote);
      merged.push(winner);
      if (winner === local || pending) {
        if (pending || local.updatedAt !== remote.updatedAt) {
          toPush.push(winner);
        }
      }
      continue;
    }

    if (local && !remote) {
      // Local-only: keep and push unless we know remote deleted it
      // (no pending upsert and not in local from a fresh create → treat as remote delete)
      if (pending || pendingUpserts.has(id)) {
        merged.push(local);
        toPush.push(local);
      } else {
        // Remote missing and no pending upsert → remote delete wins
        continue;
      }
      continue;
    }

    if (!local && remote) {
      merged.push(remote);
    }
  }

  merged.sort((a, b) => b.createdAt - a.createdAt);
  return { merged, toPush };
}

export function mergeCategories(
  localCategories: Category[],
  remoteCategories: Category[],
  pendingOps: SyncOp[]
): { merged: Category[]; toPush: Category[] } {
  const pendingDeletes = new Set(
    pendingOps.filter((op) => op.type === 'delete_category').map((op) => op.entityId)
  );
  const pendingUpserts = new Map(
    pendingOps
      .filter((op) => op.type === 'upsert_category' && op.payload)
      .map((op) => [op.entityId, op.payload as Category])
  );

  const byId = new Map<string, Category>();
  const toPush: Category[] = [];

  for (const cat of remoteCategories) {
    if (!pendingDeletes.has(cat.id)) {
      byId.set(cat.id, cat);
    }
  }

  for (const cat of localCategories) {
    if (pendingDeletes.has(cat.id)) continue;
    const pending = pendingUpserts.get(cat.id);
    if (pending) {
      byId.set(cat.id, pending);
      toPush.push(pending);
      continue;
    }
    if (!byId.has(cat.id)) {
      byId.set(cat.id, cat);
      toPush.push(cat);
    }
  }

  for (const [id, cat] of pendingUpserts) {
    if (pendingDeletes.has(id)) continue;
    byId.set(id, cat);
    if (!toPush.some((item) => item.id === id)) {
      toPush.push(cat);
    }
  }

  return { merged: Array.from(byId.values()), toPush };
}
