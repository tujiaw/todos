import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { Category, Task, ThemeMode, DropItem } from './types';
import {
  loadTasks,
  getRawStoredTasks,
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
import { Download, X } from 'lucide-react';
import { ProgressBar } from './components/ProgressBar';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { TaskEditModal } from './components/TaskEditModal';
import { SyncModal } from './components/SyncModal';
import { CategorySettingsModal } from './components/CategorySettingsModal';
import { DropModal } from './components/DropModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import {
  supabase,
  ensureAuthenticatedUser,
  loginWithGitHub,
  logoutSupabase,
  fetchTasksFromSupabase,
  fetchCategoriesFromSupabase,
  upsertTaskToSupabase,
  deleteTaskFromSupabase,
  upsertCategoryToSupabase,
  syncAllTasksToSupabase,
  fetchDropItemsFromSupabase,
  subscribeToDropItems,
  addDropItemToSupabase,
  deleteDropItemFromSupabase,
  clearAllDropItemsFromSupabase,
} from './lib/supabase';

export default function App() {
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

  // Initial load and debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadDropItems(dropSearchQuery, 0, false);
    }, dropSearchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [dropSearchQuery, loadDropItems]);

  const handleLoadMoreDropItems = () => {
    if (hasMoreDropItems && !isLoadingMoreDropItems && !isLoadingDropItems) {
      loadDropItems(dropSearchQuery, dropItems.length, true);
    }
  };

  const handleAddDropItem = async (content: string, url?: string, fileName?: string) => {
    try {
      setDropError(null);
      const saved = await addDropItemToSupabase({ content, url, file_name: fileName });
      setDropItems((prev) => [...prev.filter((i) => i.id !== saved.id), saved]);
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
    const defaultCatId = categories.find((c) => c.isDefault)?.id || categories[0]?.id || 'cat-personal';
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
  const handleSyncWithSupabase = useCallback(async (currentUser: User) => {
    setIsSyncing(true);
    try {
      // Fetch remote tasks & categories from Supabase database
      const [remoteTasks, remoteCats] = await Promise.all([
        fetchTasksFromSupabase().catch((err) => {
          console.error('Fetch remote tasks error:', err);
          return [];
        }),
        fetchCategoriesFromSupabase().catch((err) => {
          console.error('Fetch remote categories error:', err);
          return [];
        }),
      ]);

      const localRawTasks = getRawStoredTasks();
      const localCats = loadCategories();

      if (remoteTasks.length > 0) {
        // If remote DB already has data for this user, use real database data
        setTasks(remoteTasks);
        saveTasks(remoteTasks);
      } else {
        // Remote DB is empty. Check if user created real non-sample tasks offline
        const userCreatedLocalTasks = localRawTasks.filter((t) => !t.id.startsWith('sample-'));
        if (userCreatedLocalTasks.length > 0) {
          setTasks(userCreatedLocalTasks);
          saveTasks(userCreatedLocalTasks);
          await syncAllTasksToSupabase(userCreatedLocalTasks, currentUser).catch((e) =>
            console.warn('Task upload error:', e)
          );
        } else {
          // Clean Supabase account: show real 0 tasks list from Supabase DB
          setTasks([]);
          saveTasks([]);
        }
      }

      // Merge categories
      if (remoteCats.length > 0) {
        const catMap = new Map<string, Category>();
        localCats.forEach((c) => catMap.set(c.id, c));
        remoteCats.forEach((c) => catMap.set(c.id, c));
        const mergedCats = Array.from(catMap.values());
        setCategories(mergedCats);
        saveCategories(mergedCats);
      }
    } catch (err) {
      console.error('Supabase sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Initialize Supabase Auth Session
  useEffect(() => {
    ensureAuthenticatedUser().then((u) => {
      setUser(u);
      handleSyncWithSupabase(u);
    }).catch((err) => {
      console.warn('Supabase authentication failed:', err);
      setDropError(err instanceof Error ? err.message : 'Could not authenticate with Supabase.');
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        handleSyncWithSupabase(u);
      }
    });

    // Listen for OAuth postMessage from popup window
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'SUPABASE_OAUTH_SUCCESS') {
        const session = e.data.session;
        if (session?.user) {
          setUser(session.user);
          handleSyncWithSupabase(session.user);
        } else {
          supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (s?.user) {
              setUser(s.user);
              handleSyncWithSupabase(s.user);
            }
          });
        }
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      authListener.subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, [handleSyncWithSupabase]);

  useEffect(() => {
    refreshFromStorage();

    // Subscribe to multi-tab / storage sync events
    const unsubscribe = subscribeToSyncEvents(() => {
      refreshFromStorage();
    });

    return () => {
      unsubscribe();
    };
  }, [refreshFromStorage]);

  // Filter tasks for the selected date
  const selectedDateTasks = tasks.filter((t) => t.date === selectedDate);

  // Calculate stats for current selected date
  const totalTasksCount = selectedDateTasks.length;
  const completedTasksCount = selectedDateTasks.filter((t) => t.completed).length;
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

  const handleDeleteTask = (taskId: string) => {
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
      await loginWithGitHub();
    } catch (err) {
      alert('GitHub 登录启动失败，请检查浏览器弹窗拦截设置');
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

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans flex flex-col selection:bg-blue-100 dark:selection:bg-blue-900 selection:text-blue-900 dark:selection:text-blue-100 transition-colors">
      {/* Sticky Top App Header */}
      <Header
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        completedStreak={streakDays}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
        onOpenDropModal={() => setIsDropModalOpen(true)}
        user={user}
        onGitHubLogin={handleGitHubLoginClick}
        onLogout={handleLogoutClick}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        installPWA={installPWA}
        isOffline={isOffline}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-36 sm:pb-12">
        {/* Daily Progress Statistics Bar */}
        <ProgressBar
          totalTasks={totalTasksCount}
          completedTasks={completedTasksCount}
          totalEstimatedMinutes={totalEstimatedMinutes}
          dateStr={selectedDate}
        />

        {/* Task Quick Input Form */}
        <TaskInput
          categories={categories}
          selectedDate={selectedDate}
          onAddTask={handleAddTask}
        />

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
      <footer className="py-6 border-t border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 mt-8 mb-16 sm:mb-0 text-center text-xs text-slate-400 dark:text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© Daily TODOs · Powered by Supabase Cloud & GitHub Auth</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="hover:text-slate-600 dark:hover:text-slate-300 underline decoration-slate-300 dark:decoration-slate-700 transition-colors"
            >
              Supabase 后端与数据同步中心
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
        onSyncWithSupabase={() => user && handleSyncWithSupabase(user)}
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
