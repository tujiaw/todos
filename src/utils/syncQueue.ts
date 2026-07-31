import type { Category, Task } from '../types';

export type SyncOpType =
  | 'upsert_task'
  | 'delete_task'
  | 'upsert_category'
  | 'delete_category';

export interface SyncOp {
  id: string;
  type: SyncOpType;
  entityId: string;
  payload?: Task | Category;
  createdAt: number;
}

const OUTBOX_KEY_PREFIX = 'daily_todos_outbox_v1:';

function storageKey(userId: string): string {
  return `${OUTBOX_KEY_PREFIX}${userId}`;
}

function readOps(userId: string): SyncOp[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOps(userId: string, ops: SyncOp[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ops));
  } catch (err) {
    console.error('Failed to persist sync outbox', err);
  }
}

function makeOpId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function entityKey(op: SyncOp): string {
  const kind = op.type.includes('task') ? 'task' : 'category';
  return `${kind}:${op.entityId}`;
}

/** Collapse redundant ops for the same entity (last write wins in queue). */
export function compactOps(ops: SyncOp[]): SyncOp[] {
  const byEntity = new Map<string, SyncOp>();
  for (const op of ops) {
    const key = entityKey(op);
    const existing = byEntity.get(key);
    if (!existing || op.createdAt >= existing.createdAt) {
      byEntity.set(key, op);
    }
  }
  return Array.from(byEntity.values()).sort((a, b) => a.createdAt - b.createdAt);
}

export function loadOutbox(userId: string): SyncOp[] {
  return compactOps(readOps(userId));
}

export function clearOutbox(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}

export function enqueueOp(
  userId: string,
  type: SyncOpType,
  entityId: string,
  payload?: Task | Category
): SyncOp[] {
  const ops = readOps(userId);
  ops.push({
    id: makeOpId(),
    type,
    entityId,
    payload,
    createdAt: Date.now(),
  });
  const compacted = compactOps(ops);
  writeOps(userId, compacted);
  return compacted;
}

export function replaceOutbox(userId: string, ops: SyncOp[]): void {
  writeOps(userId, compactOps(ops));
}

export function countPendingOps(userId: string): number {
  return loadOutbox(userId).length;
}

export function hasPendingUpsert(
  userId: string,
  entityId: string,
  kind: 'task' | 'category'
): boolean {
  const type = kind === 'task' ? 'upsert_task' : 'upsert_category';
  return loadOutbox(userId).some((op) => op.type === type && op.entityId === entityId);
}

export function pendingTaskIds(userId: string): Set<string> {
  const ids = new Set<string>();
  for (const op of loadOutbox(userId)) {
    if (op.type === 'upsert_task' || op.type === 'delete_task') {
      ids.add(op.entityId);
    }
  }
  return ids;
}
