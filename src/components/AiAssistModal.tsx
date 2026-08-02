import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  LoaderCircle,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { AiAssistChatMessage, AiAssistSuggestion } from '../utils/aiAssist';
import { useToast } from './Toast';

interface AiAssistModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  suggestions: AiAssistSuggestion[];
  messages: AiAssistChatMessage[];
  isLoading: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onClearMessages: () => void;
}

export const AiAssistModal: React.FC<AiAssistModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onPromptChange,
  suggestions,
  messages,
  isLoading,
  onSubmit,
  onCancel,
  onClearMessages,
}) => {
  const { showToast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    scrollToBottom();
  }, [isOpen, messages, isLoading]);

  useEffect(() => {
    if (!isOpen) {
      setCopiedId(null);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const handleCopy = async (messageId: string, text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
      showToast('Clipboard access was denied. Copy the text manually.', 'error');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isLoading && prompt.trim()) onSubmit();
    }
  };

  const handleSuggestionClick = (suggestion: AiAssistSuggestion) => {
    if (isLoading) return;
    onPromptChange(suggestion.prompt);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden">
      {/* Dim only — no blur, so the page behind stays readable */}
      <div
        className="absolute inset-0 bg-slate-950/25 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assist-title"
        className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] lg:w-[440px] bg-slate-50 dark:bg-slate-950 shadow-2xl border-l border-white/70 dark:border-slate-800 flex flex-col h-full z-10 pt-[env(safe-area-inset-top,0px)] sm:pt-0 transition-transform animate-in slide-in-from-right duration-300 ease-out"
      >
        <div className="px-4 sm:px-5 py-3 flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="ai-assist-title"
                className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight"
              >
                AI Assist
              </h3>
              <p className="text-sm text-indigo-600/80 dark:text-indigo-300/80 font-medium truncate">
                Ask or create tasks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={onClearMessages}
                disabled={isLoading}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
                title="Clear chat"
                aria-label="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close AI Assist"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3"
        >
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-2 py-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/50 dark:to-indigo-950/70 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shadow-inner mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Chat with your todos
              </p>
              <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
                Ask questions or create tasks in natural language. Pick a prompt below or type your
                own.
              </p>
            </div>
          )}

          {messages.map((message) => {
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-br-md bg-indigo-600 text-white px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap shadow-sm">
                    {message.content}
                  </div>
                </div>
              );
            }

            const isError = Boolean(message.error);
            return (
              <div key={message.id} className="flex justify-start">
                <div
                  className={`max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 shadow-sm ${
                    isError
                      ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30'
                      : 'border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900'
                  }`}
                >
                  {message.createdTasks && message.createdTasks.length > 0 && (
                    <ul className="mb-2 space-y-1.5">
                      {message.createdTasks.map((task, index) => (
                        <li
                          key={`${message.id}-task-${index}`}
                          className="rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-950/30 px-2.5 py-1.5"
                        >
                          <div className="text-[13px] font-semibold text-slate-900 dark:text-white">
                            {task.title}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {task.date}
                            {task.dueTime ? ` · ${task.dueTime}` : ''}
                            {` · ${task.category}`}
                            {` · ${task.priority}`}
                            {task.subtasks.length > 0
                              ? ` · ${task.subtasks.length} subtasks`
                              : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {message.content && (
                    <pre
                      className={`whitespace-pre-wrap text-[13px] leading-relaxed font-sans ${
                        isError
                          ? 'text-amber-800 dark:text-amber-200'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {message.content}
                    </pre>
                  )}
                  {!isError && message.content && (
                    <button
                      type="button"
                      onClick={() => void handleCopy(message.id, message.content)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 cursor-pointer"
                    >
                      {copiedId === message.id ? (
                        <>
                          <Check className="w-3 h-3" />
                          Copied
                        </>
                      ) : (
                        <>
                          <ClipboardCopy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/80 dark:bg-indigo-950/30 px-3.5 py-2.5 text-xs text-indigo-700 dark:text-indigo-200">
                <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                Working with your todos…
              </div>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4 space-y-2.5 border-t border-slate-200/70 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/40">
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={isLoading}
                onClick={() => handleSuggestionClick(item)}
                title={item.hint}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-200 dark:hover:border-indigo-800 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative flex items-end gap-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-400 transition-all p-1.5 shadow-sm">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={2000}
              placeholder="Ask or create a task…"
              disabled={isLoading}
              className="min-w-0 flex-1 min-h-[2.5rem] max-h-28 text-base sm:text-[15px] leading-5 px-2.5 py-2 bg-slate-50/80 dark:bg-slate-800/70 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none resize-none disabled:opacity-60"
            />
            {isLoading ? (
              <button
                type="button"
                onClick={onCancel}
                className="h-10 px-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-lg transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Stop"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!prompt.trim()}
                className="h-10 px-3 bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-40 text-white font-bold text-sm rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-indigo-500/20 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                title="Send"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
