# Vercel AI function

The Vite app deploys two authenticated Vercel Functions:

- `/api/generate-task-draft` creates editable task drafts.
- `/api/generate-dashboard-copy` creates one short dashboard message that the
  browser caches for the current day.

Both functions call DeepSeek directly with a server-only API key.

- `DEEPSEEK_API_KEY` (required, server-only)
- `AI_MODEL=deepseek-v4-flash` (optional; this is the default)
- `DEEPSEEK_BASE_URL=https://api.deepseek.com` (optional)
- `SUPABASE_URL` (optional when `VITE_SUPABASE_URL` already exists)
- `SUPABASE_ANON_KEY` (optional when `VITE_SUPABASE_ANON_KEY` already exists)

The function validates the caller's Supabase access token before calling
DeepSeek. Its daily request limit is intentionally lightweight and stored only
in the current warm Vercel instance; it can reset during deployments, cold
starts, or scaling.
