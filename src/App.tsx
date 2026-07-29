import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { Category, Task, ThemeMode, DropItem } from './types';
import {
  loadTasks,
  saveTasks,
  loadCategories,
  saveCategories,
  subscribeToSyncEvents,
  loadThemeMode,
  saveThemeMode,
} from './utils/storage';
import { getTodayDateString } from './data/initialData';
import { Header } from './components/Header';
import { usePWA } from './hooks/usePWA';
import { CheckCircle2, Download, Github, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import { ProgressBar } from './components/ProgressBar';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { TaskEditModal } from './components/TaskEditModal';
import { SyncModal } from './components/SyncModal';
import { CategorySettingsModal } from './components/CategorySettingsModal';
import { DropModal } from './components/DropModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { useConfirm } from './components/ConfirmDialog';
import {
  supabase,
  initializeAuthSession,
  loginWithGitHub,
  logoutSupabase,
  fetchTasksFromSupabase,
  fetchCategoriesFromSupabase,
  upsertTaskToSupabase,
  deleteTaskFromSupabase,
  upsertCategoryToSupabase,
  fetchDropItemsFromSupabase,
  subscribeToDropItems,
  addDropItemToSupabase,
  deleteDropItemFromSupabase,
  clearAllDropItemsFromSupabase,
} from './lib/supabase';

function createDefaultWorkCategory(userId: string): Category {
  return {
    id: `cat-work-${userId}`,
    name: 'Work',
    color: '#3b82f6',
    bgClass: 'bg-blue-50 dark:bg-blue-950/40',
    textClass: 'text-blue-700 dark:text-blue-300',
    borderClass: 'border-blue-200 dark:border-blue-800/50',
  };
}

export default function App() {
  const confirmAction = useConfirm();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode());

  // PWA Support Hook
  const { isInstallable, isInstalled, isOffline, installPWA } = usePWA();
  const [dismissInstallBanner, setDismissInstallBanner] = useState(false);

  // Supabase User & Sync state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const syncedUserIdRef = useRef<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Modals state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isDropModalOpen, setIsDropModalOpen] = useState<boolean>(false);

  // Drop Items State
  const [dropItems, setDropItems] = useState<DropItem[]>([]);
  const [hasMoreDropItems, setHasMoreDropItems] = useState<boolean>(false);
  const [isLoadingDropItems, setIsLoadingDropItems] = useState<boolean>(false);
  const [isLoadingMoreDropItems, setIsLoadingMoreDropItems] = useState<boolean>(false);
  const [dropSearchQuery, setDropSearchQuery] = useState<string>('');
  const [dropError, setDropError] = useState<string | null>(null);

  const loadDropItems = useCallback(
    async (query: string = '', offset: number = 0, isLoadMore: boolean = false) => {
      if (isLoadMore) {
        setIsLoadingMoreDropItems(true);
      } else {
        setIsLoadingDropItems(true);
      }

      try {
        setDropError(null);
        const res = await fetchDropItemsFromSupabase({
          limit: 50,
          offset,
          searchQuery: query,
        });

        setHasMoreDropItems(res.hasMore);
        if (isLoadMore) {
          setDropItems((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            const newItems = res.items.filter((i) => !existingIds.has(i.id));
            return [...newItems, ...prev];
          });
        } else {
          setDropItems(res.items);
        }
      } catch (err) {
        console.warn('Could not fetch drop_items from Supabase:', err);
        setDropError(err instanceof Error ? err.message : 'Failed to load Drop items.');
      } finally {
        setIsLoadingDropItems(false);
        setIsLoadingMoreDropItems(false);
      }
    },
    []
  );

  // Realtime subscription to Supabase drop_items changes across devices/tabs
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToDropItems(user.id, () => {
      loadDropItems(dropSearchQuery, 0, false);
    });
    return () => {
      unsubscribe();
    };
  }, [loadDropItems, dropSearchQuery, user]);

  // Refresh once whenever Drop opens, then debounce subsequent searches.
  useEffect(() => {
    if (!isDropModalOpen) return;

    const timer = setTimeout(() => {
      loadDropItems(dropSearchQuery, 0, false);
    }, dropSearchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [dropSearchQuery, isDropModalOpen, loadDropItems]);

  const handleLoadMoreDropItems = () => {
    if (hasMoreDropItems && !isLoadingMoreDropItems && !isLoadingDropItems) {
      loadDropItems(dropSearchQuery, dropItems.length, true);
    }
  };

  const handleOpenDropModal = () => {
    // Disable the composer on the first rendered frame while the opening sync starts.
    setIsLoadingDropItems(true);
    setIsDropModalOpen(true);
  };

  const handleAddDropItem = async (content: string, attachments: File[]) => {
    try {
      setDropError(null);
      const filesToSave: Array<File | undefined> =
        attachments.length > 0 ? attachments : [undefined];

      for (const [index, attachment] of filesToSave.entries()) {
        const saved = await addDropItemToSupabase(
          {
            content: index === 0 ? content : '',
            file_name: attachment?.name,
            file_size: attachment?.size,
            mime_type: attachment?.type,
          },
          attachment
        );
        setDropItems((prev) => [...prev.filter((item) => item.id !== saved.id), saved]);
      }
    } catch (err: any) {
      console.error('Failed to add drop item to Supabase:', err);
      setDropError(err?.message || 'Failed to save note to database.');
      throw err;
    }
  };

  const handleDeleteDropItem = async (id: string) => {
    try {
      setDropError(null);
      await deleteDropItemFromSupabase(id);
      setDropItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error('Failed to delete drop item from Supabase:', err);
      setDropError(err instanceof Error ? err.message : 'Failed to delete Drop item.');
      throw err;
    }
  };

  const handleClearAllDropItems = async () => {
    try {
      setDropError(null);
      await clearAllDropItemsFromSupabase();
      setDropItems([]);
      setHasMoreDropItems(false);
    } catch (err) {
      console.error('Failed to clear drop items from Supabase:', err);
      setDropError(err instanceof Error ? err.message : 'Failed to clear Drop items.');
      throw err;
    }
  };

  const handleConvertToTask = (content: string, imageUrl?: string) => {
    const defaultCatId = categories.find((c) => c.isDefault)?.id || categories[0]?.id;
    if (!defaultCatId) {
      setDropError('Create a task category before converting a Drop item.');
      setIsCategoryModalOpen(true);
      return;
    }

    handleAddTask({
      title: content || 'Dropped Note Task',
      date: selectedDate,
      completed: false,
      categoryId: defaultCatId,
      priority: 'medium',
      imageUrl: imageUrl,
      subtasks: [],
      pinned: false,
    });
  };

  // Apply dark mode class to html element
  useEffect(() => {
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeMode]);

  const handleToggleTheme = () => {
    const nextMode: ThemeMode = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(nextMode);
    saveThemeMode(nextMode);
  };

  // Load initial local data
  const refreshFromStorage = useCallback(() => {
    const loadedTasks = loadTasks();
    const loadedCats = loadCategories();
    setTasks(loadedTasks);
    setCategories(loadedCats);
    setThemeMode(loadThemeMode());
  }, []);

  // Fetch / Sync with Supabase
  const handleSyncWithSupabase = useCallback(async () => {
    if (!user) return;

    setIsSyncing(true);
    try {
      // Fetch remote tasks & categories from Supabase database
      const [remoteTasks, remoteCats] = await Promise.all([
        fetchTasksFromSupabase(),
        fetchCategoriesFromSupabase(),
      ]);

      const syncedCategories =
        remoteCats.length > 0 ? remoteCats : [createDefaultWorkCategory(user.id)];

      if (remoteCats.length === 0) {
        await upsertCategoryToSupabase(syncedCategories[0], user);
      }

      setTasks(remoteTasks);
      saveTasks(remoteTasks);
      setCategories(syncedCategories);
      saveCategories(syncedCategories);
    } catch (err) {
      console.error('Supabase sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  // Initialize Supabase Auth Session
  useEffect(() => {
    let isMounted = true;

    const applyUser = (nextUser: User | null) => {
      if (!isMounted) return;

      const authenticatedUser = nextUser?.is_anonymous ? null : nextUser;
      setUser(authenticatedUser);
      setIsAuthLoading(false);
      if (!authenticatedUser) {
        syncedUserIdRef.current = null;
        setTasks([]);
        setCategories([]);
        return;
      }

      setAuthError(null);
    };

    initializeAuthSession()
      .then((session) => {
        applyUser(session?.user || null);
      })
      .catch((error) => {
        if (!isMounted) return;
        setAuthError(error instanceof Error ? error.message : '无法恢复登录会话');
        setIsAuthLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user || null);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Start database requests only after the auth callback has completed.
  useEffect(() => {
    if (!user || syncedUserIdRef.current === user.id) return;

    syncedUserIdRef.current = user.id;
    handleSyncWithSupabase();
  }, [handleSyncWithSupabase, user]);

  useEffect(() => {
    if (!user) return;

    // Subscribe to multi-tab / storage sync events
    const unsubscribe = subscribeToSyncEvents(() => {
      refreshFromStorage();
    });

    return () => {
      unsubscribe();
    };
  }, [refreshFromStorage, user]);

  // Filter tasks for the selected date
  const selectedDateTasks = tasks.filter((t) => t.date === selectedDate);

  // Calculate stats for current selected date
  const totalTasksCount = selectedDateTasks.length;
  const completedTasksCount = selectedDateTasks.filter((t) => t.completed).length;
  const pendingTasksCount = totalTasksCount - completedTasksCount;
  const totalEstimatedMinutes = selectedDateTasks.reduce(
    (sum, t) => sum + (t.estimatedMinutes || 0),
    0
  );

  // Calculate streak (consecutive completed days)
  const calculateStreak = useCallback(() => {
    const completedDates = new Set(
      tasks.filter((t) => t.completed).map((t) => t.date)
    );
    let streak = 0;
    const curr = new Date(selectedDate + 'T00:00:00');

    while (true) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (completedDates.has(dateStr)) {
        streak++;
        curr.setDate(curr.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }, [tasks, selectedDate]);

  const streakDays = calculateStreak();

  // Task actions
  const handleAddTask = (newTaskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTask: Task = {
      ...newTaskData,
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedTasks = [newTask, ...tasks];
    setTasks(updatedTasks);
    saveTasks(updatedTasks);

    if (user) {
      upsertTaskToSupabase(newTask, user).catch((err) =>
        console.error('Failed to sync new task to Supabase:', err)
      );
    }
  };

  const handleToggleComplete = (taskId: string) => {
    let updatedTask: Task | undefined;
    const updatedTasks = tasks.map((t) => {
      if (t.id === taskId) {
        updatedTask = {
          ...t,
          completed: !t.completed,
          updatedAt: Date.now(),
        };
        return updatedTask;
      }
      return t;
    });

    setTasks(updatedTasks);
    saveTasks(updatedTasks);

    if (user && updatedTask) {
      upsertTaskToSupabase(updatedTask, user).catch((err) =>
        console.error('Failed to sync toggle to Supabase:', err)
      );
    }
  };

  const handleTogglePin = (taskId: string) => {
    let updatedTask: Task | undefined;
    const updatedTasks = tasks.map((t) => {
      if (t.id === taskId) {
        updatedTask = {
          ...t,
          pinned: !t.pinned,
          updatedAt: Date.now(),
        };
        return updatedTask;
      }
      return t;
    });

    setTasks(updatedTasks);
    saveTasks(updatedTasks);

    if (user && updatedTask) {
      upsertTaskToSupabase(updatedTask, user).catch((err) =>
        console.error('Failed to sync pin toggle to Supabase:', err)
      );
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find((task) => task.id === taskId);
    const confirmed = await confirmAction({
      title: 'Delete this task?',
      description: taskToDelete?.title
        ? `“${taskToDelete.title}” will be permanently deleted.`
        : 'This task will be permanently deleted.',
      confirmLabel: 'Delete task',
    });
    if (!confirmed) return;

    const updatedTasks = tasks.filter((t) => t.id !== taskId);
    setTasks(updatedTasks);
    saveTasks(updatedTasks);

    if (user) {
      deleteTaskFromSupabase(taskId).catch((err) =>
        console.error('Failed to delete task from Supabase:', err)
      );
    }
  };

  const handleSaveEditedTask = (updatedTask: Task) => {
    const updatedTasks = tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t));
    setTasks(updatedTasks);
    saveTasks(updatedTasks);

    if (user) {
      upsertTaskToSupabase(updatedTask, user).catch((err) =>
        console.error('Failed to sync edit to Supabase:', err)
      );
    }
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    let updatedTask: Task | undefined;
    const updatedTasks = tasks.map((t) => {
      if (t.id === taskId) {
        const updatedSubtasks = t.subtasks.map((st) =>
          st.id === subtaskId ? { ...st, completed: !st.completed } : st
        );
        updatedTask = {
          ...t,
          subtasks: updatedSubtasks,
          updatedAt: Date.now(),
        };
        return updatedTask;
      }
      return t;
    });

    setTasks(updatedTasks);
    saveTasks(updatedTasks);

    if (user && updatedTask) {
      upsertTaskToSupabase(updatedTask, user).catch((err) =>
        console.error('Failed to sync subtask toggle to Supabase:', err)
      );
    }
  };

  // Category actions
  const handleAddCategory = (newCatData: Omit<Category, 'id'>) => {
    const newCat: Category = {
      ...newCatData,
      id: `cat-${Date.now()}`,
    };

    const updatedCategories = [...categories, newCat];
    setCategories(updatedCategories);
    saveCategories(updatedCategories);

    if (user) {
      upsertCategoryToSupabase(newCat, user).catch((err) =>
        console.error('Failed to sync category to Supabase:', err)
      );
    }
  };

  const handleGitHubLoginClick = async () => {
    try {
      setAuthError(null);
      await loginWithGitHub();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'GitHub 登录启动失败，请检查浏览器弹窗拦截设置');
    }
  };

  const handleLogoutClick = async () => {
    try {
      await logoutSupabase();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleFocusTaskInput = () => {
    const inputEl = document.getElementById('input-task-title') as HTMLInputElement;
    if (inputEl) {
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        inputEl.focus();
      }, 300);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm">
          <LoaderCircle className="w-5 h-5 animate-spin text-blue-600" />
          <span>正在检查登录状态...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl text-center space-y-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
            <LockKeyhole className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold">登录 Daily TODOs</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              登录后才能查看和管理你的待办事项。
            </p>
          </div>
          {authError && (
            <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {authError}
            </div>
          )}
          <button
            type="button"
            onClick={handleGitHubLoginClick}
            className="w-full min-h-11 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Github className="w-4 h-4" />
            使用 GitHub 登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans flex flex-col selection:bg-indigo-100 dark:selection:bg-indigo-900 selection:text-indigo-950 dark:selection:text-indigo-100 transition-colors">
      {/* Sticky Top App Header */}
      <Header
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        completedStreak={streakDays}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
        onOpenDropModal={handleOpenDropModal}
        user={user}
        onGitHubLogin={handleGitHubLoginClick}
        onLogout={handleLogoutClick}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        installPWA={installPWA}
        isOffline={isOffline}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-4 sm:space-y-5 pb-36 sm:pb-14">
        <section className="dashboard-intro">
          <div>
            <p className="dashboard-kicker">YOUR DAILY SPACE</p>
            <h2>Make today feel lighter.</h2>
            <p>Choose what matters, give it a place, and let the rest wait.</p>
          </div>
          <div className="dashboard-stat" aria-label={`${pendingTasksCount} tasks remaining`}>
            <span>{pendingTasksCount}</span>
            <small>left today</small>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[0.78fr_1.22fr] gap-4 sm:gap-5 items-stretch">
          <ProgressBar
            totalTasks={totalTasksCount}
            completedTasks={completedTasksCount}
            totalEstimatedMinutes={totalEstimatedMinutes}
            dateStr={selectedDate}
          />

          <TaskInput
            categories={categories}
            selectedDate={selectedDate}
            onAddTask={handleAddTask}
          />
        </section>

        {/* Task List Section with Unified Filters */}
        <TaskList
          tasks={selectedDateTasks}
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
          onToggleComplete={handleToggleComplete}
          onTogglePin={handleTogglePin}
          onDeleteTask={handleDeleteTask}
          onEditTask={(task) => setEditingTask(task)}
          onToggleSubtask={handleToggleSubtask}
          selectedDate={selectedDate}
        />
      </main>

      {/* Footer */}
      <footer className="app-footer mb-16 sm:mb-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="footer-mark"><CheckCircle2 className="w-3.5 h-3.5" /></span>
            <p>Daily TODOs · Your calm space to get things done.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="footer-link"
            >
              Cloud sync
            </button>
          </div>
        </div>
      </footer>

      {/* Edit Modal */}
      <TaskEditModal
        task={editingTask}
        categories={categories}
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveEditedTask}
      />

      {/* Sync & Backup Modal */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onRefreshData={refreshFromStorage}
        user={user}
        onGitHubLogin={handleGitHubLoginClick}
        onLogout={handleLogoutClick}
        onSyncWithSupabase={() => user && handleSyncWithSupabase()}
        isSyncing={isSyncing}
      />

      {/* Category Management Settings Modal */}
      <CategorySettingsModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onAddCategory={handleAddCategory}
      />

      {/* Edge Drop Notepad & File Transfer Modal */}
      <DropModal
        isOpen={isDropModalOpen}
        onClose={() => setIsDropModalOpen(false)}
        dropItems={dropItems}
        hasMore={hasMoreDropItems}
        isLoading={isLoadingDropItems}
        isLoadingMore={isLoadingMoreDropItems}
        error={dropError}
        searchQuery={dropSearchQuery}
        onSearchChange={setDropSearchQuery}
        onLoadMore={handleLoadMoreDropItems}
        onAddDropItem={handleAddDropItem}
        onDeleteDropItem={handleDeleteDropItem}
        onClearAllDropItems={handleClearAllDropItems}
        onRefreshDropItems={() => loadDropItems(dropSearchQuery, 0, false)}
        onDismissError={() => setDropError(null)}
        onConvertToTask={handleConvertToTask}
        isAuthenticated={Boolean(user)}
        onSignIn={handleGitHubLoginClick}
      />

      {/* Mobile Smartphone Bottom Navigation Toolbar */}
      <MobileBottomNav
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onFocusTaskInput={handleFocusTaskInput}
      />
    </div>
  );
}
