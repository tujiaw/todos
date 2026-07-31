import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  ClipboardCopy,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import type { WeeklySummaryResult } from '../lib/ai';
import { formatWeekDisplayLabel, type WeeklySummaryPayload } from '../utils/week';
import { getTodayDateString } from '../data/initialData';

interface WeeklySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: WeeklySummaryPayload | null;
  summary: WeeklySummaryResult | null;
  isLoading: boolean;
  error: string | null;
  usedFallback: boolean;
  onGenerate: () => void;
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </h4>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed pl-3 border-l-2 border-indigo-200 dark:border-indigo-800"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const WeeklySummaryModal: React.FC<WeeklySummaryModalProps> = ({
  isOpen,
  onClose,
  payload,
  summary,
  isLoading,
  error,
  usedFallback,
  onGenerate,
}) => {
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setDetailsOpen(false);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = async () => {
    const text = summary?.minutesText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const weekDisplay = payload
    ? formatWeekDisplayLabel(payload.startDate, payload.endDate, {
        preferThisWeek: true,
        today: getTodayDateString(),
      })
    : '';

  const hasDetails =
    Boolean(summary) &&
    ((summary?.completedHighlights.length ?? 0) > 0 ||
      (summary?.unfinishedItems.length ?? 0) > 0 ||
      (summary?.risksOrBlockers.length ?? 0) > 0 ||
      (summary?.nextWeekFocus.length ?? 0) > 0);

  return (
    <AnimatePresence>
      {isOpen && payload && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.button
            type="button"
            aria-label="Close weekly summary"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-summary-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="relative w-full sm:max-w-lg max-h-[88vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-300 mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-semibold tracking-wide">Weekly minutes</span>
                </div>
                <h3
                  id="weekly-summary-title"
                  className="text-base font-bold text-slate-900 dark:text-white leading-snug"
                >
                  {weekDisplay}
                </h3>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {payload.stats.completed}/{payload.stats.total} done ·{' '}
                  {payload.stats.completionRate}% complete
                  {usedFallback ? ' · Local draft' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {isLoading && (
                <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/30 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-200">
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  Polishing with AI… You can copy the draft now.
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-200">
                  {error}
                </div>
              )}

              {payload.stats.total === 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3.5 py-3 text-sm text-slate-600 dark:text-slate-300">
                  No tasks this week yet. Add a few items, then regenerate for a richer report.
                </div>
              )}

              {payload.stats.byCategory.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    By category
                  </h4>
                  <div className="space-y-1.5">
                    {payload.stats.byCategory.map((category) => {
                      const rate =
                        category.total === 0
                          ? 0
                          : Math.round((category.completed / category.total) * 100);
                      return (
                        <div key={category.name} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-slate-600 dark:text-slate-300 truncate">
                              {category.name}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500 shrink-0">
                              {category.completed}/{category.total}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400 transition-all"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {summary && (
                <>
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {summary.overview}
                  </p>

                  {hasDetails && (
                    <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setDetailsOpen((open) => !open)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-[12px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                        aria-expanded={detailsOpen}
                      >
                        <span>Highlights & follow-ups</span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {detailsOpen && (
                        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                          <Section title="Completed" items={summary.completedHighlights} />
                          <Section title="Follow-ups" items={summary.unfinishedItems} />
                          <Section title="Risks" items={summary.risksOrBlockers} />
                          <Section title="Next week" items={summary.nextWeekFocus} />
                        </div>
                      )}
                    </div>
                  )}

                  <section className="space-y-1.5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Meeting notes (Chinese, copy-ready)
                    </h4>
                    <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 font-sans">
                      {summary.minutesText}
                    </pre>
                  </section>
                </>
              )}

              {!summary && !isLoading && (
                <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  No minutes yet. Tap Regenerate to create a report.
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-white/95 dark:bg-slate-900/95">
              <button
                type="button"
                onClick={onGenerate}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!summary?.minutesText}
                className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <ClipboardCopy className="w-3.5 h-3.5" />
                    Copy minutes
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
