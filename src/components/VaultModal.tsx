import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Lock,
  Shield,
  Plus,
  Search,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  ArrowLeft,
  KeyRound,
  CreditCard,
  IdCard,
  StickyNote,
  SlidersHorizontal,
  Upload,
  LoaderCircle,
  ExternalLink,
  ClipboardCopy,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { VaultCustomField, VaultItemPlain, VaultItemType, VaultMergePlan } from '../types';
import {
  deleteVaultItemFromSupabase,
  decryptVaultItems,
  fetchVaultItemRows,
  fetchVaultMeta,
  initializeVaultMeta,
  unlockVaultWithPassword,
  upsertVaultItemEncrypted,
  upsertVaultItemsBatch,
} from '../lib/supabase';
import {
  buildVaultMergePlan,
  parseBitwardenExport,
  vaultItemTypeLabel,
} from '../utils/bitwardenImport';
import { formatVaultItemForCopy, normalizeVaultUrl } from '../utils/vaultClipboard';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

const AUTO_LOCK_MS = 5 * 60 * 1000;

type VaultView = 'gate' | 'list' | 'editor' | 'importPreview';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  lockToken: number;
}

function emptyDraft(type: VaultItemType = 'login'): VaultItemPlain {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    type,
    title: '',
    fields: type === 'custom' ? [{ label: '', value: '' }] : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function typeIcon(type: VaultItemType) {
  if (type === 'login') return KeyRound;
  if (type === 'card') return CreditCard;
  if (type === 'identity') return IdCard;
  if (type === 'note') return StickyNote;
  return SlidersHorizontal;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export const VaultModal: React.FC<VaultModalProps> = ({ isOpen, onClose, lockToken }) => {
  const confirmAction = useConfirm();
  const { showToast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<number | null>(null);

  const [view, setView] = useState<VaultView>('gate');
  const [hasMeta, setHasMeta] = useState<boolean | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItemPlain[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<VaultItemType | 'all'>('all');
  const [draft, setDraft] = useState<VaultItemPlain | null>(null);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [revealSecrets, setRevealSecrets] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [mergePlan, setMergePlan] = useState<VaultMergePlan | null>(null);

  const lockVault = () => {
    setVaultKey(null);
    setItems([]);
    setDraft(null);
    setMergePlan(null);
    setPassword('');
    setPasswordConfirm('');
    setRevealSecrets({});
    setSearchQuery('');
    setTypeFilter('all');
    setView('gate');
    setError(null);
  };

  const touchActivity = () => {
    if (!vaultKey) return;
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      lockVault();
      showToast('保险箱已自动锁定', 'info');
    }, AUTO_LOCK_MS);
  };

  useEffect(() => {
    if (!isOpen) {
      lockVault();
      setHasMeta(null);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const meta = await fetchVaultMeta();
        if (!cancelled) {
          setHasMeta(Boolean(meta));
          setView('gate');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法加载保险箱');
          setHasMeta(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lock on open/close only
  }, [isOpen]);

  useEffect(() => {
    if (lockToken > 0) lockVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockToken]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (view === 'editor' || view === 'importPreview') {
          setDraft(null);
          setMergePlan(null);
          setView('list');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose, view]);

  useEffect(() => {
    if (!vaultKey) return;
    touchActivity();
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultKey]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((item) => (typeFilter === 'all' ? true : item.type === typeFilter))
      .filter((item) => {
        if (!q) return true;
        const haystack = [
          item.title,
          item.username,
          item.url,
          item.notes,
          item.folder,
          item.fullName,
          item.cardholder,
          ...(item.fields || []).flatMap((field) => [field.label, field.value]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [items, searchQuery, typeFilter]);

  const loadItems = async (key: CryptoKey) => {
    const rows = await fetchVaultItemRows();
    const decrypted = await decryptVaultItems(key, rows);
    setItems(decrypted);
  };

  const handleSetupOrUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('请输入主密码');
      return;
    }
    if (!hasMeta && password !== passwordConfirm) {
      setError('两次输入的主密码不一致');
      return;
    }
    if (!hasMeta && password.length < 8) {
      setError('主密码至少 8 位');
      return;
    }

    setBusy(true);
    try {
      const key = hasMeta
        ? await unlockVaultWithPassword(password)
        : await initializeVaultMeta(password);
      setVaultKey(key);
      await loadItems(key);
      setPassword('');
      setPasswordConfirm('');
      setHasMeta(true);
      setView('list');
      showToast(hasMeta ? '保险箱已解锁' : '主密码已设置', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const openCreate = (type: VaultItemType) => {
    setDraft(emptyDraft(type));
    setIsNewDraft(true);
    setRevealSecrets({});
    setView('editor');
    touchActivity();
  };

  const openEdit = (item: VaultItemPlain) => {
    setDraft({ ...item, fields: item.fields ? item.fields.map((f) => ({ ...f })) : undefined });
    setIsNewDraft(false);
    setRevealSecrets({});
    setView('editor');
    touchActivity();
  };

  const handleSaveDraft = async () => {
    if (!vaultKey || !draft) return;
    if (!draft.title.trim()) {
      setError('请填写标题');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await upsertVaultItemEncrypted(vaultKey, {
        ...draft,
        title: draft.title.trim(),
        updatedAt: Date.now(),
      });
      setItems((current) => {
        const without = current.filter((item) => item.id !== saved.id);
        return [saved, ...without];
      });
      setDraft(null);
      setView('list');
      showToast('已保存', 'success');
      touchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!draft || isNewDraft) return;
    const confirmed = await confirmAction({
      title: '删除这条保险箱记录？',
      description: '删除后无法恢复。',
      confirmLabel: '删除',
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteVaultItemFromSupabase(draft.id);
      setItems((current) => current.filter((item) => item.id !== draft.id));
      setDraft(null);
      setView('list');
      showToast('已删除', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (field: string, value?: string, successText = '已复制') => {
    if (!value) return;
    const ok = await copyText(value);
    if (ok) {
      setCopiedField(field);
      showToast(successText, 'success');
      window.setTimeout(() => setCopiedField(null), 1500);
    } else {
      showToast('复制失败', 'error');
    }
    touchActivity();
  };

  const handleCopyAll = async (item: VaultItemPlain) => {
    const text = formatVaultItemForCopy(item);
    if (!text) {
      showToast('暂无可复制内容', 'info');
      return;
    }
    await handleCopy('all', text, '已复制全部信息');
  };

  const handleOpenUrl = (rawUrl?: string) => {
    const url = normalizeVaultUrl(rawUrl);
    if (!url) {
      showToast('没有可打开的网址', 'info');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    touchActivity();
  };

  const handleImportFile = async (file: File) => {
    if (!vaultKey) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const incoming = parseBitwardenExport(parsed);
      const plan = buildVaultMergePlan(items, incoming);
      setMergePlan(plan);
      setView('importPreview');
      touchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!vaultKey || !mergePlan) return;
    setBusy(true);
    setError(null);
    try {
      const toWrite = [
        ...mergePlan.adds.map((entry) => entry.incoming),
        ...mergePlan.updates.map((entry) => entry.incoming),
      ];
      const result = await upsertVaultItemsBatch(vaultKey, toWrite);
      await loadItems(vaultKey);
      setMergePlan(null);
      setView('list');
      showToast(
        `导入完成：新增 ${mergePlan.adds.length}，更新 ${mergePlan.updates.length}，跳过 ${mergePlan.skips.length}` +
          (result.failed ? `（失败 ${result.failed}）` : ''),
        result.failed ? 'error' : 'success'
      );
      touchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入失败');
    } finally {
      setBusy(false);
    }
  };

  const updateDraft = (patch: Partial<VaultItemPlain>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    touchActivity();
  };

  const updateFieldRow = (index: number, patch: Partial<VaultCustomField>) => {
    setDraft((current) => {
      if (!current) return current;
      const fields = [...(current.fields || [])];
      fields[index] = { ...fields[index], ...patch };
      return { ...current, fields };
    });
    touchActivity();
  };

  if (!isOpen) return null;

  const types: Array<VaultItemType | 'all'> = ['all', 'login', 'card', 'identity', 'note', 'custom'];
  const createTypes: VaultItemType[] = ['login', 'card', 'identity', 'note', 'custom'];

  return (
    <div
      className="fixed inset-0 z-[70] overflow-hidden"
      onMouseDown={touchActivity}
      onKeyDown={touchActivity}
    >
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div
        className="absolute right-0 top-0 bottom-0 w-full sm:w-[360px] bg-slate-50 dark:bg-slate-950 shadow-2xl border-l border-white/70 dark:border-slate-800 flex flex-col h-full z-10 transition-transform animate-in slide-in-from-right duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 h-12 px-3 flex items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/95">
          <div className="flex items-center gap-1.5 min-w-0">
            {(view === 'editor' || view === 'importPreview') && (
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setMergePlan(null);
                  setError(null);
                  setView('list');
                }}
                className="p-1.5 rounded-lg hover:bg-white/70 dark:hover:bg-white/10"
                title="返回"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2
              id="vault-title"
              className="text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate"
            >
              {view === 'importPreview' ? '导入预览' : '保险箱'}
            </h2>
          </div>
          <div className="flex items-center shrink-0">
            {vaultKey && view === 'list' && (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImportFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
                  title="从 Bitwarden 导入"
                  disabled={busy}
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    lockVault();
                    showToast('已锁定', 'info');
                  }}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
                  title="锁定"
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10"
              title="关闭"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="shrink-0 px-3 py-1.5 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-100 dark:border-rose-900">
            {error}
          </div>
        )}

        {view === 'gate' && (
          <form onSubmit={handleSetupOrUnlock} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
              <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-lg px-2.5 py-2">
                {hasMeta
                  ? '输入主密码解锁。内容仅在本地解密。'
                  : '设置主密码后启用。主密码不可找回。'}
              </p>
              {hasMeta === null ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <LoaderCircle className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <FieldGroup>
                  <Field
                    label="主密码"
                    value={password}
                    secret
                    revealed={showPassword}
                    onToggleReveal={() => setShowPassword((value) => !value)}
                    onChange={setPassword}
                  />
                  {!hasMeta && (
                    <Field
                      label="确认主密码"
                      value={passwordConfirm}
                      secret
                      revealed={showPassword}
                      onChange={setPasswordConfirm}
                    />
                  )}
                </FieldGroup>
              )}
            </div>
            {hasMeta !== null && (
              <div className="shrink-0 px-3 py-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[13px] font-semibold py-2 disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {busy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                  {hasMeta ? '解锁' : '设置并解锁'}
                </button>
              </div>
            )}
          </form>
        )}

        {view === 'list' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="shrink-0 px-3 py-2 border-b border-slate-200/70 dark:border-slate-800 space-y-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    touchActivity();
                  }}
                  placeholder="搜索…"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2.5 py-1.5 text-[13px]"
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setTypeFilter(type);
                      touchActivity();
                    }}
                    className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors ${
                      typeFilter === type
                        ? 'bg-amber-100 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {type === 'all' ? '全部' : vaultItemTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-slate-400">暂无条目</div>
              ) : (
                filteredItems.map((item) => {
                  const Icon = typeIcon(item.type);
                  const canOpen = item.type === 'login' && Boolean(item.url?.trim());
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1 border-b border-slate-100/80 dark:border-slate-800/80 hover:bg-white/80 dark:hover:bg-slate-900/70"
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="min-w-0 flex-1 text-left px-3 py-2 flex items-center gap-2.5"
                      >
                        <Icon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-slate-900 dark:text-white truncate leading-tight">
                            {item.title}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                            {vaultItemTypeLabel(item.type)}
                            {item.username ? ` · ${item.username}` : ''}
                            {item.folder ? ` · ${item.folder}` : ''}
                          </div>
                        </div>
                      </button>
                      <div className="shrink-0 pr-2 flex items-center gap-0.5">
                        {canOpen && (
                          <button
                            type="button"
                            title="打开网址"
                            onClick={() => handleOpenUrl(item.url)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="复制全部"
                          onClick={() => void handleCopyAll(item)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        >
                          <ClipboardCopy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="shrink-0 px-3 py-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-slate-400 shrink-0 mr-0.5">新建</span>
                {createTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => openCreate(type)}
                    className="flex-1 min-w-0 inline-flex items-center justify-center gap-0.5 px-1 py-1.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Plus className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{vaultItemTypeLabel(type)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'editor' && draft && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              <FieldGroup>
                <div className="grid grid-cols-[88px_1fr] gap-1.5">
                  <label className="block min-w-0">
                    <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5 leading-tight">
                      类型
                    </span>
                    <select
                      value={draft.type}
                      onChange={(event) =>
                        updateDraft({ type: event.target.value as VaultItemType })
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[13px]"
                      disabled={!isNewDraft}
                    >
                      {createTypes.map((type) => (
                        <option key={type} value={type}>
                          {vaultItemTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="标题"
                    value={draft.title}
                    onChange={(value) => updateDraft({ title: value })}
                  />
                </div>
              </FieldGroup>

              {draft.type === 'login' && (
                <>
                  <FieldGroup title="账号">
                    <Field
                      label="用户名"
                      value={draft.username || ''}
                      onChange={(value) => updateDraft({ username: value })}
                      onCopy={() => handleCopy('username', draft.username)}
                      copied={copiedField === 'username'}
                    />
                    <Field
                      label="密码"
                      value={draft.password || ''}
                      secret
                      revealed={Boolean(revealSecrets.password)}
                      onToggleReveal={() =>
                        setRevealSecrets((current) => ({
                          ...current,
                          password: !current.password,
                        }))
                      }
                      onChange={(value) => updateDraft({ password: value })}
                      onCopy={() => handleCopy('password', draft.password)}
                      copied={copiedField === 'password'}
                    />
                  </FieldGroup>
                  <FieldGroup
                    title="网站"
                    action={
                      draft.url?.trim() ? (
                        <button
                          type="button"
                          onClick={() => handleOpenUrl(draft.url)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                        >
                          <ExternalLink className="w-3 h-3" />
                          打开
                        </button>
                      ) : undefined
                    }
                  >
                    <Field
                      label="网址"
                      value={draft.url || ''}
                      onChange={(value) => updateDraft({ url: value })}
                      onCopy={() => handleCopy('url', draft.url)}
                      copied={copiedField === 'url'}
                    />
                    <Field
                      label="TOTP 密钥"
                      value={draft.totp || ''}
                      onChange={(value) => updateDraft({ totp: value })}
                      onCopy={() => handleCopy('totp', draft.totp)}
                      copied={copiedField === 'totp'}
                    />
                  </FieldGroup>
                </>
              )}

              {draft.type === 'card' && (
                <FieldGroup title="卡片">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Field
                      label="持卡人"
                      value={draft.cardholder || ''}
                      onChange={(value) => updateDraft({ cardholder: value })}
                    />
                    <Field
                      label="品牌"
                      value={draft.brand || ''}
                      onChange={(value) => updateDraft({ brand: value })}
                    />
                  </div>
                  <Field
                    label="卡号"
                    value={draft.number || ''}
                    secret
                    revealed={Boolean(revealSecrets.number)}
                    onToggleReveal={() =>
                      setRevealSecrets((current) => ({
                        ...current,
                        number: !current.number,
                      }))
                    }
                    onChange={(value) => updateDraft({ number: value })}
                    onCopy={() => handleCopy('number', draft.number)}
                    copied={copiedField === 'number'}
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    <Field
                      label="月"
                      value={draft.expMonth || ''}
                      onChange={(value) => updateDraft({ expMonth: value })}
                    />
                    <Field
                      label="年"
                      value={draft.expYear || ''}
                      onChange={(value) => updateDraft({ expYear: value })}
                    />
                    <Field
                      label="CVV"
                      value={draft.cvv || ''}
                      secret
                      revealed={Boolean(revealSecrets.cvv)}
                      onToggleReveal={() =>
                        setRevealSecrets((current) => ({
                          ...current,
                          cvv: !current.cvv,
                        }))
                      }
                      onChange={(value) => updateDraft({ cvv: value })}
                      onCopy={() => handleCopy('cvv', draft.cvv)}
                      copied={copiedField === 'cvv'}
                    />
                  </div>
                </FieldGroup>
              )}

              {draft.type === 'identity' && (
                <FieldGroup title="证件">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Field
                      label="姓名"
                      value={draft.fullName || ''}
                      onChange={(value) => updateDraft({ fullName: value })}
                    />
                    <Field
                      label="类型"
                      value={draft.idType || ''}
                      onChange={(value) => updateDraft({ idType: value })}
                    />
                  </div>
                  <Field
                    label="证件号"
                    value={draft.idNumber || ''}
                    secret
                    revealed={Boolean(revealSecrets.idNumber)}
                    onToggleReveal={() =>
                      setRevealSecrets((current) => ({
                        ...current,
                        idNumber: !current.idNumber,
                      }))
                    }
                    onChange={(value) => updateDraft({ idNumber: value })}
                    onCopy={() => handleCopy('idNumber', draft.idNumber)}
                    copied={copiedField === 'idNumber'}
                  />
                </FieldGroup>
              )}

              <FieldGroup
                title="备注"
                action={
                  draft.type === 'custom' || (draft.fields && draft.fields.length > 0) ? (
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft({
                          fields: [...(draft.fields || []), { label: '', value: '' }],
                        })
                      }
                      className="text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                    >
                      + 字段
                    </button>
                  ) : undefined
                }
              >
                <textarea
                  value={draft.notes || ''}
                  onChange={(event) => updateDraft({ notes: event.target.value })}
                  rows={2}
                  placeholder="备注"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[13px] resize-none"
                  autoComplete="off"
                />
                {(draft.type === 'custom' || (draft.fields && draft.fields.length > 0)) &&
                  (draft.fields || []).map((field, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
                      <Field
                        label="标签"
                        value={field.label}
                        onChange={(value) => updateFieldRow(index, { label: value })}
                      />
                      <Field
                        label="值"
                        value={field.value}
                        onChange={(value) => updateFieldRow(index, { value })}
                        onCopy={() => handleCopy(`field-${index}`, field.value)}
                        copied={copiedField === `field-${index}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft({
                            fields: (draft.fields || []).filter((_, i) => i !== index),
                          })
                        }
                        className="p-1.5 mb-0.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                {draft.type === 'custom' && (!(draft.fields) || draft.fields.length === 0) && (
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft({
                        fields: [{ label: '', value: '' }],
                      })
                    }
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 text-left"
                  >
                    + 添加自定义字段
                  </button>
                )}
              </FieldGroup>
            </div>

            <div className="shrink-0 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90">
              <div className="px-3 pt-2 flex flex-wrap gap-1">
                {draft.type === 'login' && draft.url?.trim() && (
                  <ActionChip
                    icon={ExternalLink}
                    label="打开网址"
                    onClick={() => handleOpenUrl(draft.url)}
                  />
                )}
                {draft.type === 'login' && draft.username?.trim() && (
                  <ActionChip
                    icon={UserRound}
                    label={copiedField === 'username' ? '已复制' : '复制用户名'}
                    onClick={() => void handleCopy('username', draft.username, '已复制用户名')}
                    active={copiedField === 'username'}
                  />
                )}
                {draft.type === 'login' && draft.password?.trim() && (
                  <ActionChip
                    icon={KeyRound}
                    label={copiedField === 'password' ? '已复制' : '复制密码'}
                    onClick={() => void handleCopy('password', draft.password, '已复制密码')}
                    active={copiedField === 'password'}
                  />
                )}
                <ActionChip
                  icon={ClipboardCopy}
                  label={copiedField === 'all' ? '已复制' : '复制全部'}
                  onClick={() => void handleCopyAll(draft)}
                  active={copiedField === 'all'}
                />
              </div>
              <div className="px-3 py-2 flex gap-1.5">
                {!isNewDraft && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteDraft()}
                    disabled={busy}
                    className="px-2.5 py-2 rounded-lg text-[13px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100"
                  >
                    删除
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={busy}
                  className="flex-1 px-3 py-2 rounded-lg text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {busy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'importPreview' && mergePlan && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <Stat label="新增" value={mergePlan.adds.length} />
                <Stat label="更新" value={mergePlan.updates.length} />
                <Stat label="跳过" value={mergePlan.skips.length} />
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-[11px] overflow-hidden">
                {[...mergePlan.adds, ...mergePlan.updates, ...mergePlan.skips]
                  .slice(0, 80)
                  .map((entry, index) => (
                    <div
                      key={`${entry.action}-${entry.incoming.externalId || index}`}
                      className="px-2.5 py-1.5 flex justify-between gap-2"
                    >
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {entry.incoming.title}
                      </span>
                      <span className="shrink-0 text-slate-500">
                        {entry.action === 'add' && '新增'}
                        {entry.action === 'update' && '更新'}
                        {entry.action === 'skip' && '跳过'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="shrink-0 px-3 py-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90 flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMergePlan(null);
                  setView('list');
                }}
                className="flex-1 px-3 py-2 rounded-lg text-[13px] font-semibold bg-slate-100 dark:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmImport()}
                disabled={
                  busy || (mergePlan.adds.length === 0 && mergePlan.updates.length === 0)
                }
                className="flex-1 px-3 py-2 rounded-lg text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {busy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                确认合并
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function FieldGroup({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/40 p-2 space-y-1.5">
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          {title ? (
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function ActionChip({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
        active
          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1.5">
      <div className="text-sm font-bold text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onCopy,
  copied,
  secret,
  revealed,
  onToggleReveal,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCopy?: () => void;
  copied?: boolean;
  secret?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
}) {
  const inputType = secret && !revealed ? 'password' : 'text';
  let rightPad = '';
  if (secret && onCopy) rightPad = 'pr-14';
  else if (secret || onCopy) rightPad = 'pr-8';

  return (
    <label className="block min-w-0">
      <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5 leading-tight">
        {label}
      </span>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[13px] ${rightPad}`}
          autoComplete="off"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
          {secret && onToggleReveal && (
            <button type="button" onClick={onToggleReveal} className="p-1 text-slate-400">
              {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          )}
          {onCopy && (
            <button type="button" onClick={onCopy} className="p-1 text-slate-400 hover:text-slate-600">
              {copied ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </label>
  );
}
