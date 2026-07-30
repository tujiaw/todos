import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../supabase_schema.sql', import.meta.url), 'utf8');
const syncModal = readFileSync(
  new URL('../src/components/SyncModal.tsx', import.meta.url),
  'utf8'
);
const edgeFunction = readFileSync(
  new URL('../supabase/functions/generate-task-draft/index.ts', import.meta.url),
  'utf8'
);

test('database schema enforces an atomic daily limit of 50', () => {
  assert.match(schema, /create table if not exists public\.ai_daily_usage/);
  assert.match(schema, /primary key \(user_id, usage_date\)/);
  assert.match(schema, /call_count < 50/);
  assert.match(schema, /time zone 'Asia\/Shanghai'/);
  assert.match(schema, /create or replace function public\.consume_ai_daily_quota/);
});

test('in-app schema copy includes the same daily quota function', () => {
  assert.match(syncModal, /create table if not exists public\.ai_daily_usage/);
  assert.match(syncModal, /call_count < 50/);
  assert.match(syncModal, /grant execute on function public\.consume_ai_daily_quota/);
});

test('edge function consumes quota before calling DeepSeek and returns tomorrow message', () => {
  const quotaPosition = edgeFunction.indexOf('await consumeDailyQuota(request)');
  const generationPosition = edgeFunction.indexOf('await generateValidatedDraft(provider, input)');
  assert.ok(quotaPosition > 0);
  assert.ok(generationPosition > quotaPosition);
  assert.match(edgeFunction, /今日 AI 调用次数已达 50 次，请明天再继续使用。/);
  assert.match(edgeFunction, /dailyLimit: 50/);
});
