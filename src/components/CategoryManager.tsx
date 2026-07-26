import React from 'react';
import { Folder, Filter } from 'lucide-react';
import { Category, Task } from '../types';

interface CategoryManagerProps {
  categories: Category[];
  activeCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  tasks: Task[];
  onOpenCategoryModal?: () => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  categories,
  activeCategoryId,
  onSelectCategory,
  tasks,
}) => {
  // Calculate task counts by category
  const getCategoryCount = (catId: string | null) => {
    if (catId === null) return tasks.length;
    return tasks.filter((t) => t.categoryId === catId).length;
  };

  return (
    <div id="category-section" className="bg-white dark:bg-slate-900 rounded-2xl p-2.5 sm:p-3 border border-slate-200/90 dark:border-slate-800 shadow-xs transition-colors">
      {/* Category Horizontal Filter Row */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
          <Filter className="w-3 h-3" />
          <span>Category:</span>
        </span>

        {/* All Categories Pill */}
        <button
          id="btn-cat-all"
          onClick={() => onSelectCategory(null)}
          className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 shrink-0 border min-h-[30px] ${
            activeCategoryId === null
              ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600 shadow-xs'
              : 'bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/80'
          }`}
        >
          <Folder className="w-3 h-3" />
          <span>All</span>
          <span
            className={`px-1.5 py-0.2 text-[10px] rounded-full font-semibold ${
              activeCategoryId === null ? 'bg-slate-800 dark:bg-blue-700 text-slate-200' : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {getCategoryCount(null)}
          </span>
        </button>

        {/* Individual Category Pills */}
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id;
          const count = getCategoryCount(cat.id);

          return (
            <button
              key={cat.id}
              id={`btn-cat-${cat.id}`}
              onClick={() => onSelectCategory(isActive ? null : cat.id)}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 shrink-0 border min-h-[30px] ${
                isActive
                  ? `${cat.bgClass} ${cat.textClass} ${cat.borderClass} ring-1 ring-blue-500/30 shadow-xs`
                  : 'bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/70 dark:border-slate-700/70'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
              <span>{cat.name}</span>
              <span
                className={`px-1.5 py-0.2 text-[10px] rounded-full font-semibold ${
                  isActive ? 'bg-white/80 dark:bg-slate-900/60' : 'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
