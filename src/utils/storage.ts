import { Category, Task, ThemeMode } from '../types';
import { getTodayDateString } from '../data/initialData';

const TASKS_STORAGE_KEY = 'daily_todos_tasks_v1';
const CATEGORIES_STORAGE_KEY = 'daily_todos_categories_v1';
const THEME_STORAGE_KEY = 'daily_todos_theme_v1';
const AI_ENABLED_STORAGE_KEY = 'daily_todos_ai_enabled_v1';
const AI_ASSIST_LANGUAGE_STORAGE_KEY = 'daily_todos_ai_assist_language_v1';
const SYNC_CHANNEL_NAME = 'daily_todos_channel';
const TASK_SYNC_CURSOR_KEY_PREFIX = 'daily_todos_task_cursor_v1:';
const GC_LAST_RUN_KEY_PREFIX = 'daily_todos_gc_last_run_v1:';

/**
 * Force a full resync when the cursor has not been refreshed for this long.
 * Must stay well below the 30-day tombstone retention, otherwise a device
 * could miss deletions whose tombstones were already purged.
 */
const SYNC_CURSOR_MAX_AGE_MS = 20 * 24 * 60 * 60 * 1000;
const GC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Conservative localStorage budget (most browsers grant ~5 MB per origin). */
const LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;
const LOCAL_STORAGE_WARN_RATIO = 0.8;
/** When near quota, the local cache keeps only this recent window of tasks. */
export const LOCAL_TASK_RETENTION_DAYS = 30;

export type AiAssistLanguagePreference = 'zh' | 'en';

// Load theme mode
export const loadThemeMode = (): ThemeMode => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (err) {
    console.error('Failed to load theme mode', err);
  }
  return 'light';
};

// Save theme mode
export const saveThemeMode = (mode: ThemeMode): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch (err) {
    console.error('Failed to save theme mode', err);
  }
};

// Load tasks from localStorage without injecting sample data.
export const loadTasks = (): Task[] => {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error('Failed to parse tasks from storage', err);
  }
  return [];
};

export type SaveStorageResult =
  | { ok: true; nearQuota: boolean }
  | { ok: false; quotaExceeded: boolean };

// localStorage counts UTF-16 code units, hence length * 2.
const estimateLocalStorageBytes = (): number => {
  let total = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    total += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
  }
  return total;
};

const isLocalStorageNearQuota = (): boolean => {
  try {
    return (
      estimateLocalStorageBytes() >
      LOCAL_STORAGE_QUOTA_BYTES * LOCAL_STORAGE_WARN_RATIO
    );
  } catch {
    return false;
  }
};

/**
 * Shrink the local cache to the recent retention window. Tasks in keepIds
 * (e.g. rows still waiting in the sync outbox) are always retained because
 * dropping them would lose data the cloud has not received yet.
 */
export const trimTasksToRecentWindow = (
  tasks: Task[],
  options?: { keepIds?: Set<string>; nowMs?: number }
): Task[] => {
  const now = new Date(options?.nowMs ?? Date.now());
  now.setDate(now.getDate() - LOCAL_TASK_RETENTION_DAYS);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const cutoffDate = `${year}-${month}-${day}`;

  return tasks.filter(
    (task) => task.date >= cutoffDate || options?.keepIds?.has(task.id) === true
  );
};

// Save tasks to localStorage
export const saveTasks = (tasks: Task[]): SaveStorageResult => {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    notifySyncChannel('tasks_updated');
    return { ok: true, nearQuota: isLocalStorageNearQuota() };
  } catch (err) {
    console.error('Failed to save tasks to storage', err);
    const quotaExceeded =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22);
    return { ok: false, quotaExceeded };
  }
};

// Load categories from localStorage
export const loadCategories = (): Category[] => {
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error('Failed to parse categories from storage', err);
  }
  return [];
};

export const loadAiEnabled = (): boolean => {
  try {
    return localStorage.getItem(AI_ENABLED_STORAGE_KEY) !== 'false';
  } catch (err) {
    console.error('Failed to load AI preference', err);
    return true;
  }
};

export const saveAiEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(AI_ENABLED_STORAGE_KEY, String(enabled));
  } catch (err) {
    console.error('Failed to save AI preference', err);
  }
};

export const loadAiAssistLanguage = (): AiAssistLanguagePreference => {
  try {
    const saved = localStorage.getItem(AI_ASSIST_LANGUAGE_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch (err) {
    console.error('Failed to load AI Assist language', err);
  }
  return 'zh';
};

export const saveAiAssistLanguage = (language: AiAssistLanguagePreference): void => {
  try {
    localStorage.setItem(AI_ASSIST_LANGUAGE_STORAGE_KEY, language);
  } catch (err) {
    console.error('Failed to save AI Assist language', err);
  }
};

// Save categories to localStorage
export const saveCategories = (categories: Category[]): void => {
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    notifySyncChannel('categories_updated');
  } catch (err) {
    console.error('Failed to save categories to storage', err);
  }
};

// BroadcastChannel for instant multi-tab sync
let channel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch (e) {
    console.warn('BroadcastChannel not supported', e);
  }
}

