const TTL_PREF_KEY = 'vault_session_ttl_ms';
const DB_NAME = 'daily-todos-vault';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const RECORD_KEY = 'current';
// 活动续期时，仅当过期时间前移超过该值才写回 IndexedDB，避免频繁 IO。
const PERSIST_MIN_ADVANCE_MS = 60 * 1000;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const VAULT_TTL_OPTIONS = [
  { label: '1 hour', ms: HOUR },
  { label: '1 day', ms: DAY },
  { label: '7 days', ms: 7 * DAY },
  { label: '30 days', ms: 30 * DAY },
] as const;

export const DEFAULT_VAULT_TTL_MS = VAULT_TTL_OPTIONS[1].ms;

interface PersistedVaultSession {
  key: CryptoKey;
  expiresAt: number;
  ttlMs: number;
}

let vaultKey: CryptoKey | null = null;
let expiresAt = 0;
let ttlMs = DEFAULT_VAULT_TTL_MS;
let lastPersistedExpiresAt = 0;

function openSessionDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withSessionStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openSessionDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function persistSession(): void {
  if (!vaultKey) return;
  const record: PersistedVaultSession = { key: vaultKey, expiresAt, ttlMs };
  lastPersistedExpiresAt = expiresAt;
  void withSessionStore('readwrite', (store) => store.put(record, RECORD_KEY)).catch(() => {
    // 持久化失败时仅保留内存会话
  });
}

function deletePersistedSession(): void {
  lastPersistedExpiresAt = 0;
  void withSessionStore('readwrite', (store) => store.delete(RECORD_KEY)).catch(() => {
    // ignore
  });
}

export function loadPreferredVaultTtlMs(): number {
  try {
    const raw = localStorage.getItem(TTL_PREF_KEY);
    const value = raw ? Number(raw) : NaN;
    if (VAULT_TTL_OPTIONS.some((option) => option.ms === value)) return value;
  } catch {
    // ignore
  }
  return DEFAULT_VAULT_TTL_MS;
}

export function savePreferredVaultTtlMs(ms: number): void {
  try {
    localStorage.setItem(TTL_PREF_KEY, String(ms));
  } catch {
    // ignore
  }
}

export function setVaultSession(key: CryptoKey, nextTtlMs: number = loadPreferredVaultTtlMs()): void {
  vaultKey = key;
  ttlMs = nextTtlMs;
  expiresAt = Date.now() + nextTtlMs;
  persistSession();
}

export function touchVaultSession(): boolean {
  if (!vaultKey) return false;
  if (Date.now() >= expiresAt) {
    clearVaultSession();
    return false;
  }
  expiresAt = Date.now() + ttlMs;
  if (expiresAt - lastPersistedExpiresAt > PERSIST_MIN_ADVANCE_MS) {
    persistSession();
  }
  return true;
}

export function getVaultSession(): CryptoKey | null {
  if (!vaultKey) return null;
  if (Date.now() >= expiresAt) {
    clearVaultSession();
    return null;
  }
  return vaultKey;
}

/** Restore the unlocked session from IndexedDB (e.g. after a page refresh). */
export async function restoreVaultSession(): Promise<CryptoKey | null> {
  if (vaultKey) return getVaultSession();
  try {
    const record = await withSessionStore<PersistedVaultSession | undefined>(
      'readonly',
      (store) => store.get(RECORD_KEY)
    );
    if (!record?.key || typeof record.expiresAt !== 'number') return null;
    if (Date.now() >= record.expiresAt) {
      deletePersistedSession();
      return null;
    }
    vaultKey = record.key;
    expiresAt = record.expiresAt;
    ttlMs = record.ttlMs > 0 ? record.ttlMs : loadPreferredVaultTtlMs();
    lastPersistedExpiresAt = record.expiresAt;
    return vaultKey;
  } catch {
    return null;
  }
}

export function getVaultSessionRemainingMs(): number {
  if (!vaultKey) return 0;
  return Math.max(0, expiresAt - Date.now());
}

export function clearVaultSession(): void {
  vaultKey = null;
  expiresAt = 0;
  deletePersistedSession();
}
