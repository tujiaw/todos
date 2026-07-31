import React from 'react';
import { Calendar, Plus, Tag, Send, CheckSquare } from 'lucide-react';
import { getTodayDateString } from '../data/initialData';

interface MobileBottomNavProps {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onOpenCategoryModal: () => void;
  onOpenDropModal: () => void;
  onFocusTaskInput: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  selectedDate,
  setSelectedDate,
  onOpenCategoryModal,
  onOpenDropModal,
  onFocusTaskInput,
}) => {
  const todayStr = getTodayDateString();
  const isToday = selectedDate === todayStr;

  const scrollToTasks = () => {
    const el = document.getElementById('task-list-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="fixed bottom-3 left-3 right-3 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white dark:border-slate-800 px-3 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:hidden transition-colors shadow-2xl rounded-2xl">
      <div className="max-w-md mx-auto flex items-center justify-around relative">
        <button
          type="button"
          onClick={() => setSelectedDate(todayStr)}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-w-[56px] min-h-[44px] active:scale-95 ${
            isToday
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Calendar className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-0.5">Today</span>
        </button>

        <button
          type="button"
          onClick={scrollToTasks}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all min-w-[56px] min-h-[44px] active:scale-95"
        >
          <CheckSquare className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-0.5">Tasks</span>
        </button>

        <div className="-mt-5 relative">
          <button
            type="button"
            onClick={onFocusTaskInput}
            className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 active:scale-90 transition-transform border-2 border-white dark:border-slate-900"
            title="Quick Add Task"
          >
            <Plus className="w-6 h-6 stroke-[2.8]" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenCategoryModal}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all min-w-[56px] min-h-[44px] active:scale-95"
        >
          <Tag className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-0.5">Categories</span>
        </button>

        <button
          type="button"
          onClick={onOpenDropModal}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all min-w-[56px] min-h-[44px] active:scale-95"
        >
          <Send className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] mt-0.5">Drop</span>
        </button>
      </div>
    </nav>
  );
};
