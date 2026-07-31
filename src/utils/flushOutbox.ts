import type { User } from '@supabase/supabase-js';
import type { Category, Task } from '../types';
import {
  deleteCategoryFromSupabase,
  deleteTaskFromSupabase,
  upsertCategoryToSupabase,
  upsertTaskToSupabase,
} from '../lib/supabase';
import { loadOutbox, replaceOutbox, type SyncOp } from './syncQueue';

export async function flushOutbox(
  user: User
): Promise<{ flushed: number; remaining: number; lastError?: string }> {
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
