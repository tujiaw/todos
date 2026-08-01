import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DAILY_AI_LIMIT,
  getShanghaiDate,
  InMemoryDailyRateLimiter,
} from '../server/rate-limit.ts';

const schema = readFileSync(new URL('../supabase_schema.sql', import.meta.url), 'utf8');

test('lightweight limiter allows 50 requests and rejects the next one', () => {
  const limiter = new InMemoryDailyRateLimiter();
  for (let count = 1; count <= DAILY_AI_LIMIT; count += 1) {
    assert.equal(limiter.consume('user-1', '2026-07-30'), count);
  }
  assert.equal(limiter.consume('user-1', '2026-07-30'), -1);
});

test('lightweight limiter resets for a new Shanghai calendar day', () => {
  const limiter = new InMemoryDailyRateLimiter();
  assert.equal(limiter.consume('user-1', '2026-07-30'), 1);
  assert.equal(limiter.consume('user-1', '2026-07-31'), 1);
  assert.equal(getShanghaiDate(new Date('2026-07-30T16:30:00Z')), '2026-07-31');
});

test('Supabase schema defines durable AI quota RPC', () => {
  assert.match(schema, /create table public\.ai_daily_usage/);
  assert.match(schema, /create function public\.consume_ai_quota/);
  assert.match(schema, /grant execute on function public\.consume_ai_quota/);
});

test('Supabase schema defines zero-knowledge vault tables', () => {
  assert.match(schema, /create table if not exists public\.vault_meta/);
  assert.match(schema, /create table if not exists public\.vault_items/);
  assert.match(schema, /vault_items_select_own/);
  assert.match(schema, /verifier_ciphertext/);
});
