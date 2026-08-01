export const VAULT_KDF_ITERATIONS = 310_000;
export const VAULT_VERIFIER_PLAINTEXT = 'daily-todos-vault-v1';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(byteLength = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(byteLength));
}

export async function deriveVaultKey(
  masterPassword: string,
  salt: Uint8Array,
  iterations: number = VAULT_KDF_ITERATIONS
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedBlob {
  ciphertext: string;
  iv: string;
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptJson<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  const iv = base64ToBytes(blob.iv);
  const ciphertext = base64ToBytes(blob.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return JSON.parse(textDecoder.decode(decrypted)) as T;
}

export async function createVerifier(key: CryptoKey): Promise<EncryptedBlob> {
  return encryptJson(key, { v: VAULT_VERIFIER_PLAINTEXT });
}

export async function verifyMasterPassword(
  key: CryptoKey,
  verifier: EncryptedBlob
): Promise<boolean> {
  try {
    const payload = await decryptJson<{ v?: string }>(key, verifier);
    return payload.v === VAULT_VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}
