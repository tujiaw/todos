import { VaultItemPlain, VaultItemRow, VaultMetaRow } from '../types';
import { ensureAuthenticatedUser, supabase } from './supabase';
import {
  createVerifier,
  decryptJson,
  deriveVaultKey,
  encryptJson,
  generateSalt,
  bytesToBase64,
  base64ToBytes,
  verifyMasterPassword,
  VAULT_KDF_ITERATIONS,
} from './vaultCrypto';

export const fetchVaultMeta = async (): Promise<VaultMetaRow | null> => {
  const activeUser = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('vault_meta')
    .select('*')
    .eq('user_id', activeUser.id)
    .maybeSingle();
  if (error) throw error;
  return data as VaultMetaRow | null;
};

export const initializeVaultMeta = async (masterPassword: string): Promise<CryptoKey> => {
  const activeUser = await ensureAuthenticatedUser();
  const existing = await fetchVaultMeta();
  if (existing) {
    throw new Error('Vault is already initialized. Unlock with your master password.');
  }

  const salt = generateSalt();
  const key = await deriveVaultKey(masterPassword, salt, VAULT_KDF_ITERATIONS);
  const verifier = await createVerifier(key);
  const now = new Date().toISOString();

  const { error } = await supabase.from('vault_meta').insert({
    user_id: activeUser.id,
    salt: bytesToBase64(salt),
    verifier_ciphertext: verifier.ciphertext,
    verifier_iv: verifier.iv,
    kdf_iterations: VAULT_KDF_ITERATIONS,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
  return key;
};

export const unlockVaultWithPassword = async (masterPassword: string): Promise<CryptoKey> => {
  const meta = await fetchVaultMeta();
  if (!meta) {
    throw new Error('Master password has not been set.');
  }

  const key = await deriveVaultKey(
    masterPassword,
    base64ToBytes(meta.salt),
    meta.kdf_iterations || VAULT_KDF_ITERATIONS
  );
  const ok = await verifyMasterPassword(key, {
    ciphertext: meta.verifier_ciphertext,
    iv: meta.verifier_iv,
  });
  if (!ok) {
    throw new Error('Incorrect master password');
  }
  return key;
};

export const fetchVaultItemRows = async (): Promise<VaultItemRow[]> => {
  const activeUser = await ensureAuthenticatedUser();
  const { data, error } = await supabase
    .from('vault_items')
    .select('*')
    .eq('user_id', activeUser.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as VaultItemRow[];
};

export const decryptVaultItems = async (
  key: CryptoKey,
  rows: VaultItemRow[]
): Promise<{ items: VaultItemPlain[]; failed: number }> => {
  const items: VaultItemPlain[] = [];
  let failed = 0;
  for (const row of rows) {
    try {
      const plain = await decryptJson<VaultItemPlain>(key, {
        ciphertext: row.ciphertext,
        iv: row.iv,
      });
      items.push({
        ...plain,
        id: row.id,
        type: plain.type || row.type,
        updatedAt: plain.updatedAt || row.updated_at,
      });
    } catch (err) {
      console.warn('Failed to decrypt vault item', row.id, err);
      failed += 1;
    }
  }
  return { items, failed };
};

export const upsertVaultItemEncrypted = async (
  key: CryptoKey,
  item: VaultItemPlain
): Promise<VaultItemPlain> => {
  const activeUser = await ensureAuthenticatedUser();
  const now = Date.now();
  const payload: VaultItemPlain = {
    ...item,
    updatedAt: item.updatedAt || now,
    createdAt: item.createdAt || now,
  };
  const encrypted = await encryptJson(key, payload);

  const { error } = await supabase.from('vault_items').upsert({
    id: payload.id,
    user_id: activeUser.id,
    type: payload.type,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    updated_at: payload.updatedAt,
  });
  if (error) throw error;
  return payload;
};

export const deleteVaultItemFromSupabase = async (id: string): Promise<void> => {
  const activeUser = await ensureAuthenticatedUser();
  const { error } = await supabase
    .from('vault_items')
    .delete()
    .eq('id', id)
    .eq('user_id', activeUser.id);
  if (error) throw error;
};

const VAULT_UPSERT_CHUNK_SIZE = 100;

export const upsertVaultItemsBatch = async (
  key: CryptoKey,
  items: VaultItemPlain[]
): Promise<{ saved: number; failed: number }> => {
  if (items.length === 0) return { saved: 0, failed: 0 };
  const activeUser = await ensureAuthenticatedUser();
  const now = Date.now();

  const rows = await Promise.all(
    items.map(async (item) => {
      const payload: VaultItemPlain = {
        ...item,
        updatedAt: item.updatedAt || now,
        createdAt: item.createdAt || now,
      };
      const encrypted = await encryptJson(key, payload);
      return {
        id: payload.id,
        user_id: activeUser.id,
        type: payload.type,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        updated_at: payload.updatedAt,
      };
    })
  );

  let saved = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += VAULT_UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + VAULT_UPSERT_CHUNK_SIZE);
    const { error } = await supabase.from('vault_items').upsert(chunk);
    if (error) {
      console.warn('Vault batch upsert failed for chunk starting at', i, error);
      failed += chunk.length;
    } else {
      saved += chunk.length;
    }
  }
  return { saved, failed };
};

/**
 * Re-key the vault: new salt/verifier in vault_meta, then re-encrypt all items.
 * Meta is updated first so the new password always unlocks; any item that fails
 * re-encryption is reported so the caller can retry while plaintext is in memory.
 */
export const rotateVaultMasterPassword = async (
  newPassword: string,
  items: VaultItemPlain[]
): Promise<{ key: CryptoKey; failed: number }> => {
  const activeUser = await ensureAuthenticatedUser();
  const salt = generateSalt();
  const key = await deriveVaultKey(newPassword, salt, VAULT_KDF_ITERATIONS);
  const verifier = await createVerifier(key);

  const { error } = await supabase
    .from('vault_meta')
    .update({
      salt: bytesToBase64(salt),
      verifier_ciphertext: verifier.ciphertext,
      verifier_iv: verifier.iv,
      kdf_iterations: VAULT_KDF_ITERATIONS,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', activeUser.id);
  if (error) throw error;

  const result = await upsertVaultItemsBatch(key, items);
  return { key, failed: result.failed };
};
