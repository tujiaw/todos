export interface DashboardCopy {
  title: string;
  subtitle: string;
}

interface CachedDashboardCopy extends DashboardCopy {
  date: string;
}

const DASHBOARD_COPY_STORAGE_KEY = 'daily_todos_dashboard_copy_v1';

export function loadCachedDashboardCopy(date: string): DashboardCopy | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_COPY_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedDashboardCopy;
    if (
      !cached ||
      cached.date !== date ||
      typeof cached.title !== 'string' ||
      !cached.title.trim() ||
      cached.title.length > 60 ||
      typeof cached.subtitle !== 'string' ||
      !cached.subtitle.trim() ||
      cached.subtitle.length > 120
    ) {
      return null;
    }
    return { title: cached.title, subtitle: cached.subtitle };
  } catch {
    return null;
  }
}

export function saveCachedDashboardCopy(date: string, copy: DashboardCopy): void {
  try {
    localStorage.setItem(
      DASHBOARD_COPY_STORAGE_KEY,
      JSON.stringify({ date, ...copy } satisfies CachedDashboardCopy)
    );
  } catch (error) {
    console.warn('Failed to cache dashboard copy', error);
  }
}
