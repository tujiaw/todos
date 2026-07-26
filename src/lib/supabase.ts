import { createClient, User, Session } from '@supabase/supabase-js';
import { Category, Task, DropItem } from '../types';

const metaEnv = (import.meta as any).env || {};
const SUPABASE_URL = metaEnv.VITE_SUPABASE_URL || 'https://cywbnbvverbdjbbpvsid.supabase.co';
const SUPABASE_ANON_KEY =
  metaEnv.VITE_SUPABASE_ANON_KEY || 'sb_publishable_VhadPbA-uUCplS280kingw_BUmYmQAQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Check if running in popup window after OAuth redirect
if (
  typeof window !== 'undefined' &&
  window.opener &&
  (window.location.hash.includes('access_token') || window.location.search.includes('code='))
) {
  const handlePopupAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        window.opener.postMessage({ type: 'SUPABASE_OAUTH_SUCCESS', session }, '*');
        window.close();
        return;
      }
    } catch (err) {
      console.warn('Error getting session in popup:', err);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        try {
          window.opener.postMessage({ type: 'SUPABASE_OAUTH_SUCCESS', session }, '*');
        } catch (e) {
          console.warn('Failed to communicate with opener window', e);
        }
        authListener.subscription.unsubscribe();
        window.close();
      }
    });

    setTimeout(() => {
      window.close();
    }, 4000);
  };

  handlePopupAuth();
}

// GitHub OAuth Login
export const loginWithGitHub = async () => {
  const redirectUrl = window.location.origin;

  // Try popup mode first for iframe compatibility
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    console.error('GitHub auth error:', error);
    throw error;
  }

  if (data?.url) {
    const popup = window.open(data.url, 'github_oauth_popup', 'width=600,height=720');
    if (!popup) {
      // Fallback to top-level redirect if popup is blocked
      window.location.href = data.url;
    }
  }
};

// Sign Out
export const logoutSupabase = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

// Map DB Task row to frontend Task
const mapDbRowToTask = (row: any): Task => ({
  id: row.id,
  title: row.title,
  description: row.description || undefined,
  date: row.date,
  completed: row.completed,
  categoryId: row.category_id,
  priority: row.priority || 'medium',
  dueTime: row.due_time || undefined,
  estimatedMinutes: row.estimated_minutes || undefined,
  imageUrl: row.image_url || undefined,
  subtasks: Array.isArray(row.subtasks) ? row.subtasks : [],
  pinned: row.pinned || false,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});

// Map frontend Task to DB Row
const mapTaskToDbRow = (task: Task, userId: string) => ({
  id: task.id,
  user_id: userId,
  title: task.title,
  description: task.description || null,
  date: task.date,
  completed: task.completed,
  category_id: task.categoryId,
  priority: task.priority,
  due_time: task.dueTime || null,
  estimated_minutes: task.estimatedMinutes || null,
  image_url: task.imageUrl || null,
  subtasks: task.subtasks || [],
  pinned: task.pinned || false,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
});

// Map DB Category row to frontend Category
const mapDbRowToCategory = (row: any): Category => ({
  id: row.id,
  name: row.name,
  color: row.color,
  bgClass: row.bg_class,
  textClass: row.text_class,
  borderClass: row.border_class,
  isDefault: row.is_default || false,
});

// Map frontend Category to DB Row
const mapCategoryToDbRow = (cat: Category, userId: string) => ({
  id: cat.id,
  user_id: userId,
  name: cat.name,
  color: cat.color,
  bg_class: cat.bgClass,
  text_class: cat.textClass,
  border_class: cat.borderClass,
  is_default: cat.isDefault || false,
});

// Fetch tasks from Supabase
export const fetchTasksFromSupabase = async (): Promise<Task[]> => {
  const { data, error } = await supabase
    .from('todo_tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching tasks from Supabase:', error);
    throw error;
  }

  return (data || []).map(mapDbRowToTask);
};

// Upsert a task to Supabase
export const upsertTaskToSupabase = async (task: Task, user: User) => {
  const row = mapTaskToDbRow(task, user.id);
  const { error } = await supabase.from('todo_tasks').upsert(row);
  if (error) {
    console.error('Error saving task to Supabase:', error);
    throw error;
  }
};

// Delete a task from Supabase
export const deleteTaskFromSupabase = async (taskId: string) => {
  const { error } = await supabase.from('todo_tasks').delete().eq('id', taskId);
  if (error) {
    console.error('Error deleting task from Supabase:', error);
    throw error;
  }
};

// Sync multiple tasks to Supabase
export const syncAllTasksToSupabase = async (tasks: Task[], user: User) => {
  if (tasks.length === 0) return;
  const rows = tasks.map((t) => mapTaskToDbRow(t, user.id));
  const { error } = await supabase.from('todo_tasks').upsert(rows);
  if (error) {
    console.error('Error syncing all tasks to Supabase:', error);
    throw error;
  }
};

