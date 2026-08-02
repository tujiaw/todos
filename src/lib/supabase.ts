import { createClient, User, Session } from '@supabase/supabase-js';
import { Category, Task, DropItem } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

const DROP_STORAGE_BUCKET = 'drop-files';
const MAX_DROP_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TASK_IMAGE_SIZE = 5 * 1024 * 1024;
const DROP_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
export const STORAGE_PATH_PREFIX = 'storage:';
const OAUTH_PENDING_KEY = 'auth_oauth_pending';

/** Mark that we are leaving for an OAuth provider (survives the redirect). */
export const markOAuthLoginPending = () => {
  try {
    sessionStorage.setItem(OAUTH_PENDING_KEY, '1');
  } catch {
    // ignore
  }
};

export const clearOAuthLoginPending = () => {
  try {
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
  } catch {
    // ignore
  }
};

/** True while returning from OAuth / email confirm with a code still being exchanged. */
export const isOAuthCallbackPending = (): boolean => {
  if (typeof window === 'undefined') return false;
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (
    queryParams.has('code') ||
    queryParams.has('error') ||
    queryParams.has('error_description') ||
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    hashParams.has('error') ||
    hashParams.has('error_description')
  ) {
    return true;
  }
  try {
    return sessionStorage.getItem(OAUTH_PENDING_KEY) === '1';
  } catch {
    return false;
  }
};

// Explicitly exchange PKCE OAuth callbacks before rendering the application.
export const initializeAuthSession = async (): Promise<Session | null> => {
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const authCode = queryParams.get('code');
  const hasLegacyTokens =
    hashParams.has('access_token') || hashParams.has('refresh_token');
  const oauthError =
    queryParams.get('error_description') ||
    queryParams.get('error') ||
    hashParams.get('error_description') ||
    hashParams.get('error');

  if (authCode || hasLegacyTokens || oauthError) {
    window.history.replaceState(
      window.history.state,
      document.title,
      window.location.pathname
    );
  }

  if (oauthError) {
    throw new Error(oauthError);
  }

  if (authCode) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (error) throw error;
    return data.session;
  }

  if (hasLegacyTokens) {
    throw new Error('登录流程已升级，请重新登录。');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};

// All RLS-protected operations must use the user carried by the current
// Supabase session. Do not trust a React state snapshot here: it can briefly
// point at the previous user while OAuth is changing sessions.
export const ensureAuthenticatedUser = async (): Promise<User> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user || data.session.user.is_anonymous) {
    throw new Error('请先登录后再继续。');
  }
  return data.session.user;
};

export type EmailAuthResult = {
  session: Session | null;
  needsEmailConfirmation: boolean;
};

const normalizeAuthEmail = (email: string) => email.trim().toLowerCase();

export const signInWithEmail = async (
  email: string,
  password: string
): Promise<EmailAuthResult> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeAuthEmail(email),
    password,
  });
  if (error) throw error;
  return {
    session: data.session,
    needsEmailConfirmation: false,
  };
};

