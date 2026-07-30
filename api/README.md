# Vercel AI function

`generate-task-draft.ts` is deployed with the Vite app as
`/api/generate-task-draft`. It uses Vercel AI Gateway through the AI SDK.
Production deployments authenticate to the Gateway with Vercel's automatically
managed OIDC token. The Gateway then calls DeepSeek with your own server-side
key through request-scoped BYOK.

- `DEEPSEEK_API_KEY` (required, server-only)
- `AI_MODEL=deepseek/deepseek-v4-flash` (optional; this is the default)
- `SUPABASE_URL` (optional when `VITE_SUPABASE_URL` already exists)
- `SUPABASE_ANON_KEY` (optional when `VITE_SUPABASE_ANON_KEY` already exists)

The function validates the caller's Supabase access token before calling
AI Gateway. Gateway requests include the Supabase user ID and a
`feature:task-draft` tag for usage attribution, pass only the configured
DeepSeek credential, and restrict routing to DeepSeek. The daily request limit
is intentionally lightweight and stored only in the current warm Vercel
instance; it can reset during deployments, cold starts, or scaling.

For local Gateway calls, link the project and pull a short-lived OIDC token:

```sh
vercel link
vercel env pull .env.local
```
