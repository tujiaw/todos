import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  X,
  Copy,
  Check,
  Trash2,
  Image as ImageIcon,
  Paperclip,
  ExternalLink,
  Download,
  PlusCircle,
  RefreshCw,
  Search,
  Database,
  FileText,
  Sparkles,
} from 'lucide-react';
import { DropItem } from '../types';

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

interface DropModalProps {
  isOpen: boolean;
  onClose: () => void;
  dropItems: DropItem[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onLoadMore: () => void;
  onAddDropItem: (content: string, attachment?: File) => Promise<void>;
  onDeleteDropItem: (id: string) => Promise<void>;
  onClearAllDropItems: () => Promise<void>;
  onRefreshDropItems: () => Promise<void>;
  onDismissError: () => void;
  onConvertToTask: (content: string, imageUrl?: string) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

export const DropModal: React.FC<DropModalProps> = ({
  isOpen,
  onClose,
  dropItems,
  hasMore,
  isLoading,
  isLoadingMore,
  error,
  searchQuery,
  onSearchChange,
  onLoadMore,
  onAddDropItem,
  onDeleteDropItem,
  onClearAllDropItems,
  onRefreshDropItems,
  onDismissError,
  onConvertToTask,
  isAuthenticated,
  onSignIn,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [convertedId, setConvertedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const lastNewestItemIdRef = useRef<string | null>(null);
  const newestItemId = dropItems.length > 0 ? dropItems[dropItems.length - 1].id : null;

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    const isOpening = !wasOpenRef.current;
    const hasNewLatestItem =
      newestItemId !== null && newestItemId !== lastNewestItemIdRef.current;
    wasOpenRef.current = true;
    lastNewestItemIdRef.current = newestItemId;

    if (!isOpening && !hasNewLatestItem) return;

    const frame = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: isOpening ? 'auto' : 'smooth',
        });
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, newestItemId]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!inputText.trim() && !attachedFile) return;

