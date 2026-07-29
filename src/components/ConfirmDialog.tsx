import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type ConfirmHandler = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmHandler | null>(null);

function ConfirmDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl animate-in zoom-in-95 duration-150 dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start gap-3.5 p-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="confirm-dialog-title"
              className="text-base font-bold tracking-tight text-slate-950 dark:text-white"
            >
              {options.title}
            </h2>
            <p
              id="confirm-dialog-description"
              className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
            >
              {options.description}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close confirmation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {options.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white shadow-lg shadow-rose-500/20 transition-colors hover:bg-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {options.confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmHandler>((nextOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setOptions(nextOptions);
    });
  }, []);

  const finish = useCallback((result: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(result);
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <ConfirmDialog
          options={options}
          onCancel={() => finish(false)}
          onConfirm={() => finish(true)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within ConfirmProvider');
  return confirm;
}
