# Vercel AI function

`generate-task-draft.ts` is deployed with the Vite app as
`/api/generate-task-draft`. The Vercel Function calls DeepSeek directly with a
server-only API key.

- `DEEPSEEK_API_KEY` (required, server-only)
- `AI_MODEL=deepseek-v4-flash` (optional; this is the default)
- `DEEPSEEK_BASE_URL=https://api.deepseek.com` (optional)
- `SUPABASE_URL` (optional when `VITE_SUPABASE_URL` already exists)
- `SUPABASE_ANON_KEY` (optional when `VITE_SUPABASE_ANON_KEY` already exists)

The function validates the caller's Supabase access token before calling
DeepSeek. Its daily request limit is intentionally lightweight and stored only
in the current warm Vercel instance; it can reset during deployments, cold
starts, or scaling.
