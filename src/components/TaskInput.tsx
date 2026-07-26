import React, { useState, useRef } from 'react';
import { Plus, Clock, Flag, Tag, ChevronDown, ListPlus, Image, X, Upload } from 'lucide-react';
import { Category, Priority, Task } from '../types';

interface TaskInputProps {
  categories: Category[];
  selectedDate: string;
  onAddTask: (newTask: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const TaskInput: React.FC<TaskInputProps> = ({
  categories,
  selectedDate,
  onAddTask,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id || 'work');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueTime, setDueTime] = useState<string>('18:00');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size cannot exceed 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImageUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddTask({
      title: title.trim(),
      description: description.trim() || undefined,
      date: selectedDate,
      completed: false,
      categoryId: categoryId || categories[0]?.id || 'work',
      priority,
      dueTime: dueTime || '18:00',
      estimatedMinutes: typeof estimatedMinutes === 'number' ? estimatedMinutes : undefined,
      imageUrl: imageUrl.trim() || undefined,
      pinned: false,
      subtasks: subtasks.map((st, idx) => ({
        id: `st-new-${Date.now()}-${idx}`,
        title: st,
        completed: false,
      })),
    });

    // Reset form
    setTitle('');
    setDescription('');
    setDueTime('18:00');
    setEstimatedMinutes('');
    setImageUrl('');
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

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  return (
    <div id="task-input-card" className="py-2.5 px-3 sm:px-4 bg-slate-50/70 dark:bg-slate-900/40 rounded-xl border-b border-slate-200/70 dark:border-slate-800 transition-colors focus-within:bg-slate-100/60 dark:focus-within:bg-slate-900/80">
      <form onSubmit={handleSubmit}>
        {/* Main Title Input Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              id="input-task-title"
              placeholder="Add a new task..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-base sm:text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 bg-transparent px-2 py-2 focus:outline-none"
              maxLength={100}
              required
            />
          </div>

          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0 min-h-[32px] active:scale-95 ${
              showDetails ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Toggle detail options"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
            <span className="hidden sm:inline">More</span>
          </button>

          <button
            type="submit"
            id="btn-add-task-submit"
            disabled={!title.trim()}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-2xs transition-all flex items-center gap-1 shrink-0 min-h-[32px] active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </div>

        {/* Quick Options Row - Clean & Compact */}
        <div className="flex flex-wrap items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-100/80 dark:border-slate-800/80">
          {/* Category Selector */}
          <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-1.5 py-0.5 transition-colors">
            <Tag className="w-3 h-3 text-slate-400" />
            <select
              id="select-task-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="bg-transparent text-slate-700 dark:text-slate-200 font-medium focus:outline-none cursor-pointer text-[11px]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="dark:bg-slate-900 dark:text-slate-100">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Selector */}
          <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-1.5 py-0.5 transition-colors">
            <Flag
              className={`w-3 h-3 ${
                priority === 'high'
                  ? 'text-rose-500 fill-rose-500'
                  : priority === 'medium'
                  ? 'text-amber-500 fill-amber-500'
                  : 'text-slate-400'
              }`}
            />
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

          {/* Due Time Selector */}
          <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-1.5 py-0.5 transition-colors">
            <Clock className="w-3 h-3 text-slate-400" />
            <input
              type="time"
              id="input-task-time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="bg-transparent text-slate-700 dark:text-slate-200 font-medium focus:outline-none cursor-pointer text-[11px]"
              title="Set due time"
            />
          </div>

          {/* Image Attachment Trigger */}
          <button
            type="button"
            onClick={() => {
              setShowDetails(true);
              setShowImageInput(!showImageInput);
            }}
            className={`flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5 transition-colors ${
              imageUrl
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-semibold'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Image className="w-3 h-3" />
            <span>{imageUrl ? 'Image Attached' : 'Attach Image'}</span>
          </button>
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
            {(showImageInput || imageUrl) && (
              <div className="p-3 bg-slate-50/80 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                    <Image className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Image Attachment</span>
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
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
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
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
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-lg flex items-center justify-center gap-1 shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Browse
                  </button>
                </div>

                {imageUrl && (
                  <div className="mt-2 relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 max-h-40 bg-black/5 flex items-center justify-center">
                    <img src={imageUrl} alt="Preview" className="max-h-40 object-contain rounded-lg" />
                  </div>
                )}
              </div>
            )}

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
