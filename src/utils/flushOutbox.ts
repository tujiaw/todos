import type { User } from '@supabase/supabase-js';
import type { Category, Task } from '../types';
import {
  deleteCategoryFromSupabase,
  deleteTaskFromSupabase,
  upsertCategoryToSupabase,
  upsertTaskToSupabase,
} from '../lib/supabase';
import { loadOutbox, replaceOutbox, type SyncOp } from './syncQueue';

export type FlushOutboxResult = {
  flushed: number;
  remaining: number;
  lastError?: string;
};

let flushTail: Promise<void> = Promise.resolve();

async function flushOutboxUnlocked(user: User): Promise<FlushOutboxResult> {
  const ops = loadOutbox(user.id);
  if (ops.length === 0) {
    return { flushed: 0, remaining: 0 };
  }

  const remaining: SyncOp[] = [];
  let lastError: string | undefined;

  for (const op of ops) {
    try {
      if (op.type === 'upsert_task') {
        if (!op.payload) throw new Error('Missing task payload');
        await upsertTaskToSupabase(op.payload as Task, user);
      } else if (op.type === 'delete_task') {
        await deleteTaskFromSupabase(op.entityId);
      } else if (op.type === 'upsert_category') {
        if (!op.payload) throw new Error('Missing category payload');
        await upsertCategoryToSupabase(op.payload as Category, user);
      } else if (op.type === 'delete_category') {
        await deleteCategoryFromSupabase(op.entityId);
      }
    } catch (err) {
      remaining.push(op);
      lastError = err instanceof Error ? err.message : 'Sync failed';
    }
  }

  replaceOutbox(user.id, remaining);
  return {
    flushed: ops.length - remaining.length,
    remaining: remaining.length,
    lastError,
  };
}

/** Serialize flushes so concurrent callers cannot wipe each other's outbox. */
export async function flushOutbox(user: User): Promise<FlushOutboxResult> {
  let result: FlushOutboxResult = { flushed: 0, remaining: 0 };
  const run = async () => {
    result = await flushOutboxUnlocked(user);
  };
  const waited = flushTail.then(run, run);
  flushTail = waited.then(
    () => undefined,
    () => undefined
  );
  await waited;
  return result;
}
