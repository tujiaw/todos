import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Clock, ListTodo, Trophy, Sparkles, ChevronDown, BarChart2 } from 'lucide-react';

interface ProgressBarProps {
  totalTasks: number;
  completedTasks: number;
  totalEstimatedMinutes: number;
  dateStr: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  totalTasks,
  completedTasks,
  totalEstimatedMinutes,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  const getMotivationalText = () => {
    if (totalTasks === 0) return 'No tasks scheduled for today. Click below to add one!';
    if (percentage === 0) return 'Ready to go! Check off tasks to start a productive day.';
    if (percentage < 50) return 'Good start, keep up the momentum!';
    if (percentage < 100) return 'More than half done, victory is in sight!';
    return 'Awesome! All tasks for today are completed! 🎉';
  };

  const formatHoursMinutes = (totalMins: number) => {
    if (!totalMins || totalMins <= 0) return '0 mins';
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m} mins`;
  };

  return (
    <div
      id="progress-card"
      className="progress-card h-full p-4 sm:p-5 bg-gradient-to-br from-indigo-50 via-blue-50 to-violet-100 dark:from-slate-950 dark:via-indigo-950 dark:to-indigo-900 text-slate-800 dark:text-white rounded-3xl transition-colors overflow-hidden"
    >
      {/* Main Compact Progress Bar Row */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        {/* Left: Progress Label & Bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="p-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <h2 className="text-xs font-semibold text-slate-800 dark:text-white">Daily Progress</h2>
            </div>
            <div className="flex items-baseline gap-1 text-xs">
              <span className="font-bold text-indigo-700 dark:text-white">{percentage}%</span>
              <span className="text-[11px] text-indigo-500 dark:text-indigo-200 font-medium">({completedTasks}/{totalTasks})</span>
            </div>
          </div>

          {/* Progress Bar Container */}
          <div className="w-full bg-white/75 dark:bg-white/12 rounded-full h-2.5 overflow-hidden p-0.5 border border-indigo-100 dark:border-white/10">
            <motion.div
              className={`h-full rounded-full transition-all duration-500 ${
                percentage === 100
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Expand Details Toggle Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 rounded-xl text-xs font-medium text-indigo-600 dark:text-indigo-200 hover:text-indigo-800 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10 transition-colors flex items-center gap-1 shrink-0 min-h-[32px]"
          title={isExpanded ? 'Collapse Stats' : 'Expand Stats'}
        >
          <BarChart2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="hidden sm:inline text-[11px]">{isExpanded ? 'Hide Stats' : 'Stats Details'}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded Details Section */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3 relative z-10 overflow-hidden"
          >
            {/* Motivational Text */}
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5">
              {percentage === 100 && <Trophy className="w-3.5 h-3.5 text-amber-500 inline" />}
              <span>{getMotivationalText()}</span>
            </p>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50/80 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                <div className="flex items-center justify-center gap-1 text-slate-500 dark:text-slate-400 text-[11px] mb-0.5">
                  <ListTodo className="w-3 h-3 text-blue-500" />
                  <span>Total Tasks</span>
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{totalTasks}</p>
              </div>

              <div className="bg-slate-50/80 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                <div className="flex items-center justify-center gap-1 text-slate-500 dark:text-slate-400 text-[11px] mb-0.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>Completed</span>
                </div>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{completedTasks}</p>
              </div>

              <div className="bg-slate-50/80 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                <div className="flex items-center justify-center gap-1 text-slate-500 dark:text-slate-400 text-[11px] mb-0.5">
                  <Clock className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                  <span>Est. Time</span>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate" title={formatHoursMinutes(totalEstimatedMinutes)}>
                  {formatHoursMinutes(totalEstimatedMinutes)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
