import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Clock, ListTodo, Trophy, Sparkles, ChevronDown, BarChart2, CalendarDays } from 'lucide-react';
import { Task } from '../types';

interface ProgressBarProps {
  totalTasks: number;
  completedTasks: number;
  totalEstimatedMinutes: number;
  dateStr: string;
  tasks: Task[];
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDays(anchorDateStr: string): string[] {
  const anchor = new Date(anchorDateStr + 'T00:00:00');
  const dayOfWeek = anchor.getDay(); // 0=Sun … 6=Sat
  // Monday offset: if Sunday(0) → -6, else 1 - dayOfWeek
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  totalTasks,
  completedTasks,
  totalEstimatedMinutes,
  dateStr,
  tasks,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  // Compute per-day stats for the current week
  const weekStats = useMemo(() => {
    const weekDays = getWeekDays(dateStr);
    const todayStr = dateStr;

    return weekDays.map((day) => {
      const dayTasks = tasks.filter((t) => t.date === day);
      const total = dayTasks.length;
      const completed = dayTasks.filter((t) => t.completed).length;
      const uncompleted = total - completed;
      return { date: day, total, completed, uncompleted, isToday: day === todayStr };
    });
  }, [tasks, dateStr]);

  const maxTotal = Math.max(...weekStats.map((d) => d.total), 1);
  const MAX_BAR_HEIGHT_PX = 56;
  const MIN_BAR_HEIGHT_PX = 4;

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

            {/* Weekly Bar Chart */}
            <div className="bg-slate-50/80 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">This Week</span>
                <div className="flex items-center gap-2 ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-emerald-400 dark:bg-emerald-500" />
                    Done
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-slate-300 dark:bg-slate-600" />
                    Left
                  </span>
                </div>
              </div>

              {/* Bar Chart */}
              <div className="flex items-end justify-around gap-1.5 h-20">
                {weekStats.map((day) => {
                  const barHeight = day.total === 0
                    ? MIN_BAR_HEIGHT_PX
                    : Math.max(MIN_BAR_HEIGHT_PX, Math.round((day.total / maxTotal) * MAX_BAR_HEIGHT_PX));

                  const completedRatio = day.total === 0 ? 0 : day.completed / day.total;
                  const completedHeight = Math.round(barHeight * completedRatio);
                  const uncompletedHeight = barHeight - completedHeight;

                  // 0=Mon … 6=Sun
                  const dow = new Date(day.date + 'T00:00:00').getDay();
                  const dayIndex = dow === 0 ? 6 : dow - 1;

                  return (
                    <div
                      key={day.date}
                      className="flex flex-col items-center gap-1 flex-1 min-w-0"
                    >
                      {/* Count label above bar */}
                      {day.total > 0 && (
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-none">
                          {day.total}
                        </span>
                      )}
                      {day.total === 0 && (
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 leading-none">-</span>
                      )}

                      {/* Stacked Bar */}
                      <div
                        className="w-full max-w-[24px] rounded-md overflow-hidden flex flex-col justify-end"
                        style={{ height: `${barHeight}px` }}
                      >
                        {/* Completed portion (top, green) */}
                        {completedHeight > 0 && (
                          <div
                            className="w-full bg-emerald-400 dark:bg-emerald-500 transition-all duration-300"
                            style={{ height: `${completedHeight}px` }}
                          />
                        )}
                        {/* Uncompleted portion (bottom, gray) */}
                        {uncompletedHeight > 0 && (
                          <div
                            className="w-full bg-slate-300 dark:bg-slate-600 transition-all duration-300"
                            style={{ height: `${uncompletedHeight}px` }}
                          />
                        )}
                      </div>

                      {/* Day label */}
                      <span
                        className={`text-[10px] font-medium leading-none mt-0.5 ${
                          day.isToday
                            ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {DAY_LABELS[dayIndex]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
