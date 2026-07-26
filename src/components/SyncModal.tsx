import React, { useState } from 'react';
import {
  X,
  HardDriveUpload,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Database,
  Github,
  Code2,
  Copy,
  Check,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { exportDataAsJSON, importDataFromJSON, saveTasks, saveCategories } from '../utils/storage';
import { DEFAULT_CATEGORIES, getSampleTasks, getTodayDateString } from '../data/initialData';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData: () => void;
  user: User | null;
  onGitHubLogin: () => void;
  onLogout: () => void;
  onSyncWithSupabase: () => void;
  isSyncing: boolean;
}

const SQL_SCHEMA_SNIPPET = `-- Copy and run the following SQL script in the Supabase Console SQL Editor:
-- 1. Create todo_categories table
create table if not exists public.todo_categories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  bg_class text not null,
  text_class text not null,
  border_class text not null,
  is_default boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.todo_categories enable row level security;

create policy "Users can view categories" on public.todo_categories
  for select using (auth.uid() = user_id or user_id is null or is_default = true);

create policy "Users can insert categories" on public.todo_categories
  for insert with check (auth.uid() = user_id);

create policy "Users can update categories" on public.todo_categories
  for update using (auth.uid() = user_id);

create policy "Users can delete categories" on public.todo_categories
  for delete using (auth.uid() = user_id);

-- 2. Create todo_tasks table
create table if not exists public.todo_tasks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  date text not null,
  completed boolean default false not null,
  category_id text not null,
  priority text default 'medium' not null,
  due_time text,
  estimated_minutes integer,
  image_url text,
  subtasks jsonb default '[]'::jsonb not null,
  pinned boolean default false not null,
  created_at bigint not null,
  updated_at bigint not null
);

alter table public.todo_tasks enable row level security;

create policy "Users can view own tasks" on public.todo_tasks
  for select using (auth.uid() = user_id);

create policy "Users can insert own tasks" on public.todo_tasks
  for insert with check (auth.uid() = user_id);

create policy "Users can update own tasks" on public.todo_tasks
  for update using (auth.uid() = user_id);

create policy "Users can delete own tasks" on public.todo_tasks
  for delete using (auth.uid() = user_id);

-- 3. Create Edge Drop table
create table if not exists public.drop_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  kind text not null default 'text' check (kind in ('text', 'image')),
  content text,
  file_name text,
  file_path text,
  file_size bigint,
  mime_type text,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + interval '90 days') not null
);

alter table public.drop_items drop constraint if exists drop_items_kind_check;
alter table public.drop_items add constraint drop_items_kind_check
  check (kind in ('text', 'image'));

alter table public.drop_items enable row level security;

drop policy if exists "drop_items_select_own" on public.drop_items;
drop policy if exists "drop_items_insert_own" on public.drop_items;
drop policy if exists "drop_items_delete_own" on public.drop_items;

create policy "drop_items_select_own" on public.drop_items
  for select using (auth.uid() = user_id);

create policy "drop_items_insert_own" on public.drop_items
  for insert with check (
    auth.uid() = user_id
    and expires_at > now()
    and expires_at <= now() + interval '90 days 5 minutes'
  );

create policy "drop_items_delete_own" on public.drop_items
  for delete using (auth.uid() = user_id);

-- 4. Private Storage bucket for Drop attachments (20 MB per object)
insert into storage.buckets (id, name, public, file_size_limit)
values ('drop-files', 'drop-files', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Drop users can read own files" on storage.objects;
drop policy if exists "Drop users can upload own files" on storage.objects;
drop policy if exists "Drop users can delete own files" on storage.objects;

create policy "Drop users can read own files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'drop-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Drop users can upload own files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'drop-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Drop users can delete own files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'drop-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
`;

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
  user,
  onGitHubLogin,
  onLogout,
  onSyncWithSupabase,
  isSyncing,
}) => {
  const [importJsonText, setImportJsonText] = useState('');
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);

  if (!isOpen) return null;

  const handleExport = () => {
    exportDataAsJSON();
    setFeedback({ success: true, message: 'Backup file exported successfully!' });
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importJsonText.trim()) return;

    const result = importDataFromJSON(importJsonText);
    setFeedback(result);
    if (result.success) {
      onRefreshData();
      setImportJsonText('');
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = importDataFromJSON(content);
        setFeedback(result);
        if (result.success) {
          onRefreshData();
        }
      }
    };
    reader.readAsText(file);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_SCHEMA_SNIPPET);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleResetSampleData = () => {
    if (window.confirm('Are you sure you want to restore initial sample data? Existing unsynced data will be overwritten.')) {
      const today = getTodayDateString();
      const sampleTasks = getSampleTasks(today);
      saveTasks(sampleTasks);
      saveCategories(DEFAULT_CATEGORIES);
      onRefreshData();
      setFeedback({ success: true, message: 'Sample data restored successfully!' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col transition-colors my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Supabase Backend & Data Sync</h3>
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
          {/* Supabase Cloud Storage Status Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-sm">Supabase Cloud Connected</span>
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

          {/* Database Table Schema Accordion / Action */}
          <div className="p-3.5 rounded-xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Supabase Database Schema SQL</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowSqlModal(!showSqlModal)}
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showSqlModal ? 'Hide SQL' : 'View / Copy SQL'}
              </button>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Note: When connecting to Supabase for the first time, run this script in the Supabase SQL Editor to create tables and RLS policies.
            </p>

            {showSqlModal && (
              <div className="space-y-2 pt-1">
                <div className="relative">
                  <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-48 border border-slate-800">
                    {SQL_SCHEMA_SNIPPET}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="absolute top-2 right-2 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-[10px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    {copiedSql ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSql ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                </div>
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
              Export all local tasks, subtasks, completion status, and categories into a JSON file.
            </p>
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
            <p className="text-slate-500 dark:text-slate-400 text-[11px]">Choose a JSON backup file or paste JSON data below:</p>

            <div className="flex items-center gap-2">
              <label className="flex-1 cursor-pointer py-2 px-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-center transition-colors truncate min-h-[38px] flex items-center justify-center">
                Choose File...
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            </div>

            {/* Paste JSON manually */}
            <form onSubmit={handleImportSubmit} className="space-y-2 pt-1">
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder="Or paste JSON string here..."
                className="w-full text-[11px] p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none"
                rows={2}
              />
              <button
                type="submit"
                disabled={!importJsonText.trim()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 min-h-[38px]"
              >
                <Upload className="w-3.5 h-3.5" />
                Import JSON Data
              </button>
            </form>
          </div>

          {/* Reset Demo Data */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">Reset to sample environment data?</span>
            <button
              type="button"
              onClick={handleResetSampleData}
              className="px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Restore Sample Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
