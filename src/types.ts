export type Priority = 'low' | 'medium' | 'high';
export type ThemeMode = 'light' | 'dark';

export interface Category {
  id: string;
  name: string;
  color: string; // Tailwind color name or hex code
  bgClass: string;
  textClass: string;
  borderClass: string;
  /** Lower comes first; index 0 is the default category. */
  sortOrder?: number;
  isDefault?: boolean;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD format
  completed: boolean;
  categoryId: string;
  priority: Priority;
  dueTime?: string; // e.g., "14:30"
  estimatedMinutes?: number;
  imageUrl?: string; // Image attachment (Base64 data URL or HTTP URL)
  subtasks: SubTask[];
  pinned?: boolean;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

export interface TaskDraft {
  title: string;
  description?: string;
  date: string;
  dueTime?: string;
  estimatedMinutes?: number;
  categoryId: string;
  priority: Priority;
  subtasks: string[];
}

export type TaskFilterStatus = 'all' | 'pending' | 'completed' | 'high_priority';

export type SortByOption = 'createdAt' | 'priority' | 'dueTime' | 'category';

export interface DailyStats {
  date: string;
  total: number;
  completed: number;
  completionRate: number;
}

export interface DropItem {
  id: string;
  content: string;
  url?: string;
  storage_path?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  type?: 'text' | 'link' | 'image' | 'file';
  created_at: string | number;
  expires_at?: string | number;
  user_id?: string;
}
