import { Category, Task, ThemeMode } from '../types';
import { getTodayDateString } from '../data/initialData';

const TASKS_STORAGE_KEY = 'daily_todos_tasks_v1';
const CATEGORIES_STORAGE_KEY = 'daily_todos_categories_v1';
const THEME_STORAGE_KEY = 'daily_todos_theme_v1';
const AI_ENABLED_STORAGE_KEY = 'daily_todos_ai_enabled_v1';
const SYNC_CHANNEL_NAME = 'daily_todos_channel';

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

// Save tasks to localStorage
export const saveTasks = (tasks: Task[]): void => {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    notifySyncChannel('tasks_updated');
  } catch (err) {
    console.error('Failed to save tasks to storage', err);
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

// Import data from JSON string
export const importDataFromJSON = (jsonText: string): { success: boolean; message: string } => {
  try {
    const data = JSON.parse(jsonText);
    if (!data.tasks || !Array.isArray(data.tasks)) {
      return { success: false, message: 'Invalid backup file: Missing tasks array.' };
    }
    saveTasks(data.tasks);
    if (data.categories && Array.isArray(data.categories)) {
      saveCategories(data.categories);
    }
    return { success: true, message: `Successfully imported ${data.tasks.length} todo items!` };
  } catch (err) {
    return { success: false, message: 'Failed to parse JSON file. Please verify file format.' };
  }
};
