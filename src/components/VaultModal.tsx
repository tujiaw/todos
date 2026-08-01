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

  const handleCopy = async (field: string, value?: string) => {
    if (!value) return;
    const ok = await copyText(value);
    if (ok) {
      setCopiedField(field);
      showToast('已复制', 'success');
      window.setTimeout(() => setCopiedField(null), 1500);
    } else {
      showToast('复制失败', 'error');
    }
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
        <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            {(view === 'editor' || view === 'importPreview') && (
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setMergePlan(null);
                  setError(null);
                  setView('list');
                }}
                className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/10"
                title="返回"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="p-2 rounded-xl bg-white/70 dark:bg-white/5 text-amber-600 dark:text-amber-400 border border-white/80 dark:border-slate-800 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="vault-title"
                className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight truncate"
              >
                {view === 'importPreview' ? '导入预览' : '保险箱'}
              </h2>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 font-medium truncate">
                零知识加密 · 仅本地解密
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
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
                  className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
                  title="从 Bitwarden 导入"
                  disabled={busy}
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    lockVault();
                    showToast('已锁定', 'info');
                  }}
                  className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
                  title="锁定"
                >
                  <Lock className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="shrink-0 px-4 py-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-100 dark:border-rose-900">
            {error}
          </div>
        )}

        {view === 'gate' && (
          <form onSubmit={handleSetupOrUnlock} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 p-3 text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
                {hasMeta
                  ? '输入主密码以解锁。条目在本地解密，云端仅保存密文。'
                  : '首次使用请设置主密码。主密码不可找回，遗忘后密文无法解密。'}
              </div>
              {hasMeta === null ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <LoaderCircle className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      主密码
                    </span>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="off"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </label>
                  {!hasMeta && (
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        确认主密码
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="off"
                        value={passwordConfirm}
                        onChange={(event) => setPasswordConfirm(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm"
                      />
                    </label>
                  )}
                </>
              )}
            </div>
            {hasMeta !== null && (
              <div className="shrink-0 p-3 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold py-2.5 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
                  {hasMeta ? '解锁' : '设置并解锁'}
                </button>
              </div>
            )}
          </form>
        )}

        {view === 'list' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="shrink-0 p-3 border-b border-slate-200/70 dark:border-slate-800 space-y-2 bg-slate-50/80 dark:bg-slate-950/80">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    touchActivity();
                  }}
                  placeholder="搜索标题、账号、备注…"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm"
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setTypeFilter(type);
                      touchActivity();
                    }}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      typeFilter === type
                        ? 'bg-amber-100 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {type === 'all' ? '全部' : vaultItemTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">暂无条目</div>
              ) : (
                filteredItems.map((item) => {
                  const Icon = typeIcon(item.type);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openEdit(item)}
                      className="w-full text-left px-4 py-3 hover:bg-white/70 dark:hover:bg-slate-900/70 flex items-start gap-3"
                    >
                      <div className="mt-0.5 w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {vaultItemTypeLabel(item.type)}
                          {item.username ? ` · ${item.username}` : ''}
                          {item.folder ? ` · ${item.folder}` : ''}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="shrink-0 p-3 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90">
              <div className="flex flex-wrap gap-1.5">
                {createTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => openCreate(type)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Plus className="w-3 h-3" />
                    {vaultItemTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'editor' && draft && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">类型</span>
                <select
                  value={draft.type}
                  onChange={(event) =>
                    updateDraft({ type: event.target.value as VaultItemType })
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
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

              {draft.type === 'login' && (
                <>
                  <Field
                    label="用户名"
                    value={draft.username || ''}
                    onChange={(value) => updateDraft({ username: value })}
                    onCopy={() => handleCopy('username', draft.username)}
                    copied={copiedField === 'username'}
                  />
                  <SecretField
                    label="密码"
                    value={draft.password || ''}
                    revealed={Boolean(revealSecrets.password)}
                    onToggle={() =>
                      setRevealSecrets((current) => ({
                        ...current,
                        password: !current.password,
                      }))
                    }
                    onChange={(value) => updateDraft({ password: value })}
                    onCopy={() => handleCopy('password', draft.password)}
                    copied={copiedField === 'password'}
                  />
                  <Field
                    label="网址"
                    value={draft.url || ''}
                    onChange={(value) => updateDraft({ url: value })}
                  />
                  <Field
                    label="TOTP"
                    value={draft.totp || ''}
                    onChange={(value) => updateDraft({ totp: value })}
                    onCopy={() => handleCopy('totp', draft.totp)}
                    copied={copiedField === 'totp'}
                  />
                </>
              )}

              {draft.type === 'card' && (
                <>
                  <Field
                    label="持卡人"
                    value={draft.cardholder || ''}
                    onChange={(value) => updateDraft({ cardholder: value })}
                  />
                  <SecretField
                    label="卡号"
                    value={draft.number || ''}
                    revealed={Boolean(revealSecrets.number)}
                    onToggle={() =>
                      setRevealSecrets((current) => ({
                        ...current,
                        number: !current.number,
                      }))
                    }
                    onChange={(value) => updateDraft({ number: value })}
                    onCopy={() => handleCopy('number', draft.number)}
                    copied={copiedField === 'number'}
                  />
                  <div className="grid grid-cols-3 gap-2">
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
                    <SecretField
                      label="CVV"
                      value={draft.cvv || ''}
                      revealed={Boolean(revealSecrets.cvv)}
                      onToggle={() =>
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
                  <Field
                    label="品牌"
                    value={draft.brand || ''}
                    onChange={(value) => updateDraft({ brand: value })}
                  />
                </>
              )}

              {draft.type === 'identity' && (
                <>
                  <Field
                    label="姓名"
                    value={draft.fullName || ''}
                    onChange={(value) => updateDraft({ fullName: value })}
                  />
                  <Field
                    label="证件类型"
                    value={draft.idType || ''}
                    onChange={(value) => updateDraft({ idType: value })}
                  />
                  <SecretField
                    label="证件号"
                    value={draft.idNumber || ''}
                    revealed={Boolean(revealSecrets.idNumber)}
                    onToggle={() =>
                      setRevealSecrets((current) => ({
                        ...current,
                        idNumber: !current.idNumber,
                      }))
                    }
                    onChange={(value) => updateDraft({ idNumber: value })}
                    onCopy={() => handleCopy('idNumber', draft.idNumber)}
                    copied={copiedField === 'idNumber'}
                  />
                </>
              )}

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">备注</span>
                <textarea
                  value={draft.notes || ''}
                  onChange={(event) => updateDraft({ notes: event.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  autoComplete="off"
                />
              </label>

              {(draft.type === 'custom' || (draft.fields && draft.fields.length > 0)) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">自定义字段</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft({
                          fields: [...(draft.fields || []), { label: '', value: '' }],
                        })
                      }
                      className="text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                    >
                      + 添加
                    </button>
                  </div>
                  {(draft.fields || []).map((field, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
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
                        className="p-2 mb-0.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 p-3 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90 flex gap-2">
              {!isNewDraft && (
                <button
                  type="button"
                  onClick={() => void handleDeleteDraft()}
                  disabled={busy}
                  className="px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100"
                >
                  删除
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={busy}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        )}

        {view === 'importPreview' && mergePlan && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="新增" value={mergePlan.adds.length} />
                <Stat label="更新" value={mergePlan.updates.length} />
                <Stat label="跳过" value={mergePlan.skips.length} />
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs overflow-hidden">
                {[...mergePlan.adds, ...mergePlan.updates, ...mergePlan.skips]
                  .slice(0, 80)
                  .map((entry, index) => (
                    <div
                      key={`${entry.action}-${entry.incoming.externalId || index}`}
                      className="px-3 py-2 flex justify-between gap-2"
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
            <div className="shrink-0 p-3 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMergePlan(null);
                  setView('list');
                }}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmImport()}
                disabled={
                  busy || (mergePlan.adds.length === 0 && mergePlan.updates.length === 0)
                }
                className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
                确认合并
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-3">
      <div className="text-lg font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <label className="block space-y-1 min-w-0">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <div className="relative">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm ${
            onCopy ? 'pr-9' : ''
          }`}
          autoComplete="off"
        />
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </label>
  );
}

function SecretField({
  label,
  value,
  revealed,
  onToggle,
  onChange,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  revealed: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <label className="block space-y-1 min-w-0">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <div className="relative">
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm pr-16"
          autoComplete="off"
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <button type="button" onClick={onToggle} className="p-1 text-slate-400">
            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          {onCopy && (
            <button type="button" onClick={onCopy} className="p-1 text-slate-400">
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </label>
  );
}
