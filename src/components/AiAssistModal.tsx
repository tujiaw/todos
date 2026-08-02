import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ClipboardCopy,
  LoaderCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type { AiAssistResult, AiAssistSuggestion } from '../utils/aiAssist';
import { useToast } from './Toast';

interface AiAssistModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  suggestions: AiAssistSuggestion[];
  result: AiAssistResult | null;
  isLoading: boolean;
  error: string | null;
  onSubmit: () => void;
}

export const AiAssistModal: React.FC<AiAssistModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onPromptChange,
  suggestions,
  result,
  isLoading,
  error,
  onSubmit,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
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
    const text = result?.answer;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      showToast('Clipboard access was denied. Copy the text manually.', 'error');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isLoading && prompt.trim()) onSubmit();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.button
            type="button"
            aria-label="Close AI assist"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-assist-title"
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
                  <span className="text-[11px] font-semibold tracking-wide">AI Assist</span>
                </div>
                <h3
                  id="ai-assist-title"
                  className="text-base font-bold text-slate-900 dark:text-white leading-snug"
                >
                  Ask about your todos
                </h3>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Describe what you need in natural language
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="space-y-2">
                <textarea
                  ref={inputRef}
                  value={prompt}
                  onChange={(event) => onPromptChange(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  maxLength={2000}
                  placeholder='e.g. Summarize this week’s work items'
                  disabled={isLoading}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 resize-none disabled:opacity-60"
                />
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => onPromptChange(item.prompt)}
                      title={item.hint}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading && (
                <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/30 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-200">
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  Querying todos and drafting a reply…
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-200">
                  {error}
                </div>
              )}

              {result?.answer && (
                <section className="space-y-1.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Answer
                  </h4>
                  <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 font-sans">
                    {result.answer}
                  </pre>
                </section>
              )}

              {!result && !isLoading && !error && (
                <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Tip: mention time and category, e.g. “this week” + “work”.
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-white/95 dark:bg-slate-900/95">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!result?.answer}
                className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <ClipboardCopy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isLoading || !prompt.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    Working…
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Ask
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
