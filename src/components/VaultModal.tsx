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
  ChevronDown,
  Download,
  EllipsisVertical,
  KeySquare,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import type { VaultCustomField, VaultItemPlain, VaultItemType, VaultMergePlan } from '../types';
import {
  deleteVaultItemFromSupabase,
  decryptVaultItems,
  fetchVaultItemRows,
  fetchVaultMeta,
  initializeVaultMeta,
  rotateVaultMasterPassword,
  unlockVaultWithPassword,
  upsertVaultItemEncrypted,
  upsertVaultItemsBatch,
} from '../lib/supabase';
import { verifyMasterPassword } from '../lib/vaultCrypto';
import { generateTotpCode, parseTotpInput, totpRemainingSeconds } from '../utils/totp';
import {
  buildVaultMergePlan,
  parseBitwardenExport,
  vaultItemTypeLabel,
} from '../utils/bitwardenImport';
import { formatVaultItemForCopy, normalizeVaultUrl } from '../utils/vaultClipboard';
import {
  clearVaultSession,
  getVaultSession,
  getVaultSessionRemainingMs,
  loadPreferredVaultTtlMs,
  restoreVaultSession,
  savePreferredVaultTtlMs,
  setVaultSession,
  touchVaultSession,
  VAULT_TTL_OPTIONS,
} from '../lib/vaultSession';
import { useConfirm } from './ConfirmDialog';

type VaultView = 'gate' | 'list' | 'detail' | 'editor' | 'importPreview' | 'changePassword';
type NoticeTone = 'info' | 'success' | 'error';
type VaultNotice = { text: string; tone: NoticeTone };

// setTimeout 的延迟上限（约 24.8 天），超过会被浏览器当作 0 立即触发。
const MAX_TIMEOUT_DELAY_MS = 0x7fffffff;
const CLIPBOARD_CLEAR_DELAY_MS = 30_000;
const IMPORT_PREVIEW_LIMIT = 80;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function formatRemainingMs(ms: number): string {
  if (ms >= DAY_MS) return `${Math.round(ms / DAY_MS)}天`;
  if (ms >= HOUR_MS) return `${Math.round(ms / HOUR_MS)}小时`;
  return `${Math.max(1, Math.ceil(ms / 60_000))}分钟`;
}

// 去掉易混淆字符（O/0、I/l/1）后各取一类，保证四类字符齐全。
const PASSWORD_CHARSETS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnpqrstuvwxyz',
  '23456789',
  '!@#$%^&*-_=+?',
];