export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<EmailAuthResult> => {
  const { data, error } = await supabase.auth.signUp({
    email: normalizeAuthEmail(email),
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (error) throw error;

  // When email already exists, Supabase may return a user with empty identities
  // and no session (anti-enumeration). That is NOT a successful new signup.
  const identities = data.user?.identities ?? [];
  if (data.user && identities.length === 0) {
    throw new Error('该邮箱可能已注册，请直接登录；若未收到确认邮件，请检查垃圾箱或联系管理员。');
  }

  if (!data.user) {
    throw new Error('注册未成功创建用户，请检查 Auth 日志或稍后重试。');
  }

  return {
    session: data.session,
    needsEmailConfirmation: !data.session,
  };
};

// GitHub OAuth Login
export const loginWithGitHub = async () => {
  markOAuthLoginPending();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/`,
    },
  });

  if (error) {
    clearOAuthLoginPending();
    console.error('GitHub auth error:', error);
    throw error;
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
  sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
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
  sort_order: cat.sortOrder ?? 0,
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

export const syncAllCategoriesToSupabase = async (categories: Category[], user: User) => {
  if (categories.length === 0) return;
  const rows = categories.map((cat) => mapCategoryToDbRow(cat, user.id));
  const { error } = await supabase.from('todo_categories').upsert(rows);
  if (error) {
    console.error('Error syncing all categories to Supabase:', error);
    throw error;
  }
};

export const deleteCategoryFromSupabase = async (categoryId: string) => {
  const { error } = await supabase.from('todo_categories').delete().eq('id', categoryId);
  if (error) {
    console.error('Error deleting category from Supabase:', error);
    throw error;
  }
};

export const uploadTaskImage = async (file: File): Promise<string> => {
  const activeUser = await ensureAuthenticatedUser();
  if (file.size > MAX_TASK_IMAGE_SIZE) {
    throw new Error('Task images must be 5 MB or smaller.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be attached to tasks.');
  }

  const objectId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const uploadedPath = `${activeUser.id}/tasks/${objectId}.${extension}`;

  const { error } = await supabase.storage.from(DROP_STORAGE_BUCKET).upload(uploadedPath, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return toStorageRef(uploadedPath);
};

export const subscribeToTasks = (userId: string, onUpdate: () => void) => {
  const channel = supabase
    .channel(`todo_tasks_changes_${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'todo_tasks',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onUpdate();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'todo_categories',
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

// Fetch categories from Supabase
export const fetchCategoriesFromSupabase = async (): Promise<Category[]> => {
  const { data, error } = await supabase
    .from('todo_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

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

/** Hard cap for each drop_items page (also enforced server-side via range). */
export const DROP_ITEMS_PAGE_SIZE = 50;

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

export const stripStoragePrefix = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (value.startsWith(STORAGE_PATH_PREFIX)) {
    return value.slice(STORAGE_PATH_PREFIX.length);
  }
  return value;
};

export const toStorageRef = (path: string): string => `${STORAGE_PATH_PREFIX}${path}`;

export const isTaskStorageRef = (value?: string): boolean => {
  if (!value) return false;
  if (value.startsWith(STORAGE_PATH_PREFIX)) return true;
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
    return false;
  }
  return isDropStoragePath(value);
};

export const createSignedStorageUrl = async (
  path: string,
  ttlSeconds = DROP_SIGNED_URL_TTL_SECONDS
): Promise<string | undefined> => {
  const { data, error } = await supabase.storage
    .from(DROP_STORAGE_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error) {
    console.warn('Could not create signed URL:', error.message || error);
    return undefined;
  }
  return data.signedUrl;
};

export const refreshDropSignedUrl = async (
  storagePath: string
): Promise<string | undefined> => createSignedStorageUrl(storagePath);

export const resolveMediaUrl = async (value?: string): Promise<string | undefined> => {
  if (!value) return undefined;
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  const path = stripStoragePrefix(value);
  if (!path || !isDropStoragePath(path)) return value;
  return createSignedStorageUrl(path);
};

const mapDbRowToDropItem = async (row: any): Promise<DropItem> => {
  const path = row.file_path || row.url || row.file_url || row.image_url || undefined;
  const fileName = row.file_name || row.filename || undefined;
  const mimeType = row.mime_type || undefined;
  const type = inferDropItemType(row.kind, path, mimeType);
  let resolvedUrl: string | undefined;

  if (isDropStoragePath(path)) {
    resolvedUrl = await createSignedStorageUrl(path);
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
  const requested = options.limit ?? DROP_ITEMS_PAGE_SIZE;
  const limit = Math.min(Math.max(1, requested), DROP_ITEMS_PAGE_SIZE);
  const offset = Math.max(0, options.offset ?? 0);
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

  const pageRows = data || [];
  // Newest→oldest from API; reverse for chat-style oldest→newest UI.
  const items = (await Promise.all(pageRows.map(mapDbRowToDropItem))).reverse();
  const loadedThrough = offset + pageRows.length;
  const hasMore =
    count != null ? loadedThrough < count : pageRows.length >= limit;

  return { items, hasMore };
};

export type DropRealtimeChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string | null;
};

// Subscribe to real-time changes on drop_items table for instant cross-device updates.
// DELETE needs REPLICA IDENTITY FULL on drop_items so user_id filters / RLS see old rows.
export const subscribeToDropItems = (
  userId: string,
  onUpdate: (change: DropRealtimeChange) => void
) => {
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
      (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as
          | { id?: string }
          | null;
        onUpdate({
          eventType: payload.eventType as DropRealtimeChange['eventType'],
          id: row?.id ?? null,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// Add / Insert a new Drop item to Supabase drop_items table
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
    uploadedPath = `${activeUser.id}/${objectId}`;

    const { error } = await supabase.storage
      .from(DROP_STORAGE_BUCKET)
      .upload(uploadedPath, attachment, {
        cacheControl: '3600',
        contentType: attachment.type || 'application/octet-stream',
        upsert: false,
      });
    if (error) throw error;
  }

  let kind: 'text' | 'image' | 'file' = 'text';
  if (attachment) {
    kind = attachment.type.startsWith('image/') ? 'image' : 'file';
  }

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

// Clear all Drop items from Supabase (file paths collected in pages of 50)
export const clearAllDropItemsFromSupabase = async () => {
  const activeUser = await ensureAuthenticatedUser();
  const filePaths: Array<string | null | undefined> = [];
  let offset = 0;

  for (;;) {
    const { data, error: fetchError } = await supabase
      .from('drop_items')
      .select('file_path')
      .eq('user_id', activeUser.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + DROP_ITEMS_PAGE_SIZE - 1);
    if (fetchError) throw fetchError;

    const page = data || [];
    if (page.length === 0) break;
    for (const row of page) {
      filePaths.push(row.file_path);
    }
    if (page.length < DROP_ITEMS_PAGE_SIZE) break;
    offset += DROP_ITEMS_PAGE_SIZE;
  }

  const { error } = await supabase
    .from('drop_items')
    .delete()
    .eq('user_id', activeUser.id);
  if (error) throw error;
  await removeStoredAttachments(filePaths);
};
