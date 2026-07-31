import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Flame,
  Sun,
  Moon,
  MoreVertical,
  X,
  Github,
  LogOut,
  Database,
  Tag,
  Download,
  Smartphone,
  WifiOff,
  Send,
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { getTodayDateString } from '../data/initialData';
import { ThemeMode } from '../types';

interface HeaderProps {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  completedStreak: number;
  onOpenSyncModal: () => void;
  onOpenCategoryModal: () => void;
  onOpenDropModal: () => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  user: User | null;
  onGitHubLogin: () => void;
  onLogout: () => void;
  isInstallable?: boolean;
  isInstalled?: boolean;
  installPWA?: () => void;
  isOffline?: boolean;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(dateStr: string, todayStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return { full: dateStr, short: dateStr };

  const todayDate = new Date(todayStr + 'T00:00:00');
  const diffDays = Math.round((d.getTime() - todayDate.getTime()) / (1000 * 3600 * 24));
  const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (diffDays === 0) {
    return {
      full: `${formatted} (Today)`,
      short: `Today (${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
    };
  }

  if (diffDays === -1) return { full: `${formatted} (Yesterday)`, short: `Yesterday` };
  if (diffDays === 1) return { full: `${formatted} (Tomorrow)`, short: `Tomorrow` };

  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  return {
    full: `${dayName}, ${formatted}`,
    short: `${dayName}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  };
}

interface DateNavigatorProps {
  selectedDate: string;
  todayStr: string;
  compact?: boolean;
  onSelectDate: (date: string) => void;
}

const DateNavigator: React.FC<DateNavigatorProps> = ({
  selectedDate,
  todayStr,
  compact = false,
  onSelectDate,
}) => {
  const isToday = selectedDate === todayStr;
  const formattedDate = formatDateDisplay(selectedDate, todayStr);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handleScroll = () => setOpen(false);

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open]);

  const selectAndClose = (date: string) => {
    onSelectDate(date);
    setOpen(false);
  };

  const navBtnClass = compact
    ? 'p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all min-h-[30px] min-w-[30px] flex items-center justify-center'
    : 'p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all min-h-[32px] min-w-[32px] flex items-center justify-center';

  const dateBtnClass = compact
    ? 'flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer min-h-[30px]'
    : 'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer min-h-[32px]';

  const todayBtnClass = compact
    ? 'ml-1 px-2 py-0.5 text-xs font-medium bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/80 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors flex items-center gap-1 min-h-[30px]'
    : 'ml-1 px-2 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/80 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors flex items-center gap-1 min-h-[32px]';

