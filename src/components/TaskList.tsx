import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, ArrowUpDown, X, RotateCcw, RefreshCw, Inbox, CheckCircle2 } from 'lucide-react';
import { Category, SortByOption, Task, TaskFilterStatus } from '../types';
import { getTodayDateString } from '../data/initialData';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  categories: Category[];
  activeCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  onToggleComplete: (taskId: string) => void;
  onTogglePin: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  selectedDate: string;
  onRefresh: () => void | Promise<void>;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  categories,
  activeCategoryId,
  onSelectCategory,
  onToggleComplete,
  onTogglePin,
  onDeleteTask,
  onEditTask,
  onToggleSubtask,
  selectedDate,
  onRefresh,
}) => {
  const [filterStatus, setFilterStatus] = useState<TaskFilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortByOption>('createdAt');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);

  const handleRefresh = async () => {
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  };

  // Category map helper
  const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

  // Active Category Object
  const activeCategoryObj = activeCategoryId ? categoryMap.get(activeCategoryId) : null;

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    // Category filter
    if (activeCategoryId && t.categoryId !== activeCategoryId) {
      return false;
    }
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = t.title.toLowerCase().includes(q);
      const descMatch = t.description?.toLowerCase().includes(q);
      if (!titleMatch && !descMatch) return false;
    }
    // Status filter
    if (filterStatus === 'pending') return !t.completed;
    if (filterStatus === 'completed') return t.completed;
    if (filterStatus === 'high_priority') return t.priority === 'high';

    return true;
  });

  // Sort tasks
  filteredTasks.sort((a, b) => {
    // Always keep pinned items on top unless sorting explicitly changes it
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    if (sortBy === 'priority') {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    }
    if (sortBy === 'dueTime') {
      if (!a.dueTime) return 1;
      if (!b.dueTime) return -1;
      return a.dueTime.localeCompare(b.dueTime);
    }
    if (sortBy === 'category') {
      return a.categoryId.localeCompare(b.categoryId);
    }
    // Default: createdAt descending
    return b.createdAt - a.createdAt;
  });

  const pendingCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  // Only surface non-tab filters here (status is already visible in the segmented control).
  const hasExtraFilters = activeCategoryId !== null || searchQuery.trim() !== '';

  const clearExtraFilters = () => {
    onSelectCategory(null);
    setSearchQuery('');
  };

  const tabClass = (active: boolean) =>
    `px-2 py-1 rounded-lg text-[11px] transition-colors whitespace-nowrap ${
      active
        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
    }`;

  let emptyIcon = <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
  let emptyTitle = '没有符合筛选条件的任务';
  let emptyDescription = '没有符合当前筛选条件的任务。';
  if (searchQuery) {
    emptyIcon = <Search className="w-6 h-6" />;
    emptyTitle = '未找到匹配的任务';
    emptyDescription = '请尝试其他关键词，或清除搜索。';
  } else if (tasks.length === 0) {
    emptyIcon = <Inbox className="w-6 h-6" />;
    if (selectedDate === getTodayDateString()) {
      emptyTitle = '今天还没有任务';
      emptyDescription = '在上方输入你的第一个任务！';
    } else {
      emptyTitle = `此日期暂无任务： ${selectedDate}`;
      emptyDescription = '为这一天添加任务，或返回今天。';
    }
  }

  return (
    <div id="task-list-section" className="task-board space-y-4">
      <div className="task-toolbar p-2.5 sm:p-3 space-y-2 transition-colors">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <div className="relative w-36 sm:w-44 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-search-tasks"
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-7 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 min-h-[34px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="清除搜索"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0 min-h-[34px] min-w-[34px] flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label={isRefreshing ? '正在刷新任务' : '刷新任务'}
            aria-busy={isRefreshing}
            title={isRefreshing ? '正在刷新…' : '刷新任务'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex items-center gap-0.5 bg-slate-100/80 dark:bg-slate-800/80 p-0.5 rounded-xl text-xs font-medium shrink-0">
            <button type="button" onClick={() => setFilterStatus('all')} className={tabClass(filterStatus === 'all')}>
              全部（{tasks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('pending')}
              className={tabClass(filterStatus === 'pending')}
            >
              待完成（{pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('completed')}
              className={tabClass(filterStatus === 'completed')}
            >
              已完成（{completedCount})
            </button>
          </div>

          <div className="flex items-center gap-1 text-[11px] bg-slate-100/80 dark:bg-slate-800/80 rounded-xl px-2 py-1 shrink-0 min-h-[30px] ml-auto">
            <ArrowUpDown className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" />
            <select
              id="select-sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortByOption)}
              className="bg-transparent text-slate-700 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer text-[11px]"
            >
              <option value="createdAt" className="dark:bg-slate-900">
                最新
              </option>
              <option value="priority" className="dark:bg-slate-900">
                优先级
              </option>
              <option value="dueTime" className="dark:bg-slate-900">
                时间
              </option>
              <option value="category" className="dark:bg-slate-900">
                分类
              </option>
            </select>
          </div>
        </div>

        {hasExtraFilters && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
            {activeCategoryObj && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${activeCategoryObj.bgClass} ${activeCategoryObj.textClass} ${activeCategoryObj.borderClass}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: activeCategoryObj.color }}
                />
                <span>{activeCategoryObj.name}</span>
                <button
                  type="button"
                  onClick={() => onSelectCategory(null)}
                  className="p-0.5 hover:opacity-80 rounded transition-opacity"
                  title="清除分类筛选"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <span className="max-w-[10rem] truncate">“{searchQuery.trim()}”</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900 rounded transition-colors"
                  title="清除搜索"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={clearExtraFilters}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 ml-auto shrink-0 px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>重置</span>
            </button>
          </div>
        )}
      </div>

      {/* Task List Container */}
      <AnimatePresence mode="popLayout">
        {filteredTasks.length > 0 ? (
          <div className="task-card-list space-y-2.5">
            {filteredTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                category={categoryMap.get(task.categoryId)}
                onToggleComplete={onToggleComplete}
                onTogglePin={onTogglePin}
                onDeleteTask={onDeleteTask}
                onEditTask={onEditTask}
                onToggleSubtask={onToggleSubtask}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200/80 dark:border-slate-800 text-center space-y-3 transition-colors"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              {emptyIcon}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{emptyTitle}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                {emptyDescription}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

