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
  loadAiEnabled,
  saveAiEnabled,
  clearLocalUserData,
} from './utils/storage';
import { getTodayDateString } from './data/initialData';
import { Header } from './components/Header';
import { usePWA } from './hooks/usePWA';
import { Github, LoaderCircle, LockKeyhole } from 'lucide-react';
import { ProgressBar } from './components/ProgressBar';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { TaskEditModal } from './components/TaskEditModal';
import { SyncModal } from './components/SyncModal';
import { CategorySettingsModal } from './components/CategorySettingsModal';
import { DropModal } from './components/DropModal';
import { AiAssistModal } from './components/AiAssistModal';
import { EmailAuthForm, type EmailAuthMode } from './components/EmailAuthForm';
import { MobileBottomNav } from './components/MobileBottomNav';
import { useConfirm } from './components/ConfirmDialog';
import { useToast } from './components/Toast';
import {
  generateAiAssist,
  generateDashboardCopy,
  generateTaskDraft,
  loadCachedDashboardCopy,
  saveCachedDashboardCopy,
  type DashboardCopy,
} from './lib/ai';
import {
  buildBacklogTriagePayload,
  buildDailyStandupPayload,
  buildLocalAiAssistResult,
  buildTodayFocusPayload,
  buildWeeklyAssistPayload,
  getAiAssistLabel,
  type AiAssistMode,
  type AiAssistPayload,
  type AiAssistResult,
} from './utils/aiAssist';
import { formatWeekDisplayLabel } from './utils/week';
import { mergeCategories, mergeTasksLww, withoutStaleOps } from './utils/mergeSync';
import {
  moveCategory,
  normalizeCategoryOrder,
  sortCategoriesByOrder,
} from './utils/categories';
import {
  clearOutbox,
  countPendingOps,
  enqueueOp,
  loadOutbox,
  replaceOutbox,
} from './utils/syncQueue';
import { flushOutbox } from './utils/flushOutbox';
import {
  supabase,
  initializeAuthSession,
  isOAuthCallbackPending,
  clearOAuthLoginPending,
  loginWithGitHub,
  signInWithEmail,
  signUpWithEmail,
  logoutSupabase,
  fetchTasksFromSupabase,
  fetchCategoriesFromSupabase,
  syncAllTasksToSupabase,
  syncAllCategoriesToSupabase,
  DROP_ITEMS_PAGE_SIZE,
  fetchDropItemsFromSupabase,
  subscribeToDropItems,
  subscribeToTasks,
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
    sortOrder: 0,
    isDefault: true,
  };
}

const DEFAULT_DASHBOARD_COPY: DashboardCopy = {
  title: 'Make today feel lighter.',
  subtitle: 'Choose what matters, give it a place, and let the rest wait.',
};