  return (
    <div
      ref={rootRef}
      className={`relative flex items-center gap-1 bg-slate-100/80 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200/70 dark:border-slate-800 ${
        compact ? 'justify-between w-full mt-2' : 'justify-center'
      }`}
    >
      <button
        type="button"
        id={compact ? 'btn-prev-day-mobile' : 'btn-prev-day-desktop'}
        onClick={() => onSelectDate(shiftDate(selectedDate, -1))}
        className={navBtnClass}
        title="Previous Day"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${dateBtnClass} ${open ? 'bg-white dark:bg-slate-700' : ''}`}
        title="Click to select date"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>{compact ? formattedDate.short : formattedDate.full}</span>
      </button>

      <button
        type="button"
        id={compact ? 'btn-next-day-mobile' : 'btn-next-day-desktop'}
        onClick={() => onSelectDate(shiftDate(selectedDate, 1))}
        className={navBtnClass}
        title="Next Day"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {!isToday && (
        <button
          type="button"
          onClick={() => onSelectDate(todayStr)}
          className={todayBtnClass}
          title="Return to Today"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Today</span>
        </button>
      )}

      {open && (
        <div
          className={`absolute top-full z-50 mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-3 space-y-3 ${
            compact ? 'left-0 right-0 mx-auto' : 'left-1/2 -translate-x-1/2'
          }`}
          role="dialog"
          aria-label="Select date"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Select Date</span>
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) selectAndClose(e.target.value);
            }}
            className="w-full text-sm p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectAndClose(todayStr)}
              className="py-1.5 px-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 text-xs font-semibold rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => selectAndClose(shiftDate(todayStr, 1))}
              className="py-1.5 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Tomorrow
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({
  selectedDate,
  setSelectedDate,
  completedStreak,
  onOpenSyncModal,
  onOpenCategoryModal,
  onOpenDropModal,
  themeMode,
  onToggleTheme,
  user,
  onGitHubLogin,
  onLogout,
  isInstallable,
  isInstalled,
  installPWA,
  isOffline,
}) => {
  const todayStr = getTodayDateString();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPwaGuideModal, setShowPwaGuideModal] = useState(false);

  useEffect(() => {
    if (!showMoreMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    const handleScroll = () => setShowMoreMenu(false);

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [showMoreMenu]);

  return (
    <>
      <header id="app-header" className="bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-white/70 dark:border-slate-800/80 sticky top-0 z-30 transition-colors">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-700 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-none whitespace-nowrap">
                Daily <span className="text-indigo-600 dark:text-indigo-400">TODOs</span>
              </h1>
            </div>

            <div className="hidden sm:block">
              <DateNavigator
                selectedDate={selectedDate}
                todayStr={todayStr}
                onSelectDate={setSelectedDate}
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {user ? (
                <button
                  onClick={onOpenSyncModal}
                  className="flex items-center gap-1.5 p-1 sm:pr-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors min-h-[34px]"
                  title="Connected to Supabase. Click to manage sync."
                >
                  <img
                    src={user.user_metadata?.avatar_url || 'https://github.com/github.png'}
                    alt="GitHub Profile"
                    className="w-5 h-5 rounded-lg object-cover"
                  />
                  <span className="hidden sm:inline text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[90px]">
                    {user.user_metadata?.full_name?.split(' ')[0] || 'GitHub'}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                </button>
              ) : (
                <button
                  onClick={onGitHubLogin}
                  className="px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs min-h-[34px]"
                  title="Sign in with GitHub to sync tasks via Supabase"
                >
                  <Github className="w-3.5 h-3.5 fill-white" />
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              )}

              <button
                id="btn-drop-toggle"
                onClick={onOpenDropModal}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors min-h-[34px] min-w-[34px] flex items-center justify-center relative"
                title="Edge Drop (Notes & Files)"
              >
                <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </button>

              <button
                id="btn-theme-toggle"
                onClick={onToggleTheme}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors min-h-[34px] min-w-[34px] flex items-center justify-center"
                title={themeMode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              >
                {themeMode === 'light' ? (
                  <Moon className="w-4 h-4 text-slate-700" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-400" />
                )}
              </button>

              <div ref={menuRef} className="relative">
                <button
                  id="btn-more-menu-toggle"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors min-h-[34px] min-w-[34px] flex items-center justify-center"
                  title="More Options & Settings"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showMoreMenu && (
                  <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 py-1.5 z-40 space-y-0.5">
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        onOpenDropModal();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5 text-blue-500" />
                      <span>Drop (Notes & Files)</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        onOpenCategoryModal();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Tag className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Manage Categories</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        onOpenSyncModal();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Database className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Supabase Sync & Settings</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        if (isInstallable && installPWA) {
                          installPWA();
                        } else {
                          setShowPwaGuideModal(true);
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-2">
                        <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Install App (PWA)</span>
                      </div>
                      {isInstalled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold">
                          Installed
                        </span>
                      )}
                    </button>

                    {user && (
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          onLogout();
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 mt-1 pt-2"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    )}

                    {completedStreak > 0 && (
                      <div className="px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/30 flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>{completedStreak} Day Streak!</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="sm:hidden">
            <DateNavigator
              selectedDate={selectedDate}
              todayStr={todayStr}
              compact
              onSelectDate={setSelectedDate}
            />
          </div>
        </div>

        {isOffline && (
          <div className="bg-amber-500/10 dark:bg-amber-500/20 border-t border-b border-amber-500/20 px-3 py-1.5 text-center text-xs text-amber-700 dark:text-amber-300 flex items-center justify-center gap-2 font-medium">
            <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Offline Mode: Tasks are stored locally and will sync when reconnected.</span>
          </div>
        )}
      </header>

      {showPwaGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Install Daily TODOs</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Standalone app with offline & native experience</p>
                </div>
              </div>
              <button
                onClick={() => setShowPwaGuideModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isInstalled ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>App is already installed and running standalone!</span>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                {isInstallable && installPWA && (
                  <button
                    onClick={() => {
                      setShowPwaGuideModal(false);
                      installPWA();
                    }}
                    className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Install App Now</span>
                  </button>
                )}

                <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <p className="font-bold text-slate-800 dark:text-slate-200">📱 iPhone / iPad (Safari):</p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    <li>Tap the <span className="font-semibold text-slate-700 dark:text-slate-200">"Share"</span> button at the bottom</li>
                    <li>Scroll down the options list</li>
                    <li>Tap <span className="font-semibold text-blue-600 dark:text-blue-400">"Add to Home Screen"</span></li>
                  </ol>
                </div>

                <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <p className="font-bold text-slate-800 dark:text-slate-200">💻 Desktop (Chrome / Edge / Safari):</p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    <li>Click the <span className="font-semibold text-slate-700 dark:text-slate-200">"Install"</span> icon in the address bar</li>
                    <li>Or open browser menu -&gt; <span className="font-semibold text-blue-600 dark:text-blue-400">"Save and share" -&gt; "Install as app"</span></li>
                  </ol>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowPwaGuideModal(false)}
              className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