function generatePassword(length = 16): string {
  const all = PASSWORD_CHARSETS.join('');
  const randomValues = crypto.getRandomValues(new Uint32Array(length));
  const chars = Array.from(randomValues, (random, index) => {
    if (index < PASSWORD_CHARSETS.length) {
      const charset = PASSWORD_CHARSETS[index];
      return charset[random % charset.length];
    }
    return all[random % all.length];
  });
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function formatCardNumber(raw?: string): string {
  const value = raw?.trim() || '';
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return value;
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function loginDomain(item: VaultItemPlain): string | null {
  if (item.type !== 'login') return null;
  const normalized = normalizeVaultUrl(item.url);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

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
  const panelRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const clipboardClearTimerRef = useRef<number | null>(null);
  const draftSnapshotRef = useRef('');
  const editorReturnViewRef = useRef<'list' | 'detail'>('list');
  const escapeActionRef = useRef<() => void>(() => {});

  const [view, setView] = useState<VaultView>('gate');
  const [hasMeta, setHasMeta] = useState<boolean | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItemPlain[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<VaultNotice | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sessionTtlMs, setSessionTtlMs] = useState(loadPreferredVaultTtlMs);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<VaultItemType | 'all'>('all');
  const [draft, setDraft] = useState<VaultItemPlain | null>(null);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealSecrets, setRevealSecrets] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyMenuFor, setCopyMenuFor] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [mergePlan, setMergePlan] = useState<VaultMergePlan | null>(null);
  const [, setLockCountdownTick] = useState(0);

  const showNotice = (text: string, tone: NoticeTone = 'info') => {
    setNotice({ text, tone });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 3600);
  };

  const resetUiToGate = () => {
    setVaultKey(null);
    setItems([]);
    setDraft(null);
    setSelectedId(null);
    setMergePlan(null);
    setPassword('');
    setPasswordConfirm('');
    setRevealSecrets({});
    setSearchQuery('');
    setTypeFilter('all');
    setCopyMenuFor(null);
    setHeaderMenuOpen(false);
    setView('gate');
  };

  const lockVault = (announce = false) => {
    clearVaultSession();
    if (expiryTimerRef.current) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    resetUiToGate();
    if (announce) showNotice('保险箱已锁定', 'info');
  };

  const scheduleSessionExpiry = () => {
    if (expiryTimerRef.current) window.clearTimeout(expiryTimerRef.current);
    const remaining = getVaultSessionRemainingMs();
    if (remaining <= 0) {
      lockVault(true);
      return;
    }
    expiryTimerRef.current = window.setTimeout(() => {
      if (getVaultSessionRemainingMs() <= 0) {
        lockVault(true);
      } else {
        scheduleSessionExpiry();
      }
    }, Math.min(remaining, MAX_TIMEOUT_DELAY_MS));
  };

  const touchActivity = () => {
    if (!vaultKey) return;
    if (!touchVaultSession()) {
      lockVault(true);
      return;
    }
    scheduleSessionExpiry();
  };

  const loadItems = async (key: CryptoKey) => {
    const rows = await fetchVaultItemRows();
    const { items: decrypted, failed } = await decryptVaultItems(key, rows);
    setItems(decrypted);
    if (failed > 0) {
      showNotice(`有 ${failed} 条记录无法解密，已隐藏`, 'error');
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    (async () => {
      try {
        const meta = await fetchVaultMeta();
        if (cancelled) return;
        setHasMeta(Boolean(meta));

        let sessionKey = getVaultSession() ?? (await restoreVaultSession());
        if (sessionKey) {
          // 密钥可能属于其他账号或已被改密，先用 verifier 校验再复用。
          const valid =
            meta &&
            (await verifyMasterPassword(sessionKey, {
              ciphertext: meta.verifier_ciphertext,
              iv: meta.verifier_iv,
            }));
          if (!valid) {
            clearVaultSession();
            sessionKey = null;
          }
        }
        if (cancelled) return;

        if (sessionKey) {
          setVaultKey(sessionKey);
          setBusy(true);
          try {
            await loadItems(sessionKey);
            if (!cancelled) {
              setView('list');
              touchVaultSession();
              scheduleSessionExpiry();
            }
          } finally {
            if (!cancelled) setBusy(false);
          }
        } else {
          setVaultKey(null);
          setItems([]);
          setDraft(null);
          setMergePlan(null);
          setView('gate');
        }
      } catch (err) {
        if (!cancelled) {
          showNotice(err instanceof Error ? err.message : '无法加载保险箱', 'error');
          setHasMeta(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (lockToken > 0) lockVault(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockToken]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      if (clipboardClearTimerRef.current) window.clearTimeout(clipboardClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escapeActionRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  // 每 30 秒刷新一次头部的「剩余锁定时间」。
  useEffect(() => {
    if (!isOpen || !vaultKey) return;
    const id = window.setInterval(() => setLockCountdownTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(id);
  }, [isOpen, vaultKey]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-vault-header-menu]')) return;
      setHeaderMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [headerMenuOpen]);

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

  const handleSetupOrUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    if (!password.trim()) {
      showNotice('请输入主密码', 'error');
      return;
    }
    if (!hasMeta && password !== passwordConfirm) {
      showNotice('两次输入的主密码不一致', 'error');
      return;
    }
    if (!hasMeta && password.length < 8) {
      showNotice('主密码至少 8 位', 'error');
      return;
    }

    setBusy(true);
    try {
      const key = hasMeta
        ? await unlockVaultWithPassword(password)
        : await initializeVaultMeta(password);
      savePreferredVaultTtlMs(sessionTtlMs);
      setVaultSession(key, sessionTtlMs);
      setVaultKey(key);
      await loadItems(key);
      setPassword('');
      setPasswordConfirm('');
      setHasMeta(true);
      setView('list');
      scheduleSessionExpiry();
      showNotice(hasMeta ? '保险箱已解锁' : '主密码已设置', 'success');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openCreate = (type: VaultItemType) => {
    const next = emptyDraft(type);
    setDraft(next);
    setIsNewDraft(true);
    setRevealSecrets({});
    draftSnapshotRef.current = JSON.stringify(next);
    editorReturnViewRef.current = 'list';
    setView('editor');
    touchActivity();
  };

  const openDetail = (item: VaultItemPlain) => {
    setSelectedId(item.id);
    setRevealSecrets({});
    setView('detail');
    touchActivity();
  };

  const openEdit = (item: VaultItemPlain) => {
    const next = {
      ...item,
      fields: item.fields ? item.fields.map((f) => ({ ...f })) : undefined,
    };
    setDraft(next);
    setIsNewDraft(false);
    setRevealSecrets({});
    draftSnapshotRef.current = JSON.stringify(next);
    editorReturnViewRef.current = view === 'detail' ? 'detail' : 'list';
    setView('editor');
    touchActivity();
  };

  const closeEditor = () => {
    setDraft(null);
    if (editorReturnViewRef.current === 'detail' && selectedId) {
      setView('detail');
    } else {
      setView('list');
    }
  };

  const attemptCloseEditor = async () => {
    if (draft && JSON.stringify(draft) !== draftSnapshotRef.current) {
      const confirmed = await confirmAction({
        title: '放弃未保存的修改？',
        description: '当前编辑内容尚未保存，退出后将丢失。',
        confirmLabel: '放弃修改',
        container: panelRef.current,
      });
      if (!confirmed) return;
    }
    closeEditor();
  };

  const handleSaveDraft = async () => {
    if (!vaultKey || !draft) return;
    if (!draft.title.trim()) {
      showNotice('请填写标题', 'error');
      return;
    }
    setBusy(true);
    setNotice(null);
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
      if (!isNewDraft && editorReturnViewRef.current === 'detail') {
        setSelectedId(saved.id);
        setView('detail');
      } else {
        setView('list');
      }
      showNotice('已保存', 'success');
      touchActivity();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '保存失败', 'error');
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
      container: panelRef.current,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteVaultItemFromSupabase(draft.id);
      setItems((current) => current.filter((item) => item.id !== draft.id));
      setDraft(null);
      setSelectedId(null);
      setView('list');
      showNotice('已删除', 'success');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  // 到点后仅在剪贴板内容仍是我们写入的值时清空，避免覆盖用户后续复制的内容。
  const scheduleClipboardClear = (value: string) => {
    if (clipboardClearTimerRef.current) window.clearTimeout(clipboardClearTimerRef.current);
    clipboardClearTimerRef.current = window.setTimeout(() => {
      clipboardClearTimerRef.current = null;
      void (async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === value) await navigator.clipboard.writeText('');
        } catch {
          // 无读取权限或窗口失焦时放弃清除
        }
      })();
    }, CLIPBOARD_CLEAR_DELAY_MS);
  };

  const handleCopy = async (
    field: string,
    value?: string,
    successText = '已复制',
    sensitive = false
  ) => {
    if (!value) return;
    const ok = await copyText(value);
    if (ok) {
      setCopiedField(field);
      setCopyMenuFor(null);
      if (sensitive) {
        scheduleClipboardClear(value);
        showNotice(`${successText}，30 秒后自动清除`, 'success');
      } else {
        showNotice(successText, 'success');
      }
      window.setTimeout(() => setCopiedField(null), 1500);
    } else {
      showNotice('复制失败', 'error');
    }
    touchActivity();
  };

  const handleCopyAll = async (item: VaultItemPlain) => {
    const text = formatVaultItemForCopy(item);
    if (!text) {
      showNotice('暂无可复制内容', 'info');
      return;
    }
    await handleCopy('all', text, '已复制全部信息', true);
  };

  const handleCopyMenuAction = async (
    item: VaultItemPlain,
    action: 'username' | 'password' | 'all'
  ) => {
    if (action === 'username') {
      await handleCopy('username', item.username, '已复制用户名');
      return;
    }
    if (action === 'password') {
      await handleCopy('password', item.password, '已复制密码', true);
      return;
    }
    await handleCopyAll(item);
  };

  useEffect(() => {
    if (!copyMenuFor) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-vault-copy-menu]')) return;
      setCopyMenuFor(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [copyMenuFor]);

  const handleOpenUrl = (rawUrl?: string) => {
    const url = normalizeVaultUrl(rawUrl);
    if (!url) {
      showNotice('没有可打开的网址', 'info');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    touchActivity();
  };

  const handleRefresh = async () => {
    if (!vaultKey || busy) return;
    setBusy(true);
    try {
      await loadItems(vaultKey);
      showNotice('已刷新', 'success');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '刷新失败', 'error');
    } finally {
      setBusy(false);
    }
    touchActivity();
  };

  const handleImportFile = async (file: File) => {
    if (!vaultKey) return;
    setBusy(true);
    setNotice(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const incoming = parseBitwardenExport(parsed);
      const plan = buildVaultMergePlan(items, incoming);
      setMergePlan(plan);
      setView('importPreview');
      touchActivity();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setBusy(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!vaultKey || !mergePlan) return;
    setBusy(true);
    setNotice(null);
    try {
      const toWrite = [
        ...mergePlan.adds.map((entry) => entry.incoming),
        ...mergePlan.updates.map((entry) => entry.incoming),
      ];
      const result = await upsertVaultItemsBatch(vaultKey, toWrite);
      await loadItems(vaultKey);
      setMergePlan(null);
      setView('list');
      showNotice(
        `导入完成：新增 ${mergePlan.adds.length}，更新 ${mergePlan.updates.length}，跳过 ${mergePlan.skips.length}` +
          (result.failed ? `（失败 ${result.failed}）` : '') +
          '。请删除导出的明文 JSON 文件',
        result.failed ? 'error' : 'success'
      );
      touchActivity();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '写入失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setHeaderMenuOpen(false);
    const confirmed = await confirmAction({
      title: '导出为未加密 JSON？',
      description: '导出文件包含明文密码，请妥善保管并在使用后尽快删除。',
      confirmLabel: '导出',
      container: panelRef.current,
    });
    if (!confirmed) return;
    const payload = { exportedAt: new Date().toISOString(), items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vault-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('已导出，请妥善保管文件', 'success');
    touchActivity();
  };

  const openChangePassword = () => {
    setHeaderMenuOpen(false);
    setPassword('');
    setPasswordConfirm('');
    setShowPassword(false);
    setView('changePassword');
    touchActivity();
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    if (password.length < 8) {
      showNotice('新主密码至少 8 位', 'error');
      return;
    }
    if (password !== passwordConfirm) {
      showNotice('两次输入的新主密码不一致', 'error');
      return;
    }
    setBusy(true);
    try {
      const { key, failed } = await rotateVaultMasterPassword(password, items);
      setVaultKey(key);
      setVaultSession(key, sessionTtlMs);
      scheduleSessionExpiry();
      setPassword('');
      setPasswordConfirm('');
      setView('list');
      if (failed > 0) {
        showNotice(
          `主密码已修改，但有 ${failed} 条记录重新加密失败，请保持解锁状态并重新保存`,
          'error'
        );
      } else {
        showNotice('主密码已修改', 'success');
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '修改主密码失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleGeneratePassword = async () => {
    if (!draft) return;
    if (draft.password?.trim()) {
      const confirmed = await confirmAction({
        title: '替换现有密码？',
        description: '将用新生成的随机密码覆盖当前密码。',
        confirmLabel: '替换',
        container: panelRef.current,
      });
      if (!confirmed) return;
    }
    updateDraft({ password: generatePassword() });
    setRevealSecrets((current) => ({ ...current, password: true }));
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

  escapeActionRef.current = () => {
    if (view === 'editor') {
      void attemptCloseEditor();
    } else if (view === 'detail') {
      setSelectedId(null);
      setView('list');
    } else if (view === 'importPreview') {
      setMergePlan(null);
      setView('list');
    } else if (view === 'changePassword') {
      setPassword('');
      setPasswordConfirm('');
      setView('list');
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const types: Array<VaultItemType | 'all'> = ['all', 'login', 'card', 'identity', 'note', 'custom'];
  const createTypes: VaultItemType[] = ['login', 'card', 'identity', 'note', 'custom'];
  const selectedItem = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  const showBackButton =
    view === 'editor' || view === 'importPreview' || view === 'detail' || view === 'changePassword';
  let headerBadgeType: VaultItemType | null = null;
  if (view === 'editor' && draft) {
    headerBadgeType = draft.type;
  } else if (view === 'detail' && selectedItem) {
    headerBadgeType = selectedItem.type;
  }

  let headerTitle = '保险箱';
  if (view === 'importPreview') {
    headerTitle = '导入预览';
  } else if (view === 'changePassword') {
    headerTitle = '修改主密码';
  } else if (view === 'detail' && selectedItem) {
    headerTitle = selectedItem.title;
  } else if (view === 'editor' && draft) {
    const draftTitle = draft.title.trim();
    if (draftTitle) {
      headerTitle = draftTitle;
    } else if (isNewDraft) {
      headerTitle = `新建${vaultItemTypeLabel(draft.type)}`;
    } else {
      headerTitle = '编辑';
    }
  }

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
        ref={panelRef}
        className="vault-panel absolute right-0 top-0 bottom-0 w-full sm:w-[400px] bg-slate-50 dark:bg-slate-950 shadow-2xl border-l border-white/80 dark:border-slate-800 flex flex-col h-full z-10 pt-[env(safe-area-inset-top,0px)] sm:pt-0 transition-transform animate-in slide-in-from-right duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 h-12 px-3 flex items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/95">
          <div className="flex items-center gap-1.5 min-w-0">
            {showBackButton && (
              <button
                type="button"
                onClick={() => escapeActionRef.current()}
                className="p-2 sm:p-1.5 rounded-lg hover:bg-white/70 dark:hover:bg-white/10"
                title="返回"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {(view === 'gate' || view === 'list') && (
              <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <h2
              id="vault-title"
              className="text-base font-bold text-slate-800 dark:text-slate-100 truncate"
            >
              {headerTitle}
            </h2>
            {headerBadgeType && (
              <span className="shrink-0 text-sm font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200">
                {vaultItemTypeLabel(headerBadgeType)}
              </span>
            )}
            {vaultKey && view === 'list' && (
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                {formatRemainingMs(getVaultSessionRemainingMs())}后锁定
              </span>
            )}
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
                  onClick={() => void handleRefresh()}
                  disabled={busy}
                  className="p-2 sm:p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10 disabled:opacity-60"
                  title="刷新"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => lockVault(true)}
                  className="p-2 sm:p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
                  title="锁定"
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
                <div className="relative" data-vault-header-menu>
                  <button
                    type="button"
                    onClick={() => setHeaderMenuOpen((open) => !open)}
                    className="p-2 sm:p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
                    title="更多操作"
                    aria-expanded={headerMenuOpen}
                  >
                    <EllipsisVertical className="w-3.5 h-3.5" />
                  </button>
                  {headerMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-30 min-w-[11rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
                      <HeaderMenuItem
                        icon={Upload}
                        label="从 Bitwarden 导入"
                        disabled={busy}
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          importInputRef.current?.click();
                        }}
                      />
                      <HeaderMenuItem
                        icon={Download}
                        label="导出 JSON"
                        disabled={busy}
                        onClick={() => void handleExport()}
                      />
                      <HeaderMenuItem
                        icon={KeySquare}
                        label="修改主密码"
                        disabled={busy}
                        onClick={openChangePassword}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 sm:p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10"
              title="关闭"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {view === 'gate' && (
          <form onSubmit={handleSetupOrUnlock} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
              <p className="text-[15px] leading-snug text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-lg px-2.5 py-2">
                {hasMeta
                  ? '解锁后在有效期内保持解锁，刷新页面也无需重复输入。'
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
                    autoFocus
                    autoComplete={hasMeta ? 'current-password' : 'new-password'}
                  />
                  {!hasMeta && (
                    <Field
                      label="确认主密码"
                      value={passwordConfirm}
                      secret
                      revealed={showPassword}
                      onChange={setPasswordConfirm}
                      autoComplete="new-password"
                    />
                  )}
                  <div>
                    <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      解锁有效期
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {VAULT_TTL_OPTIONS.map((option) => (
                        <button
                          key={option.ms}
                          type="button"
                          onClick={() => setSessionTtlMs(option.ms)}
                          className={`px-1 py-2 sm:py-1.5 rounded-md text-sm font-semibold border transition-colors ${
                            sessionTtlMs === option.ms
                              ? 'bg-amber-100 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </FieldGroup>
              )}
            </div>
            {hasMeta !== null && (
              <div className="shrink-0 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:pb-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[15px] font-semibold py-2 disabled:opacity-60 flex items-center justify-center gap-1.5"
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
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2.5 py-2 sm:py-1.5 text-base sm:text-[15px]"
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
                    className={`shrink-0 px-2 py-1 sm:py-0.5 rounded-md text-sm font-semibold border transition-colors ${
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
                <VaultEmptyState
                  hasItems={items.length > 0}
                  onCreateLogin={() => openCreate('login')}
                />
              ) : (
                filteredItems.map((item) => {
                  const canOpen = item.type === 'login' && Boolean(item.url?.trim());
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1 border-b border-slate-100/80 dark:border-slate-800/80 hover:bg-white/80 dark:hover:bg-slate-900/70"
                    >
                      <button
                        type="button"
                        onClick={() => openDetail(item)}
                        className="min-w-0 flex-1 text-left px-3 py-2 flex items-center gap-2.5"
                      >
                        <ItemGlyph item={item} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[15px] font-semibold text-slate-900 dark:text-white truncate leading-tight">
                            {item.title}
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
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
                            className="p-2 sm:p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <VaultCopyMenu
                          open={copyMenuFor === item.id}
                          onToggle={() =>
                            setCopyMenuFor((current) => (current === item.id ? null : item.id))
                          }
                          item={item}
                          onAction={(action) => void handleCopyMenuAction(item, action)}
                          align="right"
                          dropUp={false}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="shrink-0 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:pb-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90">
              <div className="flex items-center gap-1">
                {createTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => openCreate(type)}
                    className="flex-1 min-w-0 inline-flex items-center justify-center gap-0.5 px-1 py-2 sm:py-1.5 rounded-md text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Plus className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{vaultItemTypeLabel(type)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'detail' && selectedItem && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/50 p-2.5 space-y-2.5">
                {selectedItem.type === 'login' && (
                  <>
                    <DetailRow
                      label="用户名"
                      value={selectedItem.username}
                      onCopy={() => handleCopy('username', selectedItem.username, '已复制用户名')}
                      copied={copiedField === 'username'}
                    />
                    <DetailRow
                      label="密码"
                      value={selectedItem.password}
                      secret
                      mono
                      onCopy={() =>
                        handleCopy('password', selectedItem.password, '已复制密码', true)
                      }
                      copied={copiedField === 'password'}
                    />
                    <DetailRow
                      label="网址"
                      value={selectedItem.url}
                      onCopy={() => handleCopy('url', selectedItem.url)}
                      copied={copiedField === 'url'}
                      action={
                        selectedItem.url?.trim() ? (
                          <button
                            type="button"
                            onClick={() => handleOpenUrl(selectedItem.url)}
                            className="p-1.5 sm:p-1 text-slate-400 hover:text-amber-700 dark:hover:text-amber-300"
                            title="打开网址"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        ) : undefined
                      }
                    />
                    {selectedItem.totp?.trim() && (
                      <TotpDetailRow
                        rawSecret={selectedItem.totp}
                        onCopyCode={(code) => handleCopy('totp', code, '已复制验证码', true)}
                        copied={copiedField === 'totp'}
                      />
                    )}
                  </>
                )}

                {selectedItem.type === 'card' && (
                  <>
                    <DetailRow label="持卡人" value={selectedItem.cardholder} />
                    <DetailRow label="品牌" value={selectedItem.brand} />
                    <DetailRow
                      label="卡号"
                      value={formatCardNumber(selectedItem.number)}
                      secret
                      mono
                      onCopy={() =>
                        handleCopy('number', selectedItem.number, '已复制卡号', true)
                      }
                      copied={copiedField === 'number'}
                    />
                    {(selectedItem.expMonth || selectedItem.expYear) && (
                      <DetailRow
                        label="有效期"
                        value={[selectedItem.expMonth, selectedItem.expYear]
                          .filter(Boolean)
                          .join('/')}
                      />
                    )}
                    <DetailRow
                      label="CVV"
                      value={selectedItem.cvv}
                      secret
                      mono
                      onCopy={() => handleCopy('cvv', selectedItem.cvv, '已复制 CVV', true)}
                      copied={copiedField === 'cvv'}
                    />
                  </>
                )}

                {selectedItem.type === 'identity' && (
                  <>
                    <DetailRow label="姓名" value={selectedItem.fullName} />
                    <DetailRow label="证件类型" value={selectedItem.idType} />
                    <DetailRow
                      label="证件号"
                      value={selectedItem.idNumber}
                      secret
                      mono
                      onCopy={() =>
                        handleCopy('idNumber', selectedItem.idNumber, '已复制证件号', true)
                      }
                      copied={copiedField === 'idNumber'}
                    />
                  </>
                )}

                {selectedItem.folder?.trim() && (
                  <DetailRow label="文件夹" value={selectedItem.folder} />
                )}

                {(selectedItem.fields?.length ?? 0) > 0 && (
                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <span className="block text-sm font-semibold text-slate-400">自定义字段</span>
                    {selectedItem.fields!.map((field, index) => (
                      <React.Fragment key={index}>
                        <DetailRow
                          label={field.label || '字段'}
                          value={field.value}
                          secret={field.secret}
                          onCopy={() =>
                            handleCopy(`field-${index}`, field.value, '已复制', Boolean(field.secret))
                          }
                          copied={copiedField === `field-${index}`}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {selectedItem.notes?.trim() && (
                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                      备注
                    </span>
                    <p className="text-[15px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
                      {selectedItem.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:pb-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleCopyAll(selectedItem)}
                className="px-2.5 py-2 sm:py-1.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                复制全部
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => openEdit(selectedItem)}
                className="px-3.5 py-2 sm:py-1.5 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                编辑
              </button>
            </div>
          </div>
        )}

        {view === 'editor' && draft && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/50 p-2.5 space-y-2">
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
                      onCopy={() => handleCopy('username', draft.username, '已复制用户名')}
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
                      onCopy={() => handleCopy('password', draft.password, '已复制密码', true)}
                      copied={copiedField === 'password'}
                      action={
                        <button
                          type="button"
                          onClick={() => void handleGeneratePassword()}
                          className="inline-flex items-center gap-0.5 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:opacity-80"
                          title="生成随机密码"
                        >
                          <RefreshCw className="w-3 h-3" />
                          生成
                        </button>
                      }
                    />
                    <div className="grid grid-cols-[1fr_auto] gap-1.5 items-end">
                      <Field
                        label="网址"
                        value={draft.url || ''}
                        onChange={(value) => updateDraft({ url: value })}
                        onCopy={() => handleCopy('url', draft.url)}
                        copied={copiedField === 'url'}
                      />
                      <button
                        type="button"
                        disabled={!draft.url?.trim()}
                        onClick={() => handleOpenUrl(draft.url)}
                        className="mb-0.5 h-9 sm:h-[30px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-40"
                        title="打开网址"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Field
                      label="TOTP"
                      value={draft.totp || ''}
                      onChange={(value) => updateDraft({ totp: value })}
                      onCopy={() => handleCopy('totp', draft.totp, '已复制', true)}
                      copied={copiedField === 'totp'}
                    />
                  </>
                )}

                {draft.type === 'card' && (
                  <>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Field
                        label="持卡人"
                        value={draft.cardholder || ''}
                        onChange={(value) => updateDraft({ cardholder: value })}
                        onCopy={() => handleCopy('cardholder', draft.cardholder)}
                        copied={copiedField === 'cardholder'}
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
                      onCopy={() => handleCopy('number', draft.number, '已复制', true)}
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
                        onCopy={() => handleCopy('cvv', draft.cvv, '已复制', true)}
                        copied={copiedField === 'cvv'}
                      />
                    </div>
                  </>
                )}

                {draft.type === 'identity' && (
                  <>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Field
                        label="姓名"
                        value={draft.fullName || ''}
                        onChange={(value) => updateDraft({ fullName: value })}
                        onCopy={() => handleCopy('fullName', draft.fullName)}
                        copied={copiedField === 'fullName'}
                      />
                      <Field
                        label="证件类型"
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
                      onCopy={() => handleCopy('idNumber', draft.idNumber, '已复制', true)}
                      copied={copiedField === 'idNumber'}
                    />
                  </>
                )}

                <textarea
                  value={draft.notes || ''}
                  onChange={(event) => updateDraft({ notes: event.target.value })}
                  rows={6}
                  placeholder="备注（可选）"
                  className="w-full min-h-[9rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-base sm:text-[15px] resize-y"
                  autoComplete="off"
                />

                {(draft.type === 'custom' || (draft.fields && draft.fields.length > 0)) && (
                  <div className="space-y-1.5 pt-0.5 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-400">自定义字段</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft({
                            fields: [...(draft.fields || []), { label: '', value: '' }],
                          })
                        }
                        className="text-sm font-semibold text-amber-700 dark:text-amber-300"
                      >
                        + 添加
                      </button>
                    </div>
                    {(draft.fields || []).map((field, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-end"
                      >
                        <Field
                          label="标签"
                          value={field.label}
                          onChange={(value) => updateFieldRow(index, { label: value })}
                        />
                        <Field
                          label="值"
                          value={field.value}
                          secret={field.secret}
                          revealed={Boolean(revealSecrets[`field-${index}`])}
                          onToggleReveal={
                            field.secret
                              ? () =>
                                  setRevealSecrets((current) => ({
                                    ...current,
                                    [`field-${index}`]: !current[`field-${index}`],
                                  }))
                              : undefined
                          }
                          onChange={(value) => updateFieldRow(index, { value })}
                          onCopy={() =>
                            handleCopy(`field-${index}`, field.value, '已复制', Boolean(field.secret))
                          }
                          copied={copiedField === `field-${index}`}
                        />
                        <button
                          type="button"
                          onClick={() => updateFieldRow(index, { secret: !field.secret })}
                          className={`p-2 sm:p-1.5 mb-0.5 rounded-md ${
                            field.secret
                              ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title={field.secret ? '取消隐藏字段' : '设为隐藏字段'}
                        >
                          {field.secret ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft({
                              fields: (draft.fields || []).filter((_, i) => i !== index),
                            })
                          }
                          className="p-2 sm:p-1.5 mb-0.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title="删除字段"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:pb-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90 flex items-center gap-1.5">
              <div className="flex-1" />
              {!isNewDraft && (
                <button
                  type="button"
                  onClick={() => void handleDeleteDraft()}
                  disabled={busy}
                  className="px-2.5 py-2 sm:py-1.5 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  删除
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={busy}
                className="px-3.5 py-2 sm:py-1.5 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-60 flex items-center gap-1.5"
              >
                {busy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                保存
              </button>
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
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-[15px] overflow-hidden">
                {[...mergePlan.adds, ...mergePlan.updates, ...mergePlan.skips]
                  .slice(0, IMPORT_PREVIEW_LIMIT)
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
                {mergePlan.adds.length + mergePlan.updates.length + mergePlan.skips.length >
                  IMPORT_PREVIEW_LIMIT && (
                  <div className="px-2.5 py-1.5 text-sm text-slate-400 text-center">
                    还有{' '}
                    {mergePlan.adds.length +
                      mergePlan.updates.length +
                      mergePlan.skips.length -
                      IMPORT_PREVIEW_LIMIT}{' '}
                    条未显示
                  </div>
                )}
              </div>
            </div>
            <div className="shrink-0 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:pb-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90 flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMergePlan(null);
                  setView('list');
                }}
                className="flex-1 px-3 py-2 rounded-lg text-[15px] font-semibold bg-slate-100 dark:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmImport()}
                disabled={
                  busy || (mergePlan.adds.length === 0 && mergePlan.updates.length === 0)
                }
                className="flex-1 px-3 py-2 rounded-lg text-[15px] font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {busy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                确认合并
              </button>
            </div>
          </div>
        )}

        {view === 'changePassword' && (
          <form onSubmit={handleChangePassword} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
              <p className="text-[15px] leading-snug text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-lg px-2.5 py-2">
                修改后将用新密钥重新加密全部条目，请勿在过程中关闭页面。新主密码同样不可找回。
              </p>
              <FieldGroup>
                <Field
                  label="新主密码"
                  value={password}
                  secret
                  revealed={showPassword}
                  onToggleReveal={() => setShowPassword((value) => !value)}
                  onChange={setPassword}
                  autoFocus
                  autoComplete="new-password"
                />
                <Field
                  label="确认新主密码"
                  value={passwordConfirm}
                  secret
                  revealed={showPassword}
                  onChange={setPasswordConfirm}
                  autoComplete="new-password"
                />
              </FieldGroup>
            </div>
            <div className="shrink-0 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:pb-2 border-t border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90">
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[15px] font-semibold py-2 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {busy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                修改主密码
              </button>
            </div>
          </form>
        )}

        {notice && (
          <VaultNoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}
      </div>
    </div>
  );
};

function VaultNoticeBanner({
  notice,
  onDismiss,
}: {
  notice: VaultNotice;
  onDismiss: () => void;
}) {
  let toneClass =
    'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800';
  if (notice.tone === 'success') {
    toneClass =
      'text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950 border-emerald-100 dark:border-emerald-900';
  } else if (notice.tone === 'error') {
    toneClass =
      'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 border-rose-100 dark:border-rose-900';
  }

  return (
    <div
      role="status"
      className={`absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-14 left-3 right-3 z-40 px-3 py-2 text-sm border rounded-lg shadow-lg flex items-start justify-between gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200 ${toneClass}`}
    >
      <span className="leading-snug">{notice.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-0.5 rounded hover:opacity-70"
        title="关闭"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

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
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
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

function VaultCopyMenu({
  open,
  onToggle,
  item,
  onAction,
  align = 'right',
  showLabel = false,
  dropUp = false,
}: {
  open: boolean;
  onToggle: () => void;
  item: VaultItemPlain;
  onAction: (action: 'username' | 'password' | 'all') => void;
  align?: 'left' | 'right';
  showLabel?: boolean;
  dropUp?: boolean;
}) {
  const canUsername = Boolean(item.username?.trim());
  const canPassword = Boolean(item.password?.trim());

  let menuPosition = 'top-full mt-1';
  if (dropUp) menuPosition = 'bottom-full mb-1';

  return (
    <div className="relative" data-vault-copy-menu>
      <button
        type="button"
        title="复制"
        aria-label="复制"
        aria-expanded={open}
        onClick={onToggle}
        className={`inline-flex items-center gap-1 rounded-lg border transition-colors ${
          showLabel ? 'px-2 py-1.5 text-sm font-semibold' : 'p-2 sm:p-1.5'
        } ${
          open
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200'
            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
        }`}
      >
        <ClipboardCopy className="w-3.5 h-3.5" />
        {showLabel && <span>复制</span>}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className={`absolute z-20 min-w-[8.5rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 ${menuPosition} ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <CopyMenuItem
            label="复制用户名"
            disabled={!canUsername}
            onClick={() => onAction('username')}
          />
          <CopyMenuItem
            label="复制密码"
            disabled={!canPassword}
            onClick={() => onAction('password')}
          />
          <CopyMenuItem label="复制全部" onClick={() => onAction('all')} />
        </div>
      )}
    </div>
  );
}

function CopyMenuItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full text-left px-3 py-2 sm:py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1.5">
      <div className="text-sm font-bold text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
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
  autoFocus,
  autoComplete = 'off',
  action,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCopy?: () => void;
  copied?: boolean;
  secret?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
  autoFocus?: boolean;
  autoComplete?: string;
  action?: React.ReactNode;
}) {
  const inputType = secret && !revealed ? 'password' : 'text';
  let rightPad = '';
  if (secret && onCopy) rightPad = 'pr-16';
  else if (secret || onCopy) rightPad = 'pr-9';

  return (
    <label className="block min-w-0">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 mb-0.5 leading-tight">
        {label}
        {action}
      </span>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 sm:py-1.5 text-base sm:text-[15px] ${rightPad}`}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
          {secret && onToggleReveal && (
            <button
              type="button"
              onClick={onToggleReveal}
              className="p-1.5 sm:p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              className="p-1.5 sm:p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>
    </label>
  );
}

function DetailRow({
  label,
  value,
  secret,
  mono,
  onCopy,
  copied,
  action,
}: {
  label: string;
  value?: string;
  secret?: boolean;
  mono?: boolean;
  onCopy?: () => void;
  copied?: boolean;
  action?: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let display = trimmed;
  if (secret && !revealed) display = '••••••••';

  return (
    <div className="min-w-0">
      <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400 leading-tight">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <span
          className={`flex-1 min-w-0 break-all text-[15px] text-slate-800 dark:text-slate-100 ${
            mono ? 'font-mono' : ''
          }`}
        >
          {display}
        </span>
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            className="p-1.5 sm:p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
            title={revealed ? '隐藏' : '显示'}
          >
            {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="p-1.5 sm:p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
            title="复制"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        )}
        {action}
      </div>
    </div>
  );
}

function TotpDetailRow({
  rawSecret,
  onCopyCode,
  copied,
}: {
  rawSecret: string;
  onCopyCode: (code: string) => void;
  copied?: boolean;
}) {
  const config = useMemo(() => parseTotpInput(rawSecret), [rawSecret]);
  const [code, setCode] = useState('');
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!config) return;
    let disposed = false;
    const update = () => {
      setRemaining(totpRemainingSeconds(config.period));
      void generateTotpCode(config).then((next) => {
        if (!disposed) setCode(next);
      });
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [config]);

  if (!config) {
    return <DetailRow label="TOTP" value={rawSecret} secret mono />;
  }

  const displayCode = code
    ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}`
    : '……';

  return (
    <div className="min-w-0">
      <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400 leading-tight">
        验证码
      </span>
      <div className="flex items-center gap-2">
        <span className="text-lg font-mono font-bold tracking-wider text-slate-900 dark:text-white">
          {displayCode}
        </span>
        <span className="text-sm text-slate-400 tabular-nums">{remaining}s</span>
        <button
          type="button"
          onClick={() => code && onCopyCode(code)}
          className="p-1.5 sm:p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          title="复制验证码"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function ItemGlyph({ item }: { item: VaultItemPlain }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const domain = loginDomain(item);
  const Icon = typeIcon(item.type);

  if (!domain || faviconFailed) {
    return <Icon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
  }
  return (
    <img
      src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
      alt=""
      loading="lazy"
      className="w-4 h-4 rounded-sm shrink-0"
      onError={() => setFaviconFailed(true)}
    />
  );
}

function VaultEmptyState({
  hasItems,
  onCreateLogin,
}: {
  hasItems: boolean;
  onCreateLogin: () => void;
}) {
  if (hasItems) {
    return <div className="py-12 text-center text-[15px] text-slate-400">没有匹配的条目</div>;
  }
  return (
    <div className="py-12 px-6 text-center space-y-3">
      <Shield className="w-9 h-9 mx-auto text-slate-300 dark:text-slate-600" />
      <p className="text-[15px] font-semibold text-slate-500 dark:text-slate-400">保险箱还是空的</p>
      <p className="text-sm text-slate-400 dark:text-slate-500">
        点击下方按钮新建条目，或从右上角菜单导入 Bitwarden
      </p>
      <button
        type="button"
        onClick={onCreateLogin}
        className="inline-flex items-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500"
      >
        <Plus className="w-3.5 h-3.5" />
        新建登录
      </button>
    </div>
  );
}

function HeaderMenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full text-left px-3 py-2 sm:py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-2"
    >
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      {label}
    </button>
  );
}
