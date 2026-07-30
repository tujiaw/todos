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
