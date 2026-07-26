import React, { useState } from 'react';
import { X, FolderPlus, Tag, Check, Folder, Sparkles } from 'lucide-react';
import { Category } from '../types';

interface CategorySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onAddCategory: (newCategory: Omit<Category, 'id'>) => void;
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

export const CategorySettingsModal: React.FC<CategorySettingsModalProps> = ({
  isOpen,
  onClose,
  categories,
  onAddCategory,
}) => {
  if (!isOpen) return null;

  const [newCatName, setNewCatName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [successMessage, setSuccessMessage] = useState('');

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

    setSuccessMessage(`Successfully created category "${newCatName.trim()}"`);
    setNewCatName('');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col transition-colors my-auto">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Tag className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Category Management & Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Current Existing Categories */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Existing Task Categories ({categories.length})
            </label>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border ${cat.bgClass} ${cat.textClass} ${cat.borderClass}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span>{cat.name}</span>
                  {cat.isDefault && (
                    <span className="text-[10px] opacity-70 border border-current px-1 rounded">Default</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* Add New Category Form */}
          <form onSubmit={handleCreateCategory} className="space-y-3">
            <label className="block font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Add New Category</span>
            </label>

            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Category Name</label>
              <input
                type="text"
                placeholder="e.g. Learning, Side Projects, Fitness..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                maxLength={20}
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">Select Color</label>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 shrink-0 border border-white dark:border-slate-800 shadow-2xs"
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {selectedColor.hex === c.hex && <Check className="w-4 h-4 text-white stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Success alert message */}
            {successMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{successMessage}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={!newCatName.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition-colors min-h-[38px]"
              >
                Save New Category
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
