import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createVerifier,
  decryptJson,
  deriveVaultKey,
  encryptJson,
  generateSalt,
  verifyMasterPassword,
  VAULT_KDF_ITERATIONS,
} from '../src/lib/vaultCrypto.ts';

describe('vaultCrypto', () => {
  it('round-trips encrypted JSON and verifies master password', async () => {
    const salt = generateSalt();
    const key = await deriveVaultKey('test-master-password', salt, 100_000);
    const blob = await encryptJson(key, { title: 'secret', password: 'p@ss' });
    const plain = await decryptJson<{ title: string; password: string }>(key, blob);
    assert.equal(plain.title, 'secret');
    assert.equal(plain.password, 'p@ss');

    const verifier = await createVerifier(key);
    assert.equal(await verifyMasterPassword(key, verifier), true);

    const wrongKey = await deriveVaultKey('wrong-password', salt, 100_000);
    assert.equal(await verifyMasterPassword(wrongKey, verifier), false);
  });

  it('uses the configured default iteration count', () => {
    assert.equal(VAULT_KDF_ITERATIONS, 600_000);
  });
});