// Fetch categories from Supabase
export const fetchCategoriesFromSupabase = async (): Promise<Category[]> => {
  const { data, error } = await supabase.from('todo_categories').select('*');

  if (error) {
    console.error('Error fetching categories from Supabase:', error);
    throw error;
  }

  return (data || []).map(mapDbRowToCategory);
};

// Upsert category to Supabase
export const upsertCategoryToSupabase = async (category: Category, user: User) => {
  const row = mapCategoryToDbRow(category, user.id);
  const { error } = await supabase.from('todo_categories').upsert(row);
  if (error) {
    console.error('Error saving category to Supabase:', error);
    throw error;
  }
};

// ==========================================
// Edge Drop Items Supabase Integration
// ==========================================
// Edge Drop Items Supabase Integration
// ==========================================

// Fetch Drop items with pagination (50 items max) and server-side search
export interface FetchDropItemsOptions {
  limit?: number;
  offset?: number;
  searchQuery?: string;
}

export interface FetchDropItemsResult {
  items: DropItem[];
  hasMore: boolean;
}

export const fetchDropItemsFromSupabase = async (
  options: FetchDropItemsOptions = {}
): Promise<FetchDropItemsResult | null> => {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  try {
    let query = supabase
      .from('drop_items')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (options.searchQuery && options.searchQuery.trim() !== '') {
      const q = options.searchQuery.trim();
      query = query.ilike('content', `%${q}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.warn('Warning fetching drop_items from Supabase:', error.message || error);
      return null;
    }

    const items: DropItem[] = (data || []).map((row: any) => ({
      id: String(row.id),
      content: row.content || row.text || row.message || row.title || '',
      url: row.file_path || row.url || row.file_url || row.image_url || undefined,
      file_name: row.file_name || row.filename || undefined,
      type: (row.kind === 'image' || row.file_path || row.url) ? 'image' : 'text',
      created_at: row.created_at || new Date().toISOString(),
      user_id: row.user_id || undefined,
    }));

    const totalCount = count ?? 0;
    const hasMore = offset + items.length < totalCount;

    return { items, hasMore };
  } catch (err) {
    console.warn('Failed to fetch drop items from Supabase:', err);
    return null;
  }
};

// Subscribe to real-time changes on drop_items table for instant cross-device updates
export const subscribeToDropItems = (onUpdate: () => void) => {
  const channel = supabase
    .channel('public_drop_items_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'drop_items' },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// Add / Insert a new Drop item to Supabase drop_items table
export const addDropItemToSupabase = async (item: Partial<DropItem>, user?: User | null): Promise<DropItem> => {
  let activeUserId = user?.id;

  if (!activeUserId) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      activeUserId = userData?.user?.id;

      if (!activeUserId) {
        const { data: anonData } = await supabase.auth.signInAnonymously();
        activeUserId = anonData?.user?.id;
      }
    } catch (e) {
      console.warn('Could not retrieve or create auth session for drop_items:', e);
    }
  }

  const kind = item.url ? 'image' : 'text';

  const payload: Record<string, any> = {
    kind,
    content: item.content || '',
  };

  if (activeUserId) {
    payload.user_id = activeUserId;
  }

  if (item.url) {
    payload.file_path = item.url;
  }

  if (item.file_name) {
    payload.file_name = item.file_name;
  }

  const { data, error } = await supabase.from('drop_items').insert(payload).select();

  if (error) {
    console.error('Insert to drop_items failed:', error.message || error);
    throw new Error(error.message || 'Failed to save drop item to Supabase database');
  }

  if (data && data.length > 0) {
    const row = data[0];
    return {
      id: String(row.id),
      content: row.content || item.content || '',
      url: row.file_path || row.url || item.url,
      file_name: row.file_name || item.file_name,
      type: (row.kind === 'image' || row.file_path || item.url) ? 'image' : 'text',
      created_at: row.created_at || new Date().toISOString(),
      user_id: row.user_id || activeUserId,
    };
  }

  throw new Error('Database insert succeeded but returned no row data.');
};

// Delete a Drop item from Supabase drop_items table
export const deleteDropItemFromSupabase = async (id: string) => {
  try {
    const { error } = await supabase.from('drop_items').delete().eq('id', id);
    if (error) {
      console.warn('Could not delete drop_item from Supabase:', error.message || error);
    }
  } catch (err) {
    console.warn('Exception deleting drop_item from Supabase:', err);
  }
};

// Clear all Drop items from Supabase
export const clearAllDropItemsFromSupabase = async (userId?: string) => {
  try {
    let query = supabase.from('drop_items').delete();
    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.neq('id', '0');
    }
    const { error } = await query;
    if (error) {
      console.warn('Could not clear drop_items from Supabase:', error.message || error);
    }
  } catch (err) {
    console.warn('Exception clearing drop_items from Supabase:', err);
  }
};
