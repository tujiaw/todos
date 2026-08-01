const SESSION_TTL_KEY = 'vault_session_ttl_ms';

export const VAULT_TTL_OPTIONS = [
  { label: '15分钟', ms: 15 * 60 * 1000 },
  { label: '30分钟', ms: 30 * 60 * 1000 },
  { label: '1小时', ms: 60 * 60 * 1000 },
  { label: '4小时', ms: 4 * 60 * 60 * 1000 },
] as const;

export const DEFAULT_VAULT_TTL_MS = VAULT_TTL_OPTIONS[1].ms;

let vaultKey: CryptoKey | null = null;
let expiresAt = 0;
let ttlMs = DEFAULT_VAULT_TTL_MS;

export function loadPreferredVaultTtlMs(): number {
  try {
    const raw = sessionStorage.getItem(SESSION_TTL_KEY);
    const value = raw ? Number(raw) : NaN;
    if (VAULT_TTL_OPTIONS.some((option) => option.ms === value)) return value;
  } catch {
    // ignore
  }
  return DEFAULT_VAULT_TTL_MS;
}

export function savePreferredVaultTtlMs(ms: number): void {
  try {
    sessionStorage.setItem(SESSION_TTL_KEY, String(ms));
  } catch {
    // ignore
  }
}

export function setVaultSession(key: CryptoKey, nextTtlMs: number = loadPreferredVaultTtlMs()): void {
  vaultKey = key;
  ttlMs = nextTtlMs;
  expiresAt = Date.now() + nextTtlMs;
}

export function touchVaultSession(): boolean {
  if (!vaultKey || Date.now() >= expiresAt) {
    clearVaultSession();
    return false;
  }
  expiresAt = Date.now() + ttlMs;
  return true;
}

export function getVaultSession(): CryptoKey | null {
  if (!vaultKey || Date.now() >= expiresAt) {
    clearVaultSession();
    return null;
  }
  return vaultKey;
}

export function getVaultSessionRemainingMs(): number {
  if (!vaultKey) return 0;
  return Math.max(0, expiresAt - Date.now());
}

export function clearVaultSession(): void {
  vaultKey = null;
  expiresAt = 0;
}