export default function App() {
  const confirmAction = useConfirm();
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode());
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => loadAiEnabled());
  const [dashboardCopy, setDashboardCopy] = useState<DashboardCopy>(() =>
    loadAiEnabled()
      ? loadCachedDashboardCopy(getTodayDateString()) || DEFAULT_DASHBOARD_COPY
      : DEFAULT_DASHBOARD_COPY
  );

  // PWA Support Hook
  const {
    isInstallable,
    isInstalled,
    isOffline,
    updateAvailable,
    installPWA,
    applyUpdate,
    dismissUpdate,
  } = usePWA();

  // Supabase User & Sync state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isCompletingSignIn, setIsCompletingSignIn] = useState<boolean>(() =>
    isOAuthCallbackPending()
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [isEmailAuthSubmitting, setIsEmailAuthSubmitting] = useState(false);
  const oauthPendingRef = useRef<boolean>(isOAuthCallbackPending());
  const syncedUserIdRef = useRef<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const tasksRef = useRef<Task[]>([]);
  const categoriesRef = useRef<Category[]>([]);
  const realtimeSyncTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);

  // Modals state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draftTask, setDraftTask] = useState<Task | null>(null);
  const [taskInputResetKey, setTaskInputResetKey] = useState(0);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isDropModalOpen, setIsDropModalOpen] = useState<boolean>(false);
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false);
  const [aiAssistMode, setAiAssistMode] = useState<AiAssistMode | null>(null);
  const [aiAssistPayload, setAiAssistPayload] = useState<AiAssistPayload | null>(null);
  const [aiAssistResult, setAiAssistResult] = useState<AiAssistResult | null>(null);
  const [aiAssistSubtitle, setAiAssistSubtitle] = useState('');
  const [isAiAssistLoading, setIsAiAssistLoading] = useState(false);
  const [aiAssistError, setAiAssistError] = useState<string | null>(null);
  const [aiAssistUsedFallback, setAiAssistUsedFallback] = useState(false);
  const aiAssistAbortRef = useRef<AbortController | null>(null);

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
          limit: DROP_ITEMS_PAGE_SIZE,
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

    const unsubscribe = subscribeToDropItems(user.id, (change) => {
      // Apply DELETE locally so the other device updates without waiting on a refetch.
      if (change.eventType === 'DELETE') {
        if (change.id) {
          setDropItems((prev) => prev.filter((item) => item.id !== change.id));
          return;
        }
        // Bulk/clear without row id in payload — reload from server.
      }
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
    // Mark loading immediately so DropModal does not seed scroll before fetch starts.
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

  const handleAiEnabledChange = (enabled: boolean) => {
    setAiEnabled(enabled);
    saveAiEnabled(enabled);
    if (!enabled) {
      setDashboardCopy(DEFAULT_DASHBOARD_COPY);
      setDraftTask(null);
    }
  };

  const refreshPendingCount = useCallback((userId?: string | null) => {
    if (!userId) {
      setPendingSyncCount(0);
      return;
    }
    setPendingSyncCount(countPendingOps(userId));
  }, []);

  const persistTasks = useCallback(
    (next: Task[]) => {
      setTasks(next);
      tasksRef.current = next;
      const result = saveTasks(next);
      if (result.ok === false && result.quotaExceeded) {
        showToast('Local storage is full. Remove large task images or free space.', 'error');
      }
    },
    [showToast]
  );

  const persistCategories = useCallback((next: Category[]) => {
    const ordered = sortCategoriesByOrder(next);
    setCategories(ordered);
    categoriesRef.current = ordered;
    saveCategories(ordered);
  }, []);

  const refreshFromStorage = useCallback(() => {
    const loadedTasks = loadTasks();
    const loadedCats = sortCategoriesByOrder(loadCategories());
    setTasks(loadedTasks);
    tasksRef.current = loadedTasks;
    setCategories(loadedCats);
    categoriesRef.current = loadedCats;
    setThemeMode(loadThemeMode());
    setAiEnabled(loadAiEnabled());
  }, []);

  const handleSyncWithSupabase = useCallback(async (options?: { quiet?: boolean }) => {
    if (!user) return;
    const quiet = Boolean(options?.quiet);

    const run = async () => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        const flushResult = await flushOutbox(user);
        refreshPendingCount(user.id);
        if (flushResult.remaining > 0 && flushResult.lastError) {
          setSyncError(flushResult.lastError);
          if (!quiet) {
            showToast(
              `Could not sync ${flushResult.remaining} change(s). Will retry when online.`,
              'error'
            );
          }
        }

        const [remoteTasks, remoteCats] = await Promise.all([
          fetchTasksFromSupabase(),
          fetchCategoriesFromSupabase(),
        ]);

        const pendingOps = loadOutbox(user.id);
        const {
          merged: mergedTasks,
          toPush: tasksToPush,
          staleOps: staleTaskOps,
        } = mergeTasksLww(tasksRef.current, remoteTasks, pendingOps);
        let {
          merged: mergedCats,
          toPush: catsToPush,
          staleOps: staleCatOps,
        } = mergeCategories(categoriesRef.current, remoteCats, pendingOps);

        const staleOps = [...staleTaskOps, ...staleCatOps];
        if (staleOps.length > 0) {
          replaceOutbox(user.id, withoutStaleOps(loadOutbox(user.id), staleOps));
          refreshPendingCount(user.id);
        }

        if (mergedCats.length === 0) {
          const fallback = createDefaultWorkCategory(user.id);
          mergedCats = [fallback];
          catsToPush = [fallback];
        } else {
          const normalized = normalizeCategoryOrder(mergedCats);
          const orderChanged = normalized.some((cat, index) => {
            const prev = mergedCats[index];
            return (
              !prev ||
              prev.id !== cat.id ||
              prev.sortOrder !== cat.sortOrder ||
              Boolean(prev.isDefault) !== cat.isDefault
            );
          });
          if (orderChanged) {
            mergedCats = normalized;
            for (const cat of normalized) {
              if (!catsToPush.some((item) => item.id === cat.id)) {
                catsToPush.push(cat);
              }
            }
          }
        }

        persistTasks(mergedTasks);
        persistCategories(mergedCats);

        try {
          if (tasksToPush.length > 0) {
            await syncAllTasksToSupabase(tasksToPush, user);
          }
          if (catsToPush.length > 0) {
            await syncAllCategoriesToSupabase(catsToPush, user);
          }
        } catch (pushErr) {
          for (const task of tasksToPush) {
            enqueueOp(user.id, 'upsert_task', task.id, task);
          }
          for (const cat of catsToPush) {
            enqueueOp(user.id, 'upsert_category', cat.id, cat);
          }
          refreshPendingCount(user.id);
          throw pushErr;
        }

        const finalFlush = await flushOutbox(user);
        refreshPendingCount(user.id);
        if (finalFlush.remaining > 0 && finalFlush.lastError) {
          setSyncError(finalFlush.lastError);
        }
      } catch (err) {
        console.error('Supabase sync error:', err);
        const message = err instanceof Error ? err.message : 'Sync failed';
        setSyncError(message);
        if (!quiet) showToast(message, 'error');
      } finally {
        setIsSyncing(false);
      }
    };

    const previous = syncInFlightRef.current;
    const chained = (async () => {
      if (previous) await previous.catch(() => undefined);
      await run();
    })();
    syncInFlightRef.current = chained.finally(() => {
      if (syncInFlightRef.current === chained) {
        syncInFlightRef.current = null;
      }
    });
    await chained;
  }, [persistCategories, persistTasks, refreshPendingCount, showToast, user]);

  const suppressRealtimeSyncUntilRef = useRef(0);

  const runFlushOutbox = useCallback(async () => {
    if (!user) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showToast('Saved locally. Will sync when you are back online.', 'info');
      return;
    }

    const result = await flushOutbox(user);
    refreshPendingCount(user.id);
    if (result.remaining > 0) {
      showToast(result.lastError || 'Some changes are still pending sync.', 'error');
    }
  }, [refreshPendingCount, showToast, user]);

  const queueAndFlush = useCallback(
    async (
      type: 'upsert_task' | 'delete_task' | 'upsert_category' | 'delete_category',
      entityId: string,
      payload?: Task | Category
    ) => {
      if (!user) return;
      enqueueOp(user.id, type, entityId, payload);
      refreshPendingCount(user.id);
      await runFlushOutbox();
    },
    [refreshPendingCount, runFlushOutbox, user]
  );

  const queueCategoriesAndFlush = useCallback(
    async (cats: Category[]) => {
      if (!user) return;
      // Avoid realtime pull-back while category order/metadata is still converging.
      suppressRealtimeSyncUntilRef.current = Date.now() + 2000;
      for (const cat of cats) {
        enqueueOp(user.id, 'upsert_category', cat.id, cat);
      }
      refreshPendingCount(user.id);
      await runFlushOutbox();
      suppressRealtimeSyncUntilRef.current = Date.now() + 1500;
    },
    [refreshPendingCount, runFlushOutbox, user]
  );

  useEffect(() => {
    let isMounted = true;
    oauthPendingRef.current = isOAuthCallbackPending();
    if (oauthPendingRef.current) {
      setIsCompletingSignIn(true);
      setIsAuthLoading(true);
    }

    const finishOAuthPending = () => {
      oauthPendingRef.current = false;
      clearOAuthLoginPending();
      setIsCompletingSignIn(false);
    };

    const applyUser = (nextUser: User | null, options?: { fromBootstrap?: boolean }) => {
      if (!isMounted) return;

      const authenticatedUser = nextUser?.is_anonymous ? null : nextUser;

      // While exchanging the OAuth/email confirm code, ignore empty sessions so
      // the login gate does not flash before the real session arrives.
      if (!authenticatedUser && oauthPendingRef.current && !options?.fromBootstrap) {
        setIsAuthLoading(true);
        setIsCompletingSignIn(true);
        return;
      }

      if (options?.fromBootstrap || authenticatedUser) {
        finishOAuthPending();
      }

      setUser(authenticatedUser);
      setIsAuthLoading(false);
      if (!authenticatedUser) {
        if (syncedUserIdRef.current) {
          clearOutbox(syncedUserIdRef.current);
        }
        syncedUserIdRef.current = null;
        clearLocalUserData();
        setTasks([]);
        tasksRef.current = [];
        setCategories([]);
        categoriesRef.current = [];
        setPendingSyncCount(0);
        setSyncError(null);
        return;
      }

      setAuthError(null);
      refreshPendingCount(authenticatedUser.id);
    };

    initializeAuthSession()
      .then((session) => {
        if (!isMounted) return;
        applyUser(session?.user || null, { fromBootstrap: true });
      })
      .catch((error) => {
        if (!isMounted) return;
        finishOAuthPending();
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
  }, [refreshPendingCount]);

  useEffect(() => {
    if (!user || syncedUserIdRef.current === user.id) return;

    syncedUserIdRef.current = user.id;
    handleSyncWithSupabase();
  }, [handleSyncWithSupabase, user]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToSyncEvents(() => {
      refreshFromStorage();
    });

    return () => {
      unsubscribe();
    };
  }, [refreshFromStorage, user]);

  useEffect(() => {
    if (!user) return;

    const onOnline = () => {
      showToast('Back online. Syncing pending changes…', 'info');
      void handleSyncWithSupabase();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [handleSyncWithSupabase, showToast, user]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToTasks(user.id, () => {
      if (Date.now() < suppressRealtimeSyncUntilRef.current) {
        return;
      }
      if (realtimeSyncTimerRef.current) {
        window.clearTimeout(realtimeSyncTimerRef.current);
      }
      realtimeSyncTimerRef.current = window.setTimeout(() => {
        if (Date.now() < suppressRealtimeSyncUntilRef.current) {
          return;
        }
        void handleSyncWithSupabase({ quiet: true });
      }, 400);
    });

    return () => {
      unsubscribe();
      if (realtimeSyncTimerRef.current) {
        window.clearTimeout(realtimeSyncTimerRef.current);
      }
    };
  }, [handleSyncWithSupabase, user]);

  // Filter tasks for the selected date
  const selectedDateTasks = tasks.filter((t) => t.date === selectedDate);

  // Calculate stats for current selected date
  const totalTasksCount = selectedDateTasks.length;
  const completedTasksCount = selectedDateTasks.filter((t) => t.completed).length;
  const pendingTasksCount = totalTasksCount - completedTasksCount;

  useEffect(() => {
    if (!aiEnabled) {
      setDashboardCopy(DEFAULT_DASHBOARD_COPY);
      return;
    }

    const currentDate = getTodayDateString();
    const cachedCopy = loadCachedDashboardCopy(currentDate);
    if (cachedCopy) {
      setDashboardCopy(cachedCopy);
      return;
    }
    if (!user || isAuthLoading) return;

    const controller = new AbortController();
    generateDashboardCopy(
      {
        currentDate,
        pendingTasks: pendingTasksCount,
        completedTasks: completedTasksCount,
      },
      controller.signal
    )
      .then((copy) => {
        if (controller.signal.aborted) return;
        saveCachedDashboardCopy(currentDate, copy);
        setDashboardCopy(copy);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.warn('Could not generate daily dashboard copy:', error);
      });

    return () => controller.abort();
  }, [aiEnabled, isAuthLoading, user]);

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
    persistTasks(updatedTasks);
    void queueAndFlush('upsert_task', newTask.id, newTask);
  };

  const runAiAssist = useCallback(
    async (payload: AiAssistPayload, subtitle: string) => {
      aiAssistAbortRef.current?.abort();
      const controller = new AbortController();
      aiAssistAbortRef.current = controller;

      const localResult = buildLocalAiAssistResult(payload);
      setAiAssistMode(payload.mode);
      setAiAssistPayload(payload);
      setAiAssistSubtitle(subtitle);
      setAiAssistResult(localResult);
      setAiAssistUsedFallback(true);
      setAiAssistError(null);
      setIsAiAssistLoading(true);

      if (!aiEnabled) {
        setAiAssistError(
          'AI is off. A local draft is ready to copy — enable AI in Settings to polish it.'
        );
        setIsAiAssistLoading(false);
        return;
      }
      if (!user) {
        setAiAssistError(
          'Sign in to polish with AI. A copy-ready local draft is available now.'
        );
        setIsAiAssistLoading(false);
        return;
      }

      try {
        const result = await generateAiAssist(payload, controller.signal);
        if (controller.signal.aborted) return;
        setAiAssistResult(result);
        setAiAssistUsedFallback(false);
        setAiAssistError(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setAiAssistError(
          error instanceof Error
            ? `${error.message} Keeping the local draft.`
            : 'AI polish failed. Keeping the local draft.'
        );
        setAiAssistUsedFallback(true);
      } finally {
        if (!controller.signal.aborted) setIsAiAssistLoading(false);
      }
    },
    [aiEnabled, user]
  );

  const handleOpenAiAssist = (mode: AiAssistMode, weekAnchorDate: string) => {
    const today = getTodayDateString();
    let payload: AiAssistPayload;
    let subtitle = '';

    if (mode === 'weekly_minutes') {
      payload = buildWeeklyAssistPayload(tasks, categories, weekAnchorDate);
      if (payload.mode !== 'weekly_minutes') return;
      subtitle = formatWeekDisplayLabel(payload.startDate, payload.endDate, {
        preferThisWeek: true,
        today,
      });
    } else if (mode === 'today_focus') {
      payload = buildTodayFocusPayload(tasks, categories, selectedDate, today);
      subtitle = selectedDate === today ? 'Today' : selectedDate;
    } else if (mode === 'daily_standup') {
      payload = buildDailyStandupPayload(tasks, categories, today);
      subtitle = today;
    } else {
      payload = buildBacklogTriagePayload(tasks, categories, today);
      subtitle = `${payload.pendingTasks.length} open tasks`;
    }

    setIsAiAssistOpen(true);
    void runAiAssist(payload, subtitle || getAiAssistLabel(mode));
  };

  const handleCloseAiAssist = () => {
    aiAssistAbortRef.current?.abort();
    setIsAiAssistOpen(false);
  };

  const handleRegenerateAiAssist = () => {
    if (!aiAssistPayload) return;
    void runAiAssist(aiAssistPayload, aiAssistSubtitle);
  };

  const handleGenerateTaskDraft = async (text: string) => {
    if (!aiEnabled) throw new Error('AI features are disabled in Settings.');
    const draft = await generateTaskDraft({
      text,
      currentDate: getTodayDateString(),
      selectedDate,
      timezone: 'Asia/Shanghai',
      categories: categories.map(({ id, name, isDefault }) => ({
        id,
        name,
        isDefault,
      })),
    });
    const now = Date.now();
    setDraftTask({
      id: `draft-${now}`,
      title: draft.title,
      description: draft.description,
      date: draft.date,
      completed: false,
      categoryId: draft.categoryId,
      priority: draft.priority,
      dueTime: draft.dueTime,
      estimatedMinutes: draft.estimatedMinutes,
      subtasks: draft.subtasks.map((title, index) => ({
        id: `draft-subtask-${now}-${index}`,
        title,
        completed: false,
      })),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    });
  };

  const handleCreateDraftTask = (task: Task) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...taskData } = task;
    handleAddTask({
      ...taskData,
      completed: false,
      subtasks: taskData.subtasks.map((subtask) => ({
        ...subtask,
        completed: false,
      })),
    });
    setTaskInputResetKey((key) => key + 1);
    setDraftTask(null);
  };

  const handleCloseDraftTask = () => {
    setDraftTask(null);
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

    persistTasks(updatedTasks);
    if (updatedTask) {
      void queueAndFlush('upsert_task', updatedTask.id, updatedTask);
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

    persistTasks(updatedTasks);
    if (updatedTask) {
      void queueAndFlush('upsert_task', updatedTask.id, updatedTask);
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
    persistTasks(updatedTasks);
    void queueAndFlush('delete_task', taskId);
  };

  const handleSaveEditedTask = (updatedTask: Task) => {
    const withStamp = { ...updatedTask, updatedAt: Date.now() };
    const updatedTasks = tasks.map((t) => (t.id === withStamp.id ? withStamp : t));
    persistTasks(updatedTasks);
    void queueAndFlush('upsert_task', withStamp.id, withStamp);
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

    persistTasks(updatedTasks);
    if (updatedTask) {
      void queueAndFlush('upsert_task', updatedTask.id, updatedTask);
    }
  };

  // Category actions
  const handleAddCategory = (newCatData: Omit<Category, 'id'>) => {
    const current = categoriesRef.current;
    const newCat: Category = {
      ...newCatData,
      id: `cat-${Date.now()}`,
      sortOrder: current.length,
      isDefault: current.length === 0,
    };

    const updatedCategories = normalizeCategoryOrder([...current, newCat]);
    persistCategories(updatedCategories);
    void queueCategoriesAndFlush(updatedCategories);
  };

  const handleUpdateCategory = (updated: Category) => {
    const next = categoriesRef.current.map((cat) => (cat.id === updated.id ? updated : cat));
    persistCategories(next);
    void queueAndFlush('upsert_category', updated.id, updated);
  };

  const handleReorderCategory = (categoryId: string, direction: 'up' | 'down') => {
    const next = moveCategory(categoriesRef.current, categoryId, direction);
    if (!next) return;
    persistCategories(next);
    void queueCategoriesAndFlush(next);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const current = categoriesRef.current;
    const target = current.find((cat) => cat.id === categoryId);
    if (!target) return;
    if (current.length <= 1) {
      showToast('Keep at least one category.', 'error');
      return;
    }

    const remaining = current.filter((cat) => cat.id !== categoryId);
    const fallback = remaining[0];
    if (!fallback) return;

    const confirmed = await confirmAction({
      title: 'Delete this category?',
      description: `Tasks in “${target.name}” will move to “${fallback.name}”.`,
      confirmLabel: 'Delete category',
    });
    if (!confirmed) return;

    const reassigned = tasks.map((task) => {
      if (task.categoryId !== categoryId) return task;
      return { ...task, categoryId: fallback.id, updatedAt: Date.now() };
    });
    persistTasks(reassigned);
    for (const task of reassigned.filter((task) => task.categoryId === fallback.id)) {
      const original = tasks.find((item) => item.id === task.id);
      if (original && original.categoryId === categoryId) {
        void queueAndFlush('upsert_task', task.id, task);
      }
    }

    const nextCats = normalizeCategoryOrder(remaining);
    persistCategories(nextCats);
    if (user) {
      suppressRealtimeSyncUntilRef.current = Date.now() + 2000;
      enqueueOp(user.id, 'delete_category', categoryId);
      for (const cat of nextCats) {
        enqueueOp(user.id, 'upsert_category', cat.id, cat);
      }
      refreshPendingCount(user.id);
      void runFlushOutbox().finally(() => {
        suppressRealtimeSyncUntilRef.current = Date.now() + 1500;
      });
    }
  };

  const handleImportData = async (tasksImported: Task[], categoriesImported: Category[]) => {
    persistTasks(tasksImported);
    persistCategories(categoriesImported);
    if (!user) return;

    try {
      const [remoteTasks, remoteCats] = await Promise.all([
        fetchTasksFromSupabase(),
        fetchCategoriesFromSupabase(),
      ]);
      const importedTaskIds = new Set(tasksImported.map((task) => task.id));
      const importedCatIds = new Set(categoriesImported.map((cat) => cat.id));

      for (const remote of remoteTasks) {
        if (!importedTaskIds.has(remote.id)) {
          enqueueOp(user.id, 'delete_task', remote.id);
        }
      }
      for (const remote of remoteCats) {
        if (!importedCatIds.has(remote.id)) {
          enqueueOp(user.id, 'delete_category', remote.id);
        }
      }
    } catch (err) {
      console.warn('Could not diff remote data during import:', err);
    }

    for (const cat of categoriesImported) {
      enqueueOp(user.id, 'upsert_category', cat.id, cat);
    }
    for (const task of tasksImported) {
      enqueueOp(user.id, 'upsert_task', task.id, task);
    }
    refreshPendingCount(user.id);
    showToast(`Imported ${tasksImported.length} tasks. Syncing to cloud…`, 'success');
    await handleSyncWithSupabase();
  };

  const handleGitHubLoginClick = async () => {
    try {
      setAuthError(null);
      setAuthInfo(null);
      await loginWithGitHub();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'GitHub 登录启动失败，请检查浏览器弹窗拦截设置');
    }
  };

  const handleEmailAuthSubmit = async (
    mode: EmailAuthMode,
    email: string,
    password: string
  ) => {
    setIsEmailAuthSubmitting(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const result =
        mode === 'signin'
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(email, password);

      if (result.session?.user) {
        setUser(result.session.user);
        return;
      }

      if (result.needsEmailConfirmation) {
        setAuthInfo('注册成功。请查收确认邮件并点击链接后再登录。');
        return;
      }

      setAuthError('登录未完成，请稍后重试。');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '邮箱登录失败，请检查邮箱和密码');
    } finally {
      setIsEmailAuthSubmitting(false);
    }
  };

  const handleLogoutClick = async () => {
    try {
      if (user && countPendingOps(user.id) > 0) {
        const confirmed = await confirmAction({
          title: 'Sign out with unsynced changes?',
          description: `${countPendingOps(user.id)} local change(s) have not reached the cloud yet and will be discarded.`,
          confirmLabel: 'Sign out anyway',
        });
        if (!confirmed) return;
      }
      if (user) clearOutbox(user.id);
      clearLocalUserData();
      await logoutSupabase();
      setUser(null);
      setTasks([]);
      tasksRef.current = [];
      setCategories([]);
      categoriesRef.current = [];
      setPendingSyncCount(0);
      setSyncError(null);
    } catch (err) {
      console.error('Logout error:', err);
      showToast(err instanceof Error ? err.message : 'Logout failed', 'error');
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

  if (isAuthLoading || isCompletingSignIn) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <LoaderCircle className="w-6 h-6 animate-spin" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {isCompletingSignIn ? 'Completing sign-in' : 'Checking session'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isCompletingSignIn
                ? 'Finishing authorization. This usually takes a moment…'
                : 'Restoring your account…'}
            </p>
          </div>
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
              使用邮箱或 GitHub 登录后即可同步待办。
            </p>
          </div>
          {authError && (
            <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {authError}
            </div>
          )}
          <EmailAuthForm
            isSubmitting={isEmailAuthSubmitting}
            infoMessage={authInfo}
            onSubmit={handleEmailAuthSubmit}
          />
          <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            <span>或</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
          <button
            type="button"
            onClick={handleGitHubLoginClick}
            disabled={isEmailAuthSubmitting}
            className="w-full min-h-11 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition-opacity"
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
      {updateAvailable && (
        <div className="sticky top-0 z-50 bg-indigo-600 text-white text-xs px-3 py-2 flex items-center justify-between gap-3">
          <span>发现新版本，点击刷新以加载最新应用。</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                void applyUpdate();
              }}
              className="px-2.5 py-1 rounded-lg bg-white text-indigo-700 font-semibold"
            >
              立即刷新
            </button>
            <button
              type="button"
              onClick={dismissUpdate}
              className="px-2 py-1 rounded-lg bg-indigo-500/80 hover:bg-indigo-500"
            >
              关闭
            </button>
          </div>
        </div>
      )}

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
            <h2>{dashboardCopy.title}</h2>
            <p>{dashboardCopy.subtitle}</p>
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
            dateStr={selectedDate}
            tasks={tasks}
            onDateSelect={setSelectedDate}
            onOpenAiAssist={handleOpenAiAssist}
          />

          <TaskInput
            categories={categories}
            selectedDate={selectedDate}
            onAddTask={handleAddTask}
            onGenerateTaskDraft={handleGenerateTaskDraft}
            aiEnabled={aiEnabled}
            resetKey={taskInputResetKey}
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
      <footer className="py-2.5 text-center text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/50 mb-16 sm:mb-0">
        <span>todo.ningto.com</span>
        <span className="mx-1.5 opacity-30">•</span>
        <span>© {new Date().getFullYear()}</span>
        <span className="mx-1.5 opacity-30">•</span>
        <span>Daily TODOs</span>
        <span className="mx-1.5 opacity-30">•</span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors">鄂ICP备17003086号-2</a>
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
        syncError={syncError}
        pendingSyncCount={pendingSyncCount}
        onImportData={handleImportData}
        aiEnabled={aiEnabled}
        onAiEnabledChange={handleAiEnabledChange}
      />

      {/* Category Management Settings Modal */}
      <CategorySettingsModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onAddCategory={handleAddCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onReorderCategory={handleReorderCategory}
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
        isAuthenticated={Boolean(user)}
        onSignIn={handleGitHubLoginClick}
      />

      {/* AI-generated task review modal */}
      <TaskEditModal
        task={draftTask}
        categories={categories}
        isOpen={Boolean(draftTask)}
        mode="create"
        onClose={handleCloseDraftTask}
        onSave={handleCreateDraftTask}
      />

      <AiAssistModal
        isOpen={isAiAssistOpen}
        onClose={handleCloseAiAssist}
        mode={aiAssistMode}
        subtitle={aiAssistSubtitle}
        result={aiAssistResult}
        isLoading={isAiAssistLoading}
        error={aiAssistError}
        usedFallback={aiAssistUsedFallback}
        onGenerate={handleRegenerateAiAssist}
      />

      {/* Mobile Smartphone Bottom Navigation Toolbar */}
      <MobileBottomNav
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
        onOpenDropModal={handleOpenDropModal}
        onFocusTaskInput={handleFocusTaskInput}
      />
    </div>
  );
}
