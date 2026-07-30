import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercelConfig = readFileSync(
  new URL('../vercel.json', import.meta.url),
  'utf8'
);
const vercelFunction = readFileSync(
  new URL('../api/generate-task-draft.ts', import.meta.url),
  'utf8'
);
const aiClient = readFileSync(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const aiProvider = readFileSync(
  new URL('../server/providers.ts', import.meta.url),
  'utf8'
);

test('PWA metadata includes the current mobile capability tag', () => {
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes" \/>/);
});

test('AI requests use a same-origin Vercel Function with server auth', () => {
  assert.match(vercelConfig, /api\/generate-task-draft\.ts/);
  assert.match(vercelFunction, /await authenticate/);
  assert.match(vercelFunction, /deepseek\/deepseek-v4-flash/);
  assert.match(vercelFunction, /DEEPSEEK_API_KEY/);
  assert.match(aiProvider, /generateText/);
  assert.match(aiProvider, /byok/);
  assert.match(aiProvider, /only: \['deepseek'\]/);
  assert.match(aiProvider, /feature:task-draft/);
  assert.doesNotMatch(aiProvider, /api\.deepseek\.com/);
  assert.match(aiClient, /fetch\('\/api\/generate-task-draft'/);
  assert.doesNotMatch(aiClient, /supabase\.functions\.invoke/);
});
