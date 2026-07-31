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
const dashboardCopyFunction = readFileSync(
  new URL('../api/generate-dashboard-copy.ts', import.meta.url),
  'utf8'
);
const aiClient = readFileSync(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const syncModal = readFileSync(
  new URL('../src/components/SyncModal.tsx', import.meta.url),
  'utf8'
);
const storage = readFileSync(new URL('../src/utils/storage.ts', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const taskInput = readFileSync(
  new URL('../src/components/TaskInput.tsx', import.meta.url),
  'utf8'
);
const aiProvider = readFileSync(
  new URL('../server/providers.ts', import.meta.url),
  'utf8'
);

test('PWA metadata includes the current mobile capability tag', () => {
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes" \/>/);
});

test('AI requests use a same-origin Vercel Function and direct DeepSeek provider', () => {
  const weeklySummaryFunction = readFileSync(
    new URL('../api/generate-weekly-summary.ts', import.meta.url),
    'utf8'
  );
  const aiAssistFunction = readFileSync(
    new URL('../api/generate-ai-assist.ts', import.meta.url),
    'utf8'
  );

  assert.match(vercelConfig, /api\/generate-task-draft\.ts/);
  assert.match(vercelConfig, /api\/generate-dashboard-copy\.ts/);
  assert.match(vercelConfig, /api\/generate-weekly-summary\.ts/);
  assert.match(vercelConfig, /api\/generate-ai-assist\.ts/);
  assert.match(vercelFunction, /from '\.\.\/server\/providers\.js'/);
  assert.match(vercelFunction, /from '\.\.\/server\/rate-limit\.js'/);
  assert.match(vercelFunction, /from '\.\.\/server\/task-draft\.js'/);
  assert.match(vercelFunction, /await authenticate/);
  assert.match(vercelFunction, /deepseek-v4-flash/);
  assert.match(vercelFunction, /DEEPSEEK_API_KEY/);
  assert.match(aiProvider, /api\.deepseek\.com/);
  assert.match(aiProvider, /response_format: \{ type: 'json_object' \}/);
  assert.match(aiProvider, /thinking: \{ type: 'disabled' \}/);
  assert.doesNotMatch(aiProvider, /generateText|byok/);
  assert.doesNotMatch(packageJson, /"ai"\s*:/);
  assert.match(aiClient, /fetch\('\/api\/generate-task-draft'/);
  assert.match(aiClient, /fetch\('\/api\/generate-dashboard-copy'/);
  assert.match(aiClient, /fetch\('\/api\/generate-ai-assist'/);
  assert.match(dashboardCopyFunction, /await authenticate/);
  assert.match(dashboardCopyFunction, /DeepSeekJsonProvider/);
  assert.match(weeklySummaryFunction, /await authenticate/);
  assert.match(weeklySummaryFunction, /DeepSeekJsonProvider/);
  assert.match(weeklySummaryFunction, /weekly-summary\.js/);
  assert.match(aiAssistFunction, /await authenticate/);
  assert.match(aiAssistFunction, /ai-assist\.js/);
  assert.match(aiClient, /await response\.text\(\)/);
  assert.match(aiClient, /FUNCTION\|EDGE_FUNCTION/);
  assert.doesNotMatch(aiClient, /supabase\.functions\.invoke/);
});

test('global AI preference disables AI UI and uses daily dashboard cache', () => {
  assert.match(storage, /daily_todos_ai_enabled_v1/);
  assert.match(syncModal, /role="switch"/);
  assert.match(syncModal, /AI Features/);
  assert.match(syncModal, /Week menu AI assists/);
  assert.match(app, /aiEnabled=\{aiEnabled\}/);
  assert.match(app, /onOpenAiAssist=\{handleOpenAiAssist\}/);
  const progressBar = readFileSync(
    new URL('../src/components/ProgressBar.tsx', import.meta.url),
    'utf8'
  );
  assert.match(progressBar, /AI Assist/);
  assert.match(progressBar, /setWeekOffset\(0\)/);
  assert.match(progressBar, /aria-haspopup="menu"/);
  const aiAssistModal = readFileSync(
    new URL('../src/components/AiAssistModal.tsx', import.meta.url),
    'utf8'
  );
  assert.match(aiAssistModal, /Copy-ready notes/);
  assert.match(aiAssistModal, /disabled=\{!result\?\.copyText\}/);
  assert.match(app, /setDashboardCopy\(DEFAULT_DASHBOARD_COPY\)/);
  assert.match(aiClient, /daily_todos_dashboard_copy_v1/);
  assert.match(aiClient, /cached\.date !== date/);
  assert.match(taskInput, /\{aiEnabled && \(/);
});

test('Drop remains a text and file transfer surface without task AI actions', () => {
  const dropModal = readFileSync(
    new URL('../src/components/DropModal.tsx', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(dropModal, /onGenerateTaskDraft|AI Task|handleGenerateDraft/);
  assert.doesNotMatch(dropModal, /onConvertToTask|\+ Task|handleConvert/);
  assert.match(dropModal, /sm:w-\[420px\] lg:w-\[440px\]/);
  assert.match(dropModal, /rows=\{1\}/);

  const attachIndex = dropModal.indexOf('title="Attach file or image"');
  const inputIndex = dropModal.indexOf('<textarea', attachIndex);
  const sendIndex = dropModal.indexOf("title={isAuthenticated ? 'Send drop note'", inputIndex);
  assert.ok(attachIndex >= 0 && inputIndex > attachIndex && sendIndex > inputIndex);
});

test('task input adds on Enter and drafts with AI via modifier or button', () => {
  const addButtonIndex = taskInput.indexOf('id="btn-add-task-submit"');
  const aiButtonIndex = taskInput.indexOf('aria-label="Generate AI task draft"');

  assert.ok(addButtonIndex >= 0);
  assert.ok(aiButtonIndex > addButtonIndex);
  assert.match(taskInput, /<form onSubmit=\{handleFormSubmit\}>/);
  assert.match(
    taskInput,
    /const handleFormSubmit[\s\S]*event\.preventDefault\(\);[\s\S]*handleAddTask\(\);/
  );
  assert.match(taskInput, /metaKey \|\| event\.ctrlKey/);
  assert.match(taskInput, /useState<string>\(''\)/);
  assert.match(taskInput, /dueTime: dueTime \|\| undefined/);
  assert.match(taskInput, /Write a task and press Enter\.\.\./);
});
