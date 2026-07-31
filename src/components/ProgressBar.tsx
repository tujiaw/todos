import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  CalendarDays,
  FileText,
} from 'lucide-react';
import { Task } from '../types';
import { getTodayDateString } from '../data/initialData';
import { formatWeekDisplayLabel, getWeekDays } from '../utils/week';

interface ProgressBarProps {
  totalTasks: number;
  completedTasks: number;
  dateStr: string;
  tasks: Task[];
  onDateSelect?: (date: string) => void;
  onOpenWeeklySummary?: (weekAnchorDate: string) => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ProgressBar: React.FC<ProgressBarProps> = ({
  totalTasks,
  completedTasks,
  dateStr,
  tasks,
  onDateSelect,
  onOpenWeeklySummary,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  useEffect(() => {
    setWeekOffset(0);
  }, [dateStr]);

  const weekAnchor = useMemo(() => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + weekOffset * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [dateStr, weekOffset]);

  const weekDays = useMemo(() => getWeekDays(weekAnchor), [weekAnchor]);

  const weekStats = useMemo(() => {
    const todayStr = getTodayDateString();
    return weekDays.map((day) => {
      const dayTasks = tasks.filter((t) => t.date === day);
      const total = dayTasks.length;
      const completed = dayTasks.filter((t) => t.completed).length;
      return {
        date: day,
        total,
        completed,
        uncompleted: total - completed,
        isToday: day === todayStr,
      };
    });
  }, [tasks, weekDays]);

  const weekLabel = useMemo(
    () =>
      formatWeekDisplayLabel(weekDays[0], weekDays[6], {
        preferThisWeek: weekOffset === 0,
        today: getTodayDateString(),
      }),
    [weekDays, weekOffset]
  );

  const weekTaskCount = weekStats.reduce((sum, day) => sum + day.total, 0);
  const maxTotal = Math.max(...weekStats.map((d) => d.total), 1);
  const MAX_BAR_HEIGHT_PX = 56;
  const MIN_BAR_HEIGHT_PX = 4;

  return (
    <div
      id="progress-card"
      className="progress-card h-full p-4 sm:p-5 bg-gradient-to-br from-indigo-50 via-blue-50 to-violet-100 dark:from-slate-950 dark:via-indigo-950 dark:to-indigo-900 text-slate-800 dark:text-white rounded-3xl transition-colors overflow-hidden"
    >
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="p-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <h2 className="text-xs font-semibold text-slate-800 dark:text-white">Daily Progress</h2>
            </div>
            <div className="flex items-baseline gap-1 text-xs">
              <span className="font-bold text-indigo-700 dark:text-white">{percentage}%</span>
              <span className="text-[11px] text-indigo-500 dark:text-indigo-200 font-medium">
                ({completedTasks}/{totalTasks})
              </span>
            </div>
          </div>

          <div className="w-full bg-white/75 dark:bg-white/12 rounded-full h-2.5 overflow-hidden p-0.5 border border-indigo-100 dark:border-white/10">
            <motion.div
              className={`h-full rounded-full transition-all duration-500 ${
                percentage === 100
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                  : 'bg-gradient-to-r from-indigo-600 to-indigo-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 px-2.5 min-h-[34px] text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/80 rounded-xl transition-colors text-[11px] font-semibold"
          title={isExpanded ? 'Collapse week stats' : 'Expand week stats'}
          aria-expanded={isExpanded}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Week</span>
        </button>
      </div>

      {onOpenWeeklySummary && (
        <button
          type="button"
          onClick={() => onOpenWeeklySummary(weekAnchor)}
          className="relative z-10 mt-3 w-full inline-flex items-center justify-between gap-2 min-h-9 px-3 rounded-xl bg-white/85 dark:bg-slate-900/55 border border-indigo-100 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-200 text-[12px] font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Weekly minutes · {weekLabel}</span>
          </span>
          <span className="text-[10px] font-medium text-indigo-400 dark:text-indigo-300 shrink-0">
            {weekTaskCount} tasks
          </span>
        </button>
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3 relative z-10 overflow-hidden"
          >
            <div className="bg-slate-50/80 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setWeekOffset((o) => o - 1)}
                    className="p-0.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="Previous Week"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 min-w-[100px] text-center">
                    {weekLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((o) => o + 1)}
                    disabled={weekOffset === 0}
                    className="p-0.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-default"
                    title={weekOffset === 0 ? 'Current week' : 'Next Week'}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

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

              <div className="flex items-end justify-around gap-1.5 h-20">
                {weekStats.map((day) => {
                  const barHeight =
                    day.total === 0
                      ? MIN_BAR_HEIGHT_PX
                      : Math.max(
                          MIN_BAR_HEIGHT_PX,
                          Math.round((day.total / maxTotal) * MAX_BAR_HEIGHT_PX)
                        );

                  const completedRatio = day.total === 0 ? 0 : day.completed / day.total;
                  const completedHeight = Math.round(barHeight * completedRatio);
                  const uncompletedHeight = barHeight - completedHeight;
                  const dow = new Date(`${day.date}T00:00:00`).getDay();
                  const dayIndex = dow === 0 ? 6 : dow - 1;

                  return (
                    <button
                      type="button"
                      key={day.date}
                      onClick={() => onDateSelect?.(day.date)}
                      className="flex flex-col items-center gap-1 flex-1 min-w-0 group cursor-pointer hover:bg-white/50 dark:hover:bg-white/5 rounded-lg py-1 -my-1 transition-colors"
                      title={`${DAY_LABELS[dayIndex]}: ${day.total} tasks (${day.completed} done)`}
                    >
                      {day.total > 0 ? (
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 leading-none transition-colors">
                          {day.total}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 leading-none">
                          -
                        </span>
                      )}

                      <div
                        className="w-full max-w-[24px] rounded-md overflow-hidden flex flex-col justify-end group-hover:ring-2 group-hover:ring-indigo-400/60 transition-all"
                        style={{ height: `${barHeight}px` }}
                      >
                        {completedHeight > 0 && (
                          <div
                            className="w-full bg-emerald-400 dark:bg-emerald-500 transition-all duration-300"
                            style={{ height: `${completedHeight}px` }}
                          />
                        )}
                        {uncompletedHeight > 0 && (
                          <div
                            className="w-full bg-slate-300 dark:bg-slate-600 transition-all duration-300"
                            style={{ height: `${uncompletedHeight}px` }}
                          />
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-medium leading-none mt-0.5 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors ${
                          day.isToday
                            ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {DAY_LABELS[dayIndex]}
                      </span>
                    </button>
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
