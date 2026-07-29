import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  Pin,
  Clock,
  Flag,
  Trash2,
  Edit3,
  ChevronDown,
  CheckSquare,
  Square,
  Image as ImageIcon,
  Maximize2,
  X,
} from 'lucide-react';
import { Category, Task } from '../types';

interface TaskItemProps {
  task: Task;
  category?: Category;
  onToggleComplete: (taskId: string) => void;
  onTogglePin: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  category,
  onToggleComplete,
  onTogglePin,
  onDeleteTask,
  onEditTask,
  onToggleSubtask,
}) => {
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  const completedSubtasksCount = task.subtasks.filter((st) => st.completed).length;
  const totalSubtasksCount = task.subtasks.length;

  const getPriorityBadge = (p: Task['priority']) => {
    switch (p) {
      case 'high':
        return (
          <span className="task-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-[10px] font-semibold">
            <Flag className="w-2.5 h-2.5 text-rose-500 fill-rose-500" />
            High
          </span>
        );
      case 'medium':
        return (
          <span className="task-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
            <Flag className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
            Medium
          </span>
        );
      case 'low':
      default:
        return (
          <span className="task-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-[10px] font-medium">
            <Flag className="w-2.5 h-2.5 text-slate-400" />
            Low
          </span>
        );
    }
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className={`task-item group relative px-4 py-4 sm:px-5 transition-all ${
          task.completed
            ? 'task-item-completed bg-slate-50/90 dark:bg-slate-900/55'
            : task.pinned
            ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-l-[3px] border-l-indigo-500'
            : 'bg-white dark:bg-slate-900 hover:-translate-y-0.5'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Custom Animated Checkbox */}
          <button
            type="button"
            id={`btn-check-${task.id}`}
            onClick={() => onToggleComplete(task.id)}
            className={`w-5 h-5 rounded-lg border transition-all flex items-center justify-center shrink-0 mt-0.5 min-h-[32px] min-w-[32px] sm:min-h-[20px] sm:min-w-[20px] ${
              task.completed
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-500 bg-white dark:bg-slate-800 hover:bg-blue-50/50'
            }`}
            title={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
          >
            {task.completed && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400 }}>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </motion.div>
            )}
          </button>

          {/* Task Main Details (2-Line Layout) */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Line 1: Title & Pin Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className={`text-sm font-semibold leading-snug transition-all ${
                  task.completed ? 'text-slate-600 dark:text-slate-400 font-medium' : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {task.title}
              </h4>

              {/* Pin Indicator Badge */}
              {task.pinned && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                  <Pin className="w-2.5 h-2.5 fill-current" />
                  Pinned
                </span>
              )}
            </div>

            {/* Line 2: Category, Priority, and Time Badges */}
            <div className="flex items-center gap-2 flex-wrap text-[10px]">
              {/* Category Badge */}
              {category && (
                <span
                  className={`task-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${category.bgClass} ${category.textClass}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
                  {category.name}
                </span>
              )}

              {/* Priority Badge */}
              {getPriorityBadge(task.priority)}

              {/* Time Indicator (Due Time / Estimated Duration) */}
              {(task.dueTime || task.estimatedMinutes) && (
                <span className="task-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  <Clock className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  {task.dueTime && <span>{task.dueTime}</span>}
                  {task.dueTime && task.estimatedMinutes && <span>•</span>}
                  {task.estimatedMinutes && <span>{task.estimatedMinutes} mins</span>}
                </span>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {task.description}
              </p>
            )}

            {/* Attached Image Thumbnail */}
            {task.imageUrl && (
              <div className="mt-2">
                <div
                  onClick={() => setShowImageModal(true)}
                  className="relative group/img inline-block cursor-pointer rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 max-w-xs max-h-36 bg-slate-100 dark:bg-slate-800 shadow-2xs"
                >
                  <img
                    src={task.imageUrl}
                    alt="Task attachment"
                    className="object-cover max-h-36 w-full transition-transform duration-300 group-hover/img:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1">
                    <Maximize2 className="w-4 h-4" />
                    <span>View Image</span>
                  </div>
                </div>
              </div>
            )}

            {/* Subtasks Summary */}
            {totalSubtasksCount > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowSubtasks(!showSubtasks)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium py-0.5 transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>
                    Subtasks ({completedSubtasksCount}/{totalSubtasksCount})
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      showSubtasks ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Subtasks Expandable */}
                <AnimatePresence>
                  {showSubtasks && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-1.5 space-y-1 pl-2 border-l-2 border-slate-200 dark:border-slate-700"
                    >
                      {task.subtasks.map((st) => (
                        <div
                          key={st.id}
                          className="flex items-center gap-2 text-xs py-0.5 cursor-pointer group/sub"
                          onClick={() => onToggleSubtask(task.id, st.id)}
                        >
                          {st.completed ? (
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover/sub:text-slate-400 shrink-0" />
                          )}
                          <span
                            className={`transition-colors ${
                              st.completed ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {st.title}
                          </span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            {/* Pin Button */}
            <button
              type="button"
              onClick={() => onTogglePin(task.id)}
              className={`p-1.5 rounded-lg text-xs transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center ${
                task.pinned
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={task.pinned ? 'Unpin task' : 'Pin task'}
            >
              <Pin className={`w-3.5 h-3.5 ${task.pinned ? 'fill-blue-600 dark:fill-blue-400' : ''}`} />
            </button>

            {/* Edit Button */}
            <button
              type="button"
              onClick={() => onEditTask(task)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
              title="Edit task"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>

            {/* Delete Button */}
            <button
              type="button"
              onClick={() => onDeleteTask(task.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
              title="Delete task"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Image Modal Lightbox */}
      <AnimatePresence>
        {showImageModal && task.imageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowImageModal(false)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl p-2 border border-slate-800"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="absolute top-3 right-3 z-10 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={task.imageUrl}
                alt="Enlarged attachment"
                className="max-h-[85vh] max-w-full object-contain rounded-xl mx-auto"
              />
              <div className="p-2 text-center text-xs text-slate-300 font-medium truncate">
                {task.title}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
