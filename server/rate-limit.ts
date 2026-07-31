export const DAILY_AI_LIMIT = 50;
export const DAILY_LIMIT_MESSAGE = '今日 AI 调用次数已达 50 次，请明天再继续使用。';

interface UsageEntry {
  date: string;
  count: number;
}

export class InMemoryDailyRateLimiter {
  private readonly usage = new Map<string, UsageEntry>();

  consume(userId: string, date: string): number {
    const current = this.usage.get(userId);
    if (!current || current.date !== date) {
      this.usage.set(userId, { date, count: 1 });
      return 1;
    }
    if (current.count >= DAILY_AI_LIMIT) return -1;
    current.count += 1;
    return current.count;
  }
}

export function getShanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export type QuotaConsumeResult = {
  count: number;
  limitScope: 'supabase' | 'vercel-instance';
};

/**
 * Prefer durable Supabase RPC. Falls back to in-memory limiter when RPC is unavailable.
 */
export async function consumeAiQuota(options: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
  userId: string;
  memoryLimiter: InMemoryDailyRateLimiter;
  limit?: number;
}): Promise<QuotaConsumeResult> {
  const limit = options.limit ?? DAILY_AI_LIMIT;
  const date = getShanghaiDate();

  try {
    const response = await fetch(`${options.supabaseUrl}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: {
        apikey: options.supabaseAnonKey,
        Authorization: `Bearer ${options.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_limit: limit }),
    });

    if (response.ok) {
      const count = Number(await response.json());
      if (!Number.isFinite(count)) {
        throw new Error('Invalid quota response');
      }
      return { count, limitScope: 'supabase' };
    }

    // Missing RPC / table → soft fallback for local/dev
    if (response.status === 404 || response.status === 400) {
      const count = options.memoryLimiter.consume(options.userId, date);
      return { count, limitScope: 'vercel-instance' };
    }

    throw new Error(`Quota RPC failed (${response.status})`);
  } catch {
    const count = options.memoryLimiter.consume(options.userId, date);
    return { count, limitScope: 'vercel-instance' };
  }
}