const notifySyncChannel = (type: string) => {
  if (channel) {
    try {
      channel.postMessage({ type, timestamp: Date.now() });
    } catch (err) {
      console.warn('Failed to broadcast sync event', err);
    }
  }
};

export const subscribeToSyncEvents = (onSync: (type: string) => void) => {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === TASKS_STORAGE_KEY) {
      onSync('tasks_updated');
    } else if (e.key === CATEGORIES_STORAGE_KEY) {
      onSync('categories_updated');
    }
  };

  const handleBroadcast = (e: MessageEvent) => {
    if (e.data && e.data.type) {
      onSync(e.data.type);
    }
  };

  window.addEventListener('storage', handleStorage);
  if (channel) {
    channel.addEventListener('message', handleBroadcast);
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      channel.removeEventListener('message', handleBroadcast);
    }
  };
};

// Export data as JSON file
export const exportDataAsJSON = (filter?: { startDate?: string; endDate?: string }) => {
  const allTasks = loadTasks();
  const categories = loadCategories();

  const tasks = (filter?.startDate || filter?.endDate)
    ? allTasks.filter((t) => {
        if (filter.startDate && t.date < filter.startDate) return false;
        if (filter.endDate && t.date > filter.endDate) return false;
        return true;
      })
    : allTasks;

  const data = {
    app: 'DailyTodoApp',
    version: '1.0',
    exportDate: new Date().toISOString(),
    dateRange: filter?.startDate || filter?.endDate
      ? { start: filter.startDate || 'earliest', end: filter.endDate || 'latest' }
      : undefined,
    tasks,
    categories,
  };

  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `todo-backup-${getTodayDateString()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface ImportDataResult {
  success: boolean;
  message: string;
  tasks?: Task[];
  categories?: Category[];
}

// Import data from JSON string
export const importDataFromJSON = (jsonText: string): ImportDataResult => {
  try {
    const data = JSON.parse(jsonText);
    if (!data.tasks || !Array.isArray(data.tasks)) {
      return { success: false, message: 'Invalid backup file: Missing tasks array.' };
    }
    const tasks = data.tasks as Task[];
    const categories = Array.isArray(data.categories)
      ? (data.categories as Category[])
      : loadCategories();
    saveTasks(tasks);
    saveCategories(categories);
    return {
      success: true,
      message: `Imported ${tasks.length} tasks locally. Syncing to cloud…`,
      tasks,
      categories,
    };
  } catch {
    return { success: false, message: 'Failed to parse JSON file. Please verify file format.' };
  }
};

/** Clear task/category local cache (used on logout to avoid account bleed). */
export const clearLocalUserData = (): void => {
  try {
    localStorage.removeItem(TASKS_STORAGE_KEY);
    localStorage.removeItem(CATEGORIES_STORAGE_KEY);
    notifySyncChannel('tasks_updated');
    notifySyncChannel('categories_updated');
  } catch (err) {
    console.error('Failed to clear local user data', err);
  }
};

// Incremental sync cursor
// ==========================================

interface StoredSyncCursor {
  cursor: string;
  savedAt: number;
}

/** Returns null when absent or too old — callers must then do a full resync. */
export const loadTaskSyncCursor = (userId: string): string | null => {
  try {
    const raw = localStorage.getItem(`${TASK_SYNC_CURSOR_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSyncCursor;
    if (typeof parsed.cursor !== 'string' || typeof parsed.savedAt !== 'number') {
      return null;
    }
    if (Date.now() - parsed.savedAt > SYNC_CURSOR_MAX_AGE_MS) {
      return null;
    }
    return parsed.cursor;
  } catch {
    return null;
  }
};

export const saveTaskSyncCursor = (userId: string, cursor: string): void => {
  try {
    const value: StoredSyncCursor = { cursor, savedAt: Date.now() };
    localStorage.setItem(
      `${TASK_SYNC_CURSOR_KEY_PREFIX}${userId}`,
      JSON.stringify(value)
    );
  } catch (err) {
    console.error('Failed to save sync cursor', err);
  }
};

export const clearTaskSyncCursor = (userId: string): void => {
  try {
    localStorage.removeItem(`${TASK_SYNC_CURSOR_KEY_PREFIX}${userId}`);
  } catch {
    // ignore
  }
};

// Garbage collection throttle (at most once per day per user)
// ==========================================

export const shouldRunStorageGc = (userId: string): boolean => {
  try {
    const raw = localStorage.getItem(`${GC_LAST_RUN_KEY_PREFIX}${userId}`);
    const lastRun = raw ? Number(raw) : 0;
    return !Number.isFinite(lastRun) || Date.now() - lastRun > GC_INTERVAL_MS;
  } catch {
    return false;
  }
};

export const markStorageGcRun = (userId: string): void => {
  try {
    localStorage.setItem(`${GC_LAST_RUN_KEY_PREFIX}${userId}`, String(Date.now()));
  } catch {
    // ignore
  }
};
