import React, { useState } from 'react';
import {
  X,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Database,
  Github,
  LogOut,
  ExternalLink,
  Sparkles,
  CalendarDays,
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import type { Category, Task } from '../types';
import { exportDataAsJSON, importDataFromJSON } from '../utils/storage';
import { getTodayDateString } from '../data/initialData';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData: () => void;
  user: User | null;
  onGitHubLogin: () => void;
  onLogout: () => void;
  onSyncWithSupabase: () => void;
  isSyncing: boolean;
  syncError?: string | null;
  pendingSyncCount?: number;
  onImportData?: (tasks: Task[], categories: Category[]) => void | Promise<void>;
  aiEnabled: boolean;
  onAiEnabledChange: (enabled: boolean) => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
  user,
  onGitHubLogin,
  onLogout,
  onSyncWithSupabase,
  isSyncing,
  syncError = null,
  pendingSyncCount = 0,
  onImportData,
  aiEnabled,
  onAiEnabledChange,
}) => {
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');

  if (!isOpen) return null;

  const handleExport = () => {
    exportDataAsJSON({
      startDate: exportStart || undefined,
      endDate: exportEnd || undefined,
    });
    const range = exportStart || exportEnd
      ? ` (${exportStart || 'earliest'} – ${exportEnd || 'latest'})`
      : '';
    setFeedback({ success: true, message: `Backup exported successfully!${range}` });
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      const result = importDataFromJSON(content);
      setFeedback({ success: result.success, message: result.message });
      if (result.success && result.tasks && result.categories) {
        if (onImportData) {
          await onImportData(result.tasks, result.categories);
        } else {
          onRefreshData();
        }
      }
    };
    reader.readAsText(file);
  };

  let syncStatusLabel = 'Supabase Cloud Connected';
  let syncDotClass = 'bg-emerald-400 animate-pulse';
  if (isSyncing) {
    syncStatusLabel = 'Syncing with Supabase…';
    syncDotClass = 'bg-amber-400 animate-pulse';
  } else if (syncError) {
    syncStatusLabel = 'Sync error — retry recommended';
    syncDotClass = 'bg-rose-400';
  } else if (pendingSyncCount > 0) {
    syncStatusLabel = `Pending ${pendingSyncCount} local change(s)`;
    syncDotClass = 'bg-amber-400';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col transition-colors my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Settings & Data Sync</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
          {/* AI Features */}
          <div className="p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <span className="p-1.5 rounded-lg bg-white dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">AI Features</h4>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Task drafting, dashboard copy, and Week menu AI assists.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={aiEnabled}
              aria-label="Enable all AI features"
              onClick={() => onAiEnabledChange(!aiEnabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                aiEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
              title={aiEnabled ? 'Disable all AI features' : 'Enable AI features'}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                  aiEnabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Supabase Cloud Storage Status Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${syncDotClass}`} />
                <span className="font-bold text-sm truncate">{syncStatusLabel}</span>
              </div>
              <a
                href="https://supabase.com/dashboard/project/cywbnbvverbdjbbpvsid"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 underline underline-offset-2"
              >
                Console <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {syncError && (
              <p className="text-[11px] text-rose-300 leading-relaxed break-words">
                {syncError}
              </p>
            )}

            {/* User State */}
            {user ? (
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={user.user_metadata?.avatar_url || 'https://github.com/github.png'}
                    alt="GitHub Avatar"
                    className="w-8 h-8 rounded-full border border-slate-600 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-bold truncate text-xs text-white">
                      {user.user_metadata?.full_name || user.email || 'GitHub User'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {user.email || 'Authorized via GitHub'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={onSyncWithSupabase}
                    disabled={isSyncing}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium text-[11px] flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>

                  <button
                    onClick={onLogout}
                    className="p-1.5 bg-slate-700/80 hover:bg-rose-900/60 text-slate-300 hover:text-rose-300 rounded-lg transition-colors"
                    title="Log out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Sign in with GitHub to enable real-time Supabase cloud sync and cross-device data persistence.
                </p>
                <button
                  type="button"
                  onClick={onGitHubLogin}
                  className="w-full py-2 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 min-h-[38px] shadow-sm"
                >
                  <Github className="w-4 h-4 fill-slate-900" />
                  <span>Sign in with GitHub for Supabase Sync</span>
                </button>
              </div>
            )}
          </div>

          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                feedback.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/50'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/50'
              }`}
            >
              {feedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Export JSON Section */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-2">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Export Data File (JSON Backup)
            </h4>
            <p className="text-slate-500 dark:text-slate-400 text-[11px]">
              Select a date range to export tasks. Leave empty to export all.
            </p>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={exportStart}
                  onChange={(e) => setExportStart(e.target.value)}
                  className="bg-transparent text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none w-full"
                  placeholder="Start"
                />
              </div>
              <span className="text-slate-300 dark:text-slate-600 text-[11px]">–</span>
              <div className="flex-1 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={exportEnd}
                  onChange={(e) => setExportEnd(e.target.value)}
                  className="bg-transparent text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none w-full"
                  placeholder="End"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              className="w-full py-2 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold rounded-xl border border-blue-200 dark:border-blue-800 transition-colors flex items-center justify-center gap-1.5 min-h-[38px]"
            >
              <Download className="w-3.5 h-3.5" />
              Export Backup (JSON)
            </button>
          </div>

          {/* Import JSON Section */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-2">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Import Data Backup
            </h4>
            <p className="text-slate-500 dark:text-slate-400 text-[11px]">
              Choose a previously exported JSON backup file to restore.
            </p>

            <label className="cursor-pointer py-2.5 px-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-center transition-colors flex items-center justify-center gap-2 min-h-[38px]">
              <Upload className="w-3.5 h-3.5" />
              Choose JSON File
              <input
                type="file"
                accept=".json"
                onChange={handleFileImport}
                className="hidden"
              />
            </label>
          </div>

        </div>
      </div>
    </div>
  );
};
