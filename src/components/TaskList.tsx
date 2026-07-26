import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, ArrowUpDown, CheckCircle2, Inbox, Filter, Folder, X, RotateCcw } from 'lucide-react';
import { Category, SortByOption, Task, TaskFilterStatus } from '../types';
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
}) => {
  const [filterStatus, setFilterStatus] = useState<TaskFilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortByOption>('createdAt');

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
  const highPriorityCount = tasks.filter((t) => t.priority === 'high').length;

  const hasActiveFilters = filterStatus !== 'all' || activeCategoryId !== null || searchQuery.trim() !== '';

  return (
    <div id="task-list-section" className="space-y-3">
      {/* Streamlined Search & Status Filter Bar */}
      <div className="py-2 px-1 space-y-2 border-b border-slate-200/60 dark:border-slate-800/80 transition-colors">
        {/* Search, Status Tabs & Sort Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-search-tasks"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-7 pr-7 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[32px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Tabs & Sort Dropdown Group */}
          <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
            {/* Segmented Status Tabs */}
            <div className="flex items-center gap-0.5 bg-slate-100/80 dark:bg-slate-800/80 p-0.5 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-2 py-1 rounded-lg text-[11px] transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All ({tasks.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('pending')}
                className={`px-2 py-1 rounded-lg text-[11px] transition-colors ${
                  filterStatus === 'pending'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('completed')}
                className={`px-2 py-1 rounded-lg text-[11px] transition-colors ${
                  filterStatus === 'completed'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Done ({completedCount})
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 text-[11px] bg-slate-100/80 dark:bg-slate-800/80 rounded-xl px-2 py-1 shrink-0 min-h-[30px]">
              <ArrowUpDown className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" />
              <select
                id="select-sort-by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortByOption)}
                className="bg-transparent text-slate-700 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer text-[11px]"
              >
                <option value="createdAt" className="dark:bg-slate-900">Newest</option>
                <option value="priority" className="dark:bg-slate-900">Priority</option>
                <option value="dueTime" className="dark:bg-slate-900">Time</option>
                <option value="category" className="dark:bg-slate-900">Category</option>
              </select>
            </div>
          </div>
        </div>

        {/* Row 3: Active Filter Badge Indicators (Flex Wrap without horizontal scrollbar) */}
        {hasActiveFilters && (
          <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium shrink-0">Active Filters:</span>

            {/* Status Filter Pill */}
            {filterStatus !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <span>
                  {filterStatus === 'pending' && 'Pending'}
                  {filterStatus === 'completed' && 'Completed'}
                  {filterStatus === 'high_priority' && 'High Priority'}
                </span>
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className="p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors"
                  title="Clear status filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Category Filter Pill */}
            {activeCategoryObj && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${activeCategoryObj.bgClass} ${activeCategoryObj.textClass} ${activeCategoryObj.borderClass}`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeCategoryObj.color }} />
                <span>{activeCategoryObj.name}</span>
                <button
                  type="button"
                  onClick={() => onSelectCategory(null)}
                  className="p-0.5 hover:opacity-80 rounded transition-opacity"
                  title="Clear category filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Search Query Pill */}
            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <span>"{searchQuery.trim()}"</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900 rounded transition-colors"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Reset All Filters Button */}
            <button
              type="button"
              onClick={() => {
                setFilterStatus('all');
                onSelectCategory(null);
                setSearchQuery('');
              }}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 ml-auto shrink-0 px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset All Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Task List Container */}
      <AnimatePresence mode="popLayout">
        {filteredTasks.length > 0 ? (
          <div className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
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
              {searchQuery ? (
                <Search className="w-6 h-6" />
              ) : tasks.length === 0 ? (
                <Inbox className="w-6 h-6" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {searchQuery
                  ? 'No matching tasks found'
                  : tasks.length === 0
                  ? 'No tasks for today'
                  : 'No tasks match this filter'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                {searchQuery
                  ? 'Try searching with a different keyword or clear the search.'
                  : tasks.length === 0
                  ? 'Type your first task above to get started!'
                  : 'All clear! No tasks match this filter view.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