    setIsSubmitting(true);
    try {
      await onAddDropItem(inputText.trim(), attachedFile || undefined);
      setInputText('');
      setAttachedFile(null);
    } catch (err) {
      console.error('Failed to add drop item:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = e.currentTarget;
    // Older records are prepended, so fetch them when approaching the top.
    if (scrollTop < 100 && hasMore && !isLoadingMore && !isLoading) {
      onLoadMore();
    }
  };

  const attachFile = (file: File) => {
    setAttachmentError(null);
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachmentError('Attachments must be 20 MB or smaller.');
      return;
    }
    setAttachedFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          attachFile(file);
          break;
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    attachFile(file);
    e.target.value = '';
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setAttachmentError('Clipboard access was denied. Please copy the text manually.');
    }
  };

  const handleConvert = (item: DropItem) => {
    onConvertToTask(item.content, item.url);
    setConvertedId(item.id);
    setTimeout(() => setConvertedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteDropItem(id);
    } catch {
      // The parent displays the database error without removing the item.
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearConfirm = async () => {
    if (window.confirm('Are you sure you want to clear all drop items?')) {
      setIsClearing(true);
      try {
        await onClearAllDropItems();
      } catch {
        // The parent displays the database error without clearing the list.
      } finally {
        setIsClearing(false);
      }
    }
  };

  const isUrl = (str: string) => {
    return str.startsWith('http://') || str.startsWith('https://');
  };

  const formatDate = (raw: string | number) => {
    try {
      const date = new Date(raw);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Right Floating Drawer Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] md:w-[460px] bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col h-full z-10 transition-transform animate-in slide-in-from-right duration-300 ease-out">
        {/* Header Bar */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edge Drop</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                  <Database className="w-2.5 h-2.5" />
                  Drop Space
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Cross-device notes & file transfer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefreshDropItems}
              disabled={isLoading}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh drop items"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(error || attachmentError) && (
          <div
            role="alert"
            className="mx-3 mt-2 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-[11px] text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2"
          >
            <span>{error || attachmentError}</span>
            <button
              type="button"
              onClick={() => {
                onDismissError();
                setAttachmentError(null);
              }}
              className="shrink-0 p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900"
              aria-label="Dismiss error"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Search Bar & Actions Bar */}
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 text-xs">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full text-xs pl-7 pr-7 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {dropItems.length > 0 && (
            <button
              type="button"
              onClick={handleClearConfirm}
              disabled={isClearing}
              className="text-[11px] text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex items-center gap-1 shrink-0"
              title="Clear all records"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {/* Feed Items Container with Scroll Detection */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="drop-scrollbar flex-1 overflow-y-auto p-4 space-y-3 bg-slate-100/50 dark:bg-slate-950/40"
        >
          {isLoading && dropItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs gap-2 py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Syncing Drop records...</span>
            </div>
          ) : dropItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs gap-3 py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center shadow-inner">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {searchQuery ? 'No matching notes found' : 'No notes dropped yet'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Type a note or paste an image below to sync across devices
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Older pages are loaded above the current conversation. */}
              {hasMore && (
                <div className="pt-1 pb-2 text-center">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    className="w-full py-2 px-3 text-xs text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl transition-all flex items-center justify-center gap-2 font-medium"
                  >
                    {isLoadingMore ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Loading older items...</span>
                      </>
                    ) : (
                      <span>Load older items (50 items/page)</span>
                    )}
                  </button>
                </div>
              )}

              {dropItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3 shadow-2xs hover:shadow-sm transition-all group relative space-y-2"
                >
                  {/* Meta Row */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-blue-500" />
                      {formatDate(item.created_at)}
                    </span>
                    <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                      {/* Copy Text Button */}
                      {item.content && (
                        <button
                          type="button"
                          onClick={() => handleCopy(item.id, item.content)}
                          className="px-1.5 py-0.5 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                          title="Copy content"
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500 font-semibold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Convert to Task Button */}
                      <button
                        type="button"
                        onClick={() => handleConvert(item)}
                        className="px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 font-medium transition-colors flex items-center gap-1"
                        title="Convert this item into a Todo Task"
                      >
                        {convertedId === item.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500 font-semibold">Added Task</span>
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3 h-3" />
                            <span>+ Task</span>
                          </>
                        )}
                      </button>

                      {/* Delete Item Button */}
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Delete drop item"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Main Content Body */}
                  {item.content && (
                    <div className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap break-words font-sans">
                      {isUrl(item.content) ? (
                        <a
                          href={item.content}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 flex items-center gap-1 inline-flex break-all"
                        >
                          <span>{item.content}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        item.content
                      )}
                    </div>
                  )}

                  {/* Attachment / Image Preview */}
                  {item.url && (
                    <div className="pt-1">
                      {item.type === 'image' ? (
                        <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900/5 dark:bg-slate-900/40 max-h-56 group/img">
                          <img
                            src={item.url}
                            alt={item.file_name || 'Drop attachment'}
                            className="w-full h-full object-contain max-h-56 rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => setPreviewImage(item.url || null)}
                            onLoad={() => {
                              if (item.id === newestItemId) {
                                const container = scrollContainerRef.current;
                                container?.scrollTo({ top: container.scrollHeight });
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <a
                          href={item.url}
                          download={item.file_name || 'drop-attachment'}
                          title={`Download ${item.file_name || 'attachment'}`}
                          className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs hover:bg-slate-100 transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Paperclip className="w-4 h-4 text-blue-500 shrink-0" />
                            <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                              {item.file_name || 'Attached File'}
                            </span>
                          </div>
                          <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}

            </>
          )}
        </div>

        {/* Input Composer Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
          {!isAuthenticated && (
            <button
              type="button"
              onClick={onSignIn}
              className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
            >
              Sign in with GitHub to use Drop
            </button>
          )}

          {/* Attachment Preview Chip */}
          {attachedFile && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-xs">
              <div className="flex items-center gap-2 truncate">
                {attachedFile.type.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
                )}
                <span className="font-medium text-blue-900 dark:text-blue-200 truncate">
                  {attachedFile.name || 'Attachment'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachedFile(null);
                  setAttachmentError(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Input Box with Integrated Send Button */}
          <div className="relative bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all p-1.5">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type a note or paste an image (Enter to send)..."
              rows={2}
              className="w-full text-xs px-2 pt-1 pb-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none resize-none min-h-[44px]"
            />

            <div className="flex items-center justify-between px-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  title="Attach file or image"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attach</span>
                </button>

                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  Supports pasting images
                </span>
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={!isAuthenticated || isSubmitting || (!inputText.trim() && !attachedFile)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-2xs shrink-0"
                title={isAuthenticated ? 'Send drop note' : 'Sign in before sending'}
              >
                <span>Send</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Image Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-2xl" />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-full hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
