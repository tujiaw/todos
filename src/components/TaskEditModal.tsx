import React, { useEffect, useState, useRef } from 'react';
import { X, Calendar, Clock, Flag, Tag, Plus, Trash2, Save, Image as ImageIcon, Upload, Link, Sparkles, LoaderCircle } from 'lucide-react';
import { Category, Priority, Task } from '../types';
import { resolveMediaUrl, uploadTaskImage } from '../lib/supabase';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

interface TaskEditModalProps {
  task: Task | null;
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTask: Task) => void;
  mode?: 'edit' | 'create';
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  task,
  categories,
  isOpen,
  onClose,
  onSave,
  mode = 'edit',
}) => {
  const confirmAction = useConfirm();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [date, setDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>(
    ''
  );
  const [subtasks, setSubtasks] = useState<Task['subtasks']>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !task) return;

    setTitle(task.title);
    setDescription(task.description || '');
    setCategoryId(task.categoryId);
    setPriority(task.priority);
    setDate(task.date);
    setDueTime(task.dueTime || '');
    setEstimatedMinutes(task.estimatedMinutes || '');
    setSubtasks(task.subtasks || []);
    setNewSubtaskTitle('');
    setImageUrl(task.imageUrl || '');
    setShowImageInput(!!task.imageUrl);
    setImagePreview('');
    if (task.imageUrl) {
      void resolveMediaUrl(task.imageUrl).then((url) => {
        setImagePreview(url || task.imageUrl || '');
      });
    }
  }, [isOpen, task]);

  if (!isOpen || !task) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      ...task,
      title: title.trim(),
      description: description.trim() || undefined,
      categoryId,
      priority,
      date,
      dueTime: dueTime || undefined,
      estimatedMinutes: typeof estimatedMinutes === 'number' ? estimatedMinutes : undefined,
      subtasks,
      imageUrl: imageUrl.trim() || undefined,
      updatedAt: Date.now(),
    });

    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片大小不能超过 5 MB', 'error');
      return;
    }
    setIsUploadingImage(true);
    try {
      const storageRef = await uploadTaskImage(file);
      setImageUrl(storageRef);
      const preview = await resolveMediaUrl(storageRef);
      setImagePreview(preview || URL.createObjectURL(file));
    } catch (err) {
      showToast(err instanceof Error ? err.message : '图片上传失败', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      setSubtasks([
        ...subtasks,
        {
          id: `st-${Date.now()}`,
          title: newSubtaskTitle.trim(),
          completed: false,
        },
      ]);
      setNewSubtaskTitle('');
    }
  };

  const handleToggleSubtask = (stId: string) => {
    setSubtasks(
      subtasks.map((st) => (st.id === stId ? { ...st, completed: !st.completed } : st))
    );
  };

  const handleRemoveSubtask = async (stId: string) => {
    const confirmed = await confirmAction({
      title: '删除此子任务？',
      description: '保存任务后将永久删除此子任务。',
      confirmLabel: '删除子任务',
    });
    if (!confirmed) return;
    setSubtasks(subtasks.filter((st) => st.id !== stId));
  };

  const handleRemoveImage = async () => {
    const confirmed = await confirmAction({
      title: '移除此图片？',
      description: '保存任务后将移除此图片附件。',
      confirmLabel: '移除',
    });
    if (!confirmed) return;
    setImageUrl('');
    setImagePreview('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            {mode === 'create' && <Sparkles className="w-4 h-4 text-indigo-500" />}
            {mode === 'create' ? '确认智能生成的任务草稿' : '编辑任务'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              任务标题 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs font-medium p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[40px]"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              rows={2}
              placeholder="添加备注…"
            />
          </div>

          {/* Grid Options */}
          <div className="grid grid-cols-2 gap-3">
            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                分类标签
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 min-h-[38px]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id} className="dark:bg-slate-900">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1">
                <Flag className="w-3.5 h-3.5 text-slate-400" />
                优先级
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 min-h-[38px]"
              >
                <option value="low" className="dark:bg-slate-900">低</option>
                <option value="medium" className="dark:bg-slate-900">中</option>
                <option value="high" className="dark:bg-slate-900">高</option>
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                任务日期
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 min-h-[38px]"
                required
              />
            </div>

            {/* Due Time & Duration */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                截止时间／预计用时
              </label>
              <div className="grid grid-cols-2 gap-1">
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 min-h-[38px]"
                  title="截止时间"
                />
                <input
                  type="number"
                  placeholder="分钟"
                  value={estimatedMinutes}
                  onChange={(e) =>
                    setEstimatedMinutes(e.target.value ? parseInt(e.target.value, 10) : '')
                  }
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 min-h-[38px]"
                  title="时长（分钟）"
                />
              </div>
            </div>
          </div>

          {/* Attached Image Section */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                图片附件
              </label>
              {!showImageInput && (
                <button
                  type="button"
                  onClick={() => setShowImageInput(true)}
                  className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  添加图片
                </button>
              )}
            </div>

            {showImageInput && (
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      placeholder="图片链接…"
                      value={imageUrl.startsWith('storage:') ? '' : imageUrl}
                      onChange={(e) => {
                        setImageUrl(e.target.value);
                        setImagePreview(e.target.value);
                      }}
                      className="w-full text-xs pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 disabled:opacity-50"
                  >
                    {isUploadingImage ? (
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    上传
                  </button>

                  {imageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg"
                      title="移除图片"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {(imagePreview || imageUrl) && (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 max-h-32 bg-slate-100 dark:bg-slate-900">
                    <img
                      src={imagePreview || imageUrl}
                      alt="预览"
                      className="h-28 w-full object-cover"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subtasks Section */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              子任务（{subtasks.length})
            </label>
            <div className="flex gap-1.5 mb-2">
              <input
                type="text"
                placeholder="添加子任务步骤…"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                className="flex-1 text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-colors min-h-[36px]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60"
                >
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={st.completed}
                      onChange={() => handleToggleSubtask(st.id)}
                      className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span
                      className={`text-xs truncate ${
                        st.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {st.title}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemoveSubtask(st.id)}
                    className="text-slate-400 hover:text-rose-600 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-colors min-h-[40px]"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 min-h-[40px]"
            >
              <Save className="w-4 h-4" />
              {mode === 'create' ? '创建任务' : '保存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
