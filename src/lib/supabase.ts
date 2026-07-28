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

const DROP_STORAGE_BUCKET = 'drop-files';
const MAX_DROP_FILE_SIZE = 20 * 1024 * 1024;
const DROP_SIGNED_URL_TTL_SECONDS = 60 * 60;

// All RLS-protected operations must use the user carried by the current
// Supabase session. Do not trust a React state snapshot here: it can briefly
// point at the previous user while OAuth is changing sessions.
export const ensureAuthenticatedUser = async (): Promise<User> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user || data.session.user.is_anonymous) {
    throw new Error('Please sign in with GitHub to continue.');
  }
  return data.session.user;
};

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

const inferDropItemType = (kind?: string, path?: string, mimeType?: string): DropItem['type'] => {
  if (mimeType?.startsWith('image/')) return 'image';
  if (path) return 'file';
  if (kind === 'image') return 'image';
  return 'text';
};

const isDropStoragePath = (path?: string) =>
  Boolean(path && /^[0-9a-f]{8}-[0-9a-f-]{27}\//i.test(path));

const mapDbRowToDropItem = async (row: any): Promise<DropItem> => {
  const path = row.file_path || row.url || row.file_url || row.image_url || undefined;
  const fileName = row.file_name || row.filename || undefined;
  const mimeType = row.mime_type || undefined;
  const type = inferDropItemType(row.kind, path, mimeType);
  let resolvedUrl: string | undefined;

  if (isDropStoragePath(path)) {
    const { data, error } = await supabase.storage
      .from(DROP_STORAGE_BUCKET)
      .createSignedUrl(
        path,
        DROP_SIGNED_URL_TTL_SECONDS,
        type === 'file' ? { download: fileName || true } : undefined
      );

    if (error) {
      console.warn('Could not create signed URL for Drop attachment:', error.message || error);
      resolvedUrl = undefined;
    } else {
      resolvedUrl = data.signedUrl;
    }
  }

  return {
    id: String(row.id),
    content: row.content || row.text || row.message || row.title || '',
    url: resolvedUrl,
    storage_path: isDropStoragePath(path) ? path : undefined,
    file_name: fileName,
    file_size: row.file_size == null ? undefined : Number(row.file_size),
    mime_type: mimeType,
    type,
    created_at: row.created_at || new Date().toISOString(),
    expires_at: row.expires_at || undefined,
    user_id: row.user_id || undefined,
  };
};

export const fetchDropItemsFromSupabase = async (
  options: FetchDropItemsOptions = {}
): Promise<FetchDropItemsResult> => {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const activeUser = await ensureAuthenticatedUser();

  let query = supabase
    .from('drop_items')
    .select('*', { count: 'exact' })
    .eq('user_id', activeUser.id)
    .order('created_at', { ascending: false });

  if (options.searchQuery?.trim()) {
    query = query.ilike('content', `%${options.searchQuery.trim()}%`);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;

  // The query pages from newest to oldest so the first page always contains
  // the latest records. Reverse each page for chat-style oldest-to-newest UI.
  const items = (await Promise.all((data || []).map(mapDbRowToDropItem))).reverse();
  return {
    items,
    hasMore: offset + items.length < (count ?? 0),
  };
};

// Subscribe to real-time changes on drop_items table for instant cross-device updates
export const subscribeToDropItems = (userId: string, onUpdate: () => void) => {
  const channel = supabase
    .channel(`drop_items_changes_${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'drop_items',
        filter: `user_id=eq.${userId}`,
      },
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
const sanitizeStorageFileName = (fileName: string) => {
  const sanitized = fileName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 120);
  return sanitized || 'attachment';
};

const removeStoredAttachments = async (paths: Array<string | undefined>) => {
  const storedPaths = paths.filter((path): path is string => isDropStoragePath(path));
  if (storedPaths.length === 0) return;

  for (let index = 0; index < storedPaths.length; index += 100) {
    const { error } = await supabase.storage
      .from(DROP_STORAGE_BUCKET)
      .remove(storedPaths.slice(index, index + 100));
    if (error) {
      console.warn('Could not remove Drop attachment from Storage:', error.message || error);
    }
  }
};

export const addDropItemToSupabase = async (
  item: Partial<DropItem>,
  attachment?: File
): Promise<DropItem> => {
  const activeUser = await ensureAuthenticatedUser();
  if (attachment && attachment.size > MAX_DROP_FILE_SIZE) {
    throw new Error('Attachments must be 20 MB or smaller.');
  }

  let uploadedPath: string | undefined;
  if (attachment) {
    const objectId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    uploadedPath = `${activeUser.id}/${objectId}-${sanitizeStorageFileName(attachment.name)}`;

    const { error } = await supabase.storage
      .from(DROP_STORAGE_BUCKET)
      .upload(uploadedPath, attachment, {
        cacheControl: '3600',
        contentType: attachment.type || 'application/octet-stream',
        upsert: false,
      });
    if (error) throw error;
  }

  // The deployed constraint accepts "text" and "image". Non-image
  // attachments are distinguished by mime_type in the UI, while using the
  // attachment-compatible database kind.
  const kind = attachment ? 'image' : 'text';

  const payload = {
    user_id: activeUser.id,
    kind,
    content: item.content || '',
    file_path: uploadedPath || null,
    file_name: attachment?.name || item.file_name || null,
    file_size: attachment?.size ?? item.file_size ?? null,
    mime_type: attachment?.type || item.mime_type || null,
    // Use 89 days rather than exactly 90 so modest client/server clock skew
    // cannot push the row beyond the policy's 90-day upper bound.
    expires_at: new Date(Date.now() + 89 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const { data, error } = await supabase.from('drop_items').insert(payload).select().single();

  if (error) {
    if (uploadedPath) await removeStoredAttachments([uploadedPath]);
    console.error('Insert to drop_items failed:', error.message || error);
    throw error;
  }

  return await mapDbRowToDropItem(data);
};

// Delete a Drop item from Supabase drop_items table
export const deleteDropItemFromSupabase = async (id: string) => {
  const activeUser = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('drop_items')
    .delete()
    .eq('id', id)
    .eq('user_id', activeUser.id)
    .select('id,file_path');
  if (error) throw error;
  if (!data?.length) throw new Error('Drop item was not found or you no longer have permission to delete it.');
  await removeStoredAttachments(data.map((row: any) => row.file_path));
};

// Clear all Drop items from Supabase
export const clearAllDropItemsFromSupabase = async () => {
  const activeUser = await ensureAuthenticatedUser();
  const { data: existingItems, error: fetchError } = await supabase
    .from('drop_items')
    .select('file_path')
    .eq('user_id', activeUser.id);
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('drop_items')
    .delete()
    .eq('user_id', activeUser.id);
  if (error) throw error;
  await removeStoredAttachments((existingItems || []).map((row: any) => row.file_path));
};
