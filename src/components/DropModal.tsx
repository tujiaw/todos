import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  X,
  Copy,
  Check,
  Trash2,
  Paperclip,
  ExternalLink,
  Download,
  RefreshCw,
  LoaderCircle,
  Search,
  Database,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import { DropItem } from '../types';
import { useConfirm } from './ConfirmDialog';

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

interface FileVisual {
  Icon: LucideIcon;
  colorClass: string;
}

function getFileVisual(fileName?: string, mimeType?: string): FileVisual {
  const extension = fileName?.split('.').pop()?.toLowerCase() || '';
  const mime = mimeType?.toLowerCase() || '';

  if (mime.startsWith('image/')) {
    return { Icon: FileImage, colorClass: 'text-violet-500' };
  }
  if (mime.startsWith('audio/')) {
    return { Icon: FileAudio, colorClass: 'text-rose-500' };
  }
  if (mime.startsWith('video/')) {
    return { Icon: FileVideoCamera, colorClass: 'text-cyan-500' };
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    ['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(extension)
  ) {
    return { Icon: FileSpreadsheet, colorClass: 'text-emerald-600' };
  }
  if (
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    ['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(extension)
  ) {
    return { Icon: Presentation, colorClass: 'text-orange-500' };
  }
  if (mime === 'application/pdf' || extension === 'pdf') {
    return { Icon: FileText, colorClass: 'text-rose-600' };
  }
  if (
    mime.includes('word') ||
    mime.includes('document') ||
    ['doc', 'docx', 'odt', 'rtf', 'pages', 'txt', 'md'].includes(extension)
  ) {
    return { Icon: FileText, colorClass: 'text-blue-600' };
  }
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(extension)
  ) {
    return { Icon: FileArchive, colorClass: 'text-amber-600' };
  }
  if (
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime.includes('xml') ||
    [
      'js',
      'jsx',
      'ts',
      'tsx',
      'html',
      'css',
      'json',
      'xml',
      'yaml',
      'yml',
      'py',
      'java',
      'c',
      'cpp',
      'h',
      'go',
      'rs',
      'sh',
      'sql',
    ].includes(extension)
  ) {
    return { Icon: FileCode2, colorClass: 'text-purple-600' };
  }

  return { Icon: FileIcon, colorClass: 'text-slate-500' };
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function FileTypeIcon({
  fileName,
  mimeType,
  className = 'w-4 h-4',
}: {
  fileName?: string;
  mimeType?: string;
  className?: string;
}) {
  const { Icon, colorClass } = getFileVisual(fileName, mimeType);
  return <Icon className={`${className} ${colorClass} shrink-0`} />;
}

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
  onAddDropItem: (content: string, attachments: File[]) => Promise<void>;
  onDeleteDropItem: (id: string) => Promise<void>;
  onClearAllDropItems: () => Promise<void>;
  onRefreshDropItems: () => Promise<void>;
  onDismissError: () => void;
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
  isAuthenticated,
  onSignIn,
}) => {
  const confirmAction = useConfirm();
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
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

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, previewImage]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (isLoading || isSubmitting || (!inputText.trim() && attachedFiles.length === 0)) return;

    setIsSubmitting(true);
    try {
      await onAddDropItem(inputText.trim(), attachedFiles);
      setInputText('');
      setAttachedFiles([]);
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

  const attachFiles = (files: File[]) => {
    setAttachmentError(null);
    const validFiles = files.filter((file) => file.size <= MAX_ATTACHMENT_SIZE);
    const oversizedFiles = files.filter((file) => file.size > MAX_ATTACHMENT_SIZE);

    if (validFiles.length > 0) {
      setAttachedFiles((currentFiles) => [...currentFiles, ...validFiles]);
    }
    if (oversizedFiles.length > 0) {
      setAttachmentError(
        `${oversizedFiles.length} file${oversizedFiles.length > 1 ? 's were' : ' was'} skipped. Each attachment must be 20 MB or smaller.`
      );
    }
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
          attachFiles([file]);
          break;
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    attachFiles(files);
    e.target.value = '';
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    if (!isLoading && !isSubmitting && event.dataTransfer.types.includes('Files')) {
      setIsDraggingFiles(true);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (isLoading || isSubmitting) return;

    const files = Array.from(event.dataTransfer.files) as File[];
    if (files.length > 0) {
      attachFiles(files);
    }
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

  const handleDownload = async (item: DropItem) => {
    if (!item.url) return;

    setDownloadingId(item.id);
    setAttachmentError(null);
    try {
      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}.`);
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = item.file_name || 'drop-attachment';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error('Failed to download Drop attachment:', error);
      setAttachmentError('Could not download the attachment. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Delete this Drop item?',
      description: 'The note and its attachment will be permanently deleted.',
      confirmLabel: 'Delete item',
      container: panelRef.current,
    });
    if (!confirmed) return;

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
    const confirmed = await confirmAction({
      title: 'Clear your Drop space?',
      description: 'Every note and attachment in Edge Drop will be permanently deleted.',
      confirmLabel: 'Delete all',
      container: panelRef.current,
    });
    if (!confirmed) return;

    setIsClearing(true);
    try {
      await onClearAllDropItems();
    } catch {
      // The parent displays the database error without clearing the list.
    } finally {
      setIsClearing(false);
    }
  };

  const handleRemoveAttachedFile = async (index: number, fileName?: string) => {
    const confirmed = await confirmAction({
      title: 'Remove this attachment?',
      description: `${fileName || 'This file'} will be removed from the pending Drop.`,
      confirmLabel: 'Remove',
      container: panelRef.current,
    });
    if (!confirmed) return;

    setAttachedFiles((currentFiles) =>
      currentFiles.filter((_, fileIndex) => fileIndex !== index)
    );
    setAttachmentError(null);
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
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Right Floating Drawer Panel */}
      <div
        ref={panelRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="drop-panel absolute right-0 top-0 bottom-0 w-full sm:w-[420px] lg:w-[440px] bg-slate-50 dark:bg-slate-950 shadow-2xl border-l border-white/70 dark:border-slate-800 flex flex-col h-full z-10 transition-transform animate-in slide-in-from-right duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edge-drop-title"
      >
        {isDraggingFiles && (
          <div className="drop-zone-active absolute inset-4 z-50 pointer-events-none rounded-[1.75rem] border-2 border-dashed border-indigo-500 bg-indigo-50/95 dark:bg-indigo-950/95 flex flex-col items-center justify-center text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            <span className="grid place-items-center w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 shadow-lg mb-2">
              <Paperclip className="w-5 h-5" />
            </span>
            Drop files
          </div>
        )}

        {/* Header Bar */}
        <div className="drop-header px-4 sm:px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="drop-logo p-2 rounded-xl bg-white/70 text-indigo-600 border border-white/80">
              <Send className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h3 id="edge-drop-title" className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Edge Drop</h3>
              <span className="drop-status-pill text-[9px] px-2 py-0.5 rounded-full text-indigo-700 dark:text-indigo-200 font-semibold flex items-center gap-1">
                <Database className="w-2.5 h-2.5" />
                Cloud
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefreshDropItems}
              disabled={isLoading}
              className="drop-header-action p-2 text-indigo-500 dark:text-indigo-200 hover:text-indigo-700 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors"
              title="Refresh drop items"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="drop-header-action p-2 text-indigo-500 dark:text-indigo-200 hover:text-indigo-700 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors"
              aria-label="Close Edge Drop"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(error || attachmentError) && (
          <div
            role="alert"
            className="mx-4 sm:mx-5 mt-3 px-3.5 py-3 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-[11px] text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2 shadow-sm"
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
        <div className="drop-toolbar px-4 sm:px-5 py-3 flex items-center justify-between gap-2 text-xs">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full text-xs pl-8 pr-8 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 shadow-sm"
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
              className="text-[11px] text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 px-2.5 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex items-center gap-1.5 shrink-0"
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
          className="drop-feed drop-scrollbar flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-3"
        >
          {isLoading && dropItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs gap-2 py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Syncing...</span>
            </div>
          ) : dropItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs gap-3 py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950/50 dark:to-indigo-950/70 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shadow-inner">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {searchQuery ? 'No matches' : 'Nothing here yet'}
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
                    className="w-full py-2.5 px-3 text-xs text-indigo-600 dark:text-indigo-300 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/70 hover:border-indigo-300 rounded-2xl transition-all flex items-center justify-center gap-2 font-semibold shadow-sm"
                  >
                    {isLoadingMore ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Loading...</span>
                      </>
                    ) : (
                      <span>Load more</span>
                    )}
                  </button>
                </div>
              )}

              {dropItems.map((item) => (
                <div
                  key={item.id}
                  className="drop-item-card bg-white dark:bg-slate-900 border border-slate-200/75 dark:border-slate-800 rounded-2xl p-4 transition-all group relative space-y-3"
                >
                  {/* Meta Row */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                    <span>{formatDate(item.created_at)}</span>
                    <div className="drop-item-actions flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {/* Copy Text Button */}
                      {item.content && (
                        <button
                          type="button"
                          onClick={() => handleCopy(item.id, item.content)}
                          className="px-2 py-1 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
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
                    <div className="text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words font-sans">
                      {isUrl(item.content) ? (
                        <a
                          href={item.content}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 inline-flex break-all font-medium"
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
                        <div className="space-y-1.5">
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
                          {(item.file_name || item.file_size !== undefined) && (
                            <div className="flex items-center gap-1.5 px-1 min-w-0 text-[10px] text-slate-500 dark:text-slate-400">
                              <FileTypeIcon
                                fileName={item.file_name}
                                mimeType={item.mime_type}
                                className="w-3.5 h-3.5"
                              />
                              <span className="truncate">{item.file_name || 'Image'}</span>
                              {item.file_size !== undefined && (
                                <span className="shrink-0">· {formatFileSize(item.file_size)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          disabled={downloadingId === item.id}
                          title={`Download ${item.file_name || 'attachment'}`}
                          className="drop-file-tile w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 transition-colors disabled:cursor-wait disabled:opacity-60"
                        >
                          <div className="flex items-center gap-2 min-w-0 text-left">
                            <FileTypeIcon
                              fileName={item.file_name}
                              mimeType={item.mime_type}
                            />
                            <div className="min-w-0">
                              <span className="block font-semibold text-slate-700 dark:text-slate-200 truncate">
                                {item.file_name || 'Attached File'}
                              </span>
                              {item.file_size !== undefined && (
                                <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                                  {formatFileSize(item.file_size)}
                                </span>
                              )}
                            </div>
                          </div>
                          {downloadingId === item.id ? (
                            <RefreshCw className="w-3.5 h-3.5 text-blue-500 shrink-0 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

            </>
          )}
        </div>

        {/* Input Composer Footer */}
        <div className="drop-composer-wrap px-4 sm:px-5 py-4 space-y-2">
          {!isAuthenticated && (
            <button
              type="button"
              onClick={onSignIn}
              className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
            >
              Sign in to Drop
            </button>
          )}

          {/* Attachment Preview Chip */}
          {attachedFiles.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-1">
              {attachedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileTypeIcon fileName={file.name} mimeType={file.type} />
                    <div className="min-w-0">
                      <span className="block font-medium text-blue-900 dark:text-blue-200 truncate">
                        {file.name || 'Attachment'}
                      </span>
                      <span className="block text-[10px] text-blue-600/70 dark:text-blue-300/70">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachedFile(index, file.name)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={`Remove ${file.name || 'attachment'}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Single-row input composer */}
          <div className="drop-composer relative flex items-center gap-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-400 transition-all p-1.5 shadow-sm">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              disabled={isLoading || isSubmitting}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isSubmitting}
              className="h-9 shrink-0 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              title="Attach file or image"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span className="text-[11px]">Attach</span>
            </button>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isLoading
                  ? 'Syncing...'
                  : 'Drop a note or paste an image...'
              }
              disabled={isLoading}
              rows={1}
              className="min-w-0 flex-1 h-9 text-[13px] leading-5 px-2 py-2 bg-slate-50/80 dark:bg-slate-800/70 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none resize-none disabled:cursor-not-allowed disabled:opacity-60"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={
                !isAuthenticated ||
                isLoading ||
                isSubmitting ||
                (!inputText.trim() && attachedFiles.length === 0)
              }
              className="h-9 px-3 bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 disabled:opacity-40 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-indigo-500/20 shrink-0"
              title={isAuthenticated ? 'Send drop note' : 'Sign in before sending'}
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
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
