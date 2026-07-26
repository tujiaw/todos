export type Priority = 'low' | 'medium' | 'high';
export type ThemeMode = 'light' | 'dark';

export interface Category {
  id: string;
  name: string;
  color: string; // Tailwind color name or hex code
  bgClass: string;
  textClass: string;
  borderClass: string;
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
  file_name?: string;
  type?: 'text' | 'link' | 'image' | 'file';
  created_at: string | number;
  user_id?: string;
}
