# AI task drafting

The `generate-task-draft` Edge Function keeps the model API key outside the
browser and requires a valid Supabase user session. Run `supabase_schema.sql`
before deploying so the atomic, per-user daily quota function is available.
The quota allows 50 AI requests per `Asia/Shanghai` calendar day.

Configure and deploy it with the Supabase CLI:

```sh
supabase secrets set AI_PROVIDER=deepseek
supabase secrets set AI_MODEL=deepseek-v4-flash
supabase secrets set DEEPSEEK_API_KEY=your-deepseek-api-key
supabase functions deploy generate-task-draft
```

Use `deepseek-v4-pro` for `AI_MODEL` only when representative task-drafting
tests show that the additional quality is worth the latency and cost.
