import React, { useState, useRef, useEffect } from 'react';
import { Plus, Clock, Flag, Tag, ChevronDown, ListPlus, Image, X, Upload, Sparkles, LoaderCircle } from 'lucide-react';
import { Category, Priority, Task } from '../types';
import { resolveMediaUrl, uploadTaskImage } from '../lib/supabase';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

interface TaskInputProps {
  categories: Category[];
  selectedDate: string;
  onAddTask: (newTask: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onGenerateTaskDraft: (text: string) => Promise<void>;
  aiEnabled: boolean;
  resetKey?: number;
}

export const TaskInput: React.FC<TaskInputProps> = ({
  categories,
  selectedDate,
  onAddTask,
  onGenerateTaskDraft,
  aiEnabled,
  resetKey = 0,
}) => {
  const confirmAction = useConfirm();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id || '');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueTime, setDueTime] = useState<string>('');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showTimePickerPopover, setShowTimePickerPopover] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timePopoverRef.current && !timePopoverRef.current.contains(event.target as Node)) {
        setShowTimePickerPopover(false);
      }
    };
    if (showTimePickerPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTimePickerPopover]);

  useEffect(() => {
    if (!categories.some((category) => category.id === categoryId)) {
      setCategoryId(categories[0]?.id || '');
    }
  }, [categories, categoryId]);

  useEffect(() => {
    if (resetKey === 0) return;
    setTitle('');
    setDescription('');
    setDueTime('');
    setEstimatedMinutes('');
    setImageUrl('');
    setImagePreview('');
    setShowImageInput(false);
    setSubtasks([]);
    setNewSubtaskTitle('');
    setShowDetails(false);
    setAiError(null);
  }, [resetKey]);

  useEffect(() => {
    if (!aiEnabled) setAiError(null);
  }, [aiEnabled]);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file size cannot exceed 5MB', 'error');
      return;
    }
    setIsUploadingImage(true);
    try {
      const storageRef = await uploadTaskImage(file);
      setImageUrl(storageRef);
      const preview = await resolveMediaUrl(storageRef);
      setImagePreview(preview || URL.createObjectURL(file));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to upload image', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleAddTask = () => {
    if (!title.trim() || !categoryId) return;

    onAddTask({
      title: title.trim(),
      description: description.trim() || undefined,
      date: selectedDate,
      completed: false,
      categoryId,
      priority,
      dueTime: dueTime || undefined,
      estimatedMinutes: typeof estimatedMinutes === 'number' ? estimatedMinutes : undefined,
      imageUrl: imageUrl.trim() || undefined,
      pinned: false,
      subtasks: subtasks.map((st, idx) => ({
        id: `st-new-${Date.now()}-${idx}`,
        title: st,
        completed: false,
      })),
    });

    setTitle('');
    setDescription('');
    setDueTime('');
    setEstimatedMinutes('');
    setImageUrl('');
    setImagePreview('');
    setShowImageInput(false);
    setSubtasks([]);
    setNewSubtaskTitle('');
    setShowDetails(false);
  };

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      setSubtasks([...subtasks, newSubtaskTitle.trim()]);
      setNewSubtaskTitle('');
    }
  };

  const handleRemoveSubtask = async (index: number) => {
    const confirmed = await confirmAction({
      title: 'Remove this subtask?',
      description: 'This subtask will be removed from the new task.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  const handleGenerateDraft = async () => {
    if (!title.trim() || isGeneratingDraft) return;
    setAiError(null);
    setIsGeneratingDraft(true);
    try {
      const source = [title.trim(), description.trim()].filter(Boolean).join('\n\n');
      await onGenerateTaskDraft(source);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI task drafting failed.');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleAddTask();
  };

  const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    if ((event.metaKey || event.ctrlKey) && aiEnabled) {
      event.preventDefault();
      void handleGenerateDraft();
    }
  };

  const priorityFlagClass = (() => {
    if (priority === 'high') return 'text-rose-500 fill-rose-500';
    if (priority === 'medium') return 'text-amber-500 fill-amber-500';
    return 'text-slate-400';
  })();

  const handleRemoveImage = async () => {
    const confirmed = await confirmAction({
      title: 'Remove this image?',
      description: 'The image attachment will be removed from the new task.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    setImageUrl('');
    setImagePreview('');
  };

  return (
    <div id="task-input-card" className="task-composer p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 transition-all">
      <form onSubmit={handleFormSubmit}>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-950 dark:text-white">New task</h3>
          {aiEnabled && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Enter adds · ⌘/Ctrl+Enter drafts
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              id="input-task-title"
              placeholder="Write a task and press Enter..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              className="w-full h-10 text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 bg-slate-50/80 dark:bg-slate-800/70 rounded-xl px-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              maxLength={100}
              required
            />
          </div>

          <div className="h-10 shrink-0 flex items-stretch overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg shadow-indigo-500/10">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className={`w-10 flex items-center justify-center transition-colors active:scale-95 ${
                showDetails
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title="More options"
              aria-label={showDetails ? 'Hide task options' : 'Show more task options'}
              aria-expanded={showDetails}
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
            </button>

            <button
              type="submit"
              id="btn-add-task-submit"
              disabled={!title.trim() || !categoryId}
              className="min-w-10 px-2.5 sm:px-3 bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-40 text-white transition-all flex items-center justify-center gap-1 border-l border-white/15 active:scale-95"
              title="Add task (Enter)"
              aria-label="Add task"
            >
              <Plus className="w-4 h-4 stroke-[2.6]" />
              <span className="hidden sm:inline text-[11px] font-semibold">Add</span>
            </button>
            {aiEnabled && (
              <button
                type="button"
                onClick={() => void handleGenerateDraft()}
                disabled={!title.trim() || isGeneratingDraft || categories.length === 0}
                className="w-10 flex items-center justify-center border-l border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 disabled:opacity-40 transition-colors"
                title="Draft with AI (⌘/Ctrl+Enter)"
                aria-label="Generate AI task draft"
              >
                {isGeneratingDraft ? (
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {aiError && (
          <div
            role="alert"
            className="mt-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2"
          >
            <span>{aiError}</span>
            <button
              type="button"
              onClick={() => setAiError(null)}
              className="shrink-0 rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900"
              aria-label="Dismiss AI error"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Quick Options Row - Clean & Compact */}
        <div className="composer-options flex flex-wrap items-center gap-2 mt-2">
          {/* Category Selector */}
          <div className="soft-pill flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 transition-colors">
            <Tag className="w-3 h-3 text-slate-400" />
            <select
              id="select-task-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={categories.length === 0}
              className="bg-transparent text-slate-700 dark:text-slate-200 font-medium focus:outline-none cursor-pointer text-[11px]"
            >
              {categories.length === 0 && <option value="">Create a category first</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="dark:bg-slate-900 dark:text-slate-100">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Selector */}
          <div className="soft-pill flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 transition-colors">
            <Flag className={`w-3 h-3 ${priorityFlagClass}`} />
            <select
              id="select-task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="bg-transparent text-slate-700 dark:text-slate-200 font-medium focus:outline-none cursor-pointer text-[11px]"
            >
              <option value="low" className="dark:bg-slate-900 dark:text-slate-100">Low Priority</option>
              <option value="medium" className="dark:bg-slate-900 dark:text-slate-100">Medium Priority</option>
              <option value="high" className="dark:bg-slate-900 dark:text-slate-100">High Priority</option>
            </select>
          </div>

          {/* Single Icon Time Trigger & Popover */}
          <div className="relative inline-flex items-center text-[11px]" ref={timePopoverRef}>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowTimePickerPopover(!showTimePickerPopover)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
                  dueTime
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={dueTime ? `Due time: ${dueTime}` : 'Set due time'}
              >
                <Clock className={`w-3 h-3 ${dueTime ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                <span>{dueTime || 'Time'}</span>
              </button>
              {dueTime && (
                <button
                  type="button"
                  onClick={() => setDueTime('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded"
                  title="Clear time"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            {/* Time Picker Popover */}
            {showTimePickerPopover && (
              <div className="absolute left-0 top-full mt-1.5 z-40 p-2.5 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 space-y-2 min-w-[210px] text-xs">
                <div className="flex items-center justify-between text-slate-700 dark:text-slate-200 font-semibold pb-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    Set Due Time
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTimePickerPopover(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    id="input-task-time-popover"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                    autoFocus
                  />
                </div>

                {/* Quick Time Presets */}
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] text-slate-400 font-medium">Quick Presets</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    {[
                      { label: '09:00 Morning', time: '09:00' },
                      { label: '12:00 Noon', time: '12:00' },
                      { label: '15:00 Afternoon', time: '15:00' },
                      { label: '18:00 Evening', time: '18:00' },
                      { label: '20:00 Night', time: '20:00' },
                    ].map((preset) => (
                      <button
                        key={preset.time}
                        type="button"
                        onClick={() => {
                          setDueTime(preset.time);
                          setShowTimePickerPopover(false);
                        }}
                        className={`px-1.5 py-1 rounded-md text-left transition-colors ${
                          dueTime === preset.time
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  {dueTime ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDueTime('');
                        setShowTimePickerPopover(false);
                      }}
                      className="text-[11px] text-rose-500 hover:underline"
                    >
                      Clear Time
                    </button>
                  ) : <span />}
                  <button
                    type="button"
                    onClick={() => setShowTimePickerPopover(false)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-[11px]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Expanded Details Section */}
        {showDetails && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            {/* Description Textarea */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Notes / Description (Optional)</label>
              <textarea
                id="input-task-description"
                placeholder="Add task details, links, or notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                rows={2}
              />
            </div>

            {/* Image Attachment Field */}
            <div className="p-3 bg-slate-50/80 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <Image className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Image Attachment</span>
                </label>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="text-[11px] text-rose-600 hover:underline flex items-center gap-0.5"
                  >
                    <X className="w-3 h-3" />
                    Remove Image
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder="Paste image URL (https://...)"
                  value={imageUrl.startsWith('storage:') ? '' : imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setImagePreview(e.target.value);
                  }}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-lg flex items-center justify-center gap-1 shrink-0 disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Browse
                </button>
              </div>

              {(imagePreview || imageUrl) && (
                <div className="mt-2 relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 max-h-40 bg-black/5 flex items-center justify-center">
                  <img
                    src={imagePreview || imageUrl}
                    alt="Preview"
                    className="max-h-40 object-contain rounded-lg"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Estimated Minutes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Est. Time (Mins)</label>
                <input
                  type="number"
                  placeholder="e.g. 30"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value ? parseInt(e.target.value, 10) : '')}
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  min={1}
                  max={480}
                />
              </div>

              {/* Subtasks Builder */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Subtasks ({subtasks.length})</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Add step..."
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                    className="flex-1 text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubtask}
                    className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition-colors"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Render added subtasks tags */}
            {subtasks.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {subtasks.map((st, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-100 dark:border-blue-900"
                  >
                    <span>• {st}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(idx)}
                      className="hover:text-rose-600 font-bold ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
};
