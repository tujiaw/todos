import React, { useState } from 'react';
import { X, FolderPlus, Tag, Check, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Category } from '../types';

interface CategorySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onAddCategory: (newCategory: Omit<Category, 'id'>) => void;
  onUpdateCategory: (category: Category) => void;
  onDeleteCategory: (categoryId: string) => void;
  onReorderCategory: (categoryId: string, direction: 'up' | 'down') => void;
}

const PRESET_COLORS = [
  { hex: '#3b82f6', name: 'Blue', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800/50' },
  { hex: '#6366f1', name: 'Indigo', bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800/50' },
  { hex: '#10b981', name: 'Emerald', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800/50' },
  { hex: '#f43f5e', name: 'Rose', bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800/50' },
  { hex: '#f59e0b', name: 'Amber', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800/50' },
  { hex: '#8b5cf6', name: 'Purple', bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800/50' },
  { hex: '#06b6d4', name: 'Cyan', bg: 'bg-cyan-50 dark:bg-cyan-950/40', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800/50' },
  { hex: '#64748b', name: 'Slate', bg: 'bg-slate-100 dark:bg-slate-800/80', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-700' },
];

function colorFromCategory(cat: Category) {
  return PRESET_COLORS.find((item) => item.hex === cat.color) || PRESET_COLORS[0];
}

export const CategorySettingsModal: React.FC<CategorySettingsModalProps> = ({
  isOpen,
  onClose,
  categories,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategory,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);

  if (!isOpen) return null;

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    onAddCategory({
      name: newCatName.trim(),
      color: selectedColor.hex,
      bgClass: selectedColor.bg,
      textClass: selectedColor.text,
      borderClass: selectedColor.border,
    });

    setSuccessMessage(`Created “${newCatName.trim()}”`);
    setNewCatName('');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(colorFromCategory(cat));
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    const existing = categories.find((cat) => cat.id === editingId);
    if (!existing) return;
    onUpdateCategory({
      ...existing,
      name: editName.trim(),
      color: editColor.hex,
      bgClass: editColor.bg,
      textClass: editColor.text,
      borderClass: editColor.border,
    });
    setEditingId(null);
    setSuccessMessage('Category updated');
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col transition-colors my-auto">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Tag className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Category Management</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {successMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-emerald-700 dark:text-emerald-300">
              <Check className="w-3.5 h-3.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Existing Categories ({categories.length})
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              Use the arrows to reorder. The first category is the default.
            </p>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {categories.map((cat, index) => {
                const isFirst = index === 0;
                const isLast = index === categories.length - 1;
                return (
                  <div
                    key={cat.id}
                    className={`rounded-xl border p-2.5 ${cat.bgClass} ${cat.borderClass}`}
                  >
                    {editingId === cat.id ? (
                      <div className="space-y-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color.hex}
                              type="button"
                              onClick={() => setEditColor(color)}
                              className={`w-5 h-5 rounded-full border-2 ${
                                editColor.hex === color.hex ? 'border-slate-800 dark:border-white' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color.hex }}
                              title={color.name}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className={`flex items-center gap-1.5 font-medium min-w-0 ${cat.textClass}`}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="truncate">{cat.name}</span>
                          {(cat.isDefault || isFirst) && (
                            <span className="text-[10px] opacity-70 border border-current px-1 rounded shrink-0">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onReorderCategory(cat.id, 'up')}
                            disabled={isFirst}
                            className="p-1.5 rounded-lg hover:bg-white/70 dark:hover:bg-slate-900/50 disabled:opacity-30 disabled:pointer-events-none"
                            aria-label={`Move ${cat.name} up`}
                            title="Move up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onReorderCategory(cat.id, 'down')}
                            disabled={isLast}
                            className="p-1.5 rounded-lg hover:bg-white/70 dark:hover:bg-slate-900/50 disabled:opacity-30 disabled:pointer-events-none"
                            aria-label={`Move ${cat.name} down`}
                            title="Move down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(cat)}
                            className="p-1.5 rounded-lg hover:bg-white/70 dark:hover:bg-slate-900/50"
                            aria-label={`Edit ${cat.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCategory(cat.id)}
                            className="p-1.5 rounded-lg hover:bg-white/70 dark:hover:bg-slate-900/50 text-rose-600"
                            aria-label={`Delete ${cat.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          <form onSubmit={handleCreateCategory} className="space-y-3">
            <label className="block font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Add New Category</span>
            </label>
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Category name"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-6 h-6 rounded-full border-2 ${
                    selectedColor.hex === color.hex ? 'border-slate-800 dark:border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={!newCatName.trim()}
              className="w-full min-h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold"
            >
              Create category
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
