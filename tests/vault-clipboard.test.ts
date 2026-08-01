import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { VaultItemPlain } from '../src/types.ts';
import {
  formatVaultItemForCopy,
  normalizeVaultUrl,
} from '../src/utils/vaultClipboard.ts';

describe('formatVaultItemForCopy', () => {
  it('formats login items in a readable layout', () => {
    const item: VaultItemPlain = {
      id: '1',
      type: 'login',
      title: 'Gmail',
      folder: 'Work',
      username: 'a@b.com',
      password: 'secret',
      url: 'https://mail.google.com',
      totp: 'otpauth://totp/test',
      notes: 'primary account',
      fields: [{ label: 'pin', value: '1234' }],
      createdAt: 1,
      updatedAt: 1,
    };

    const text = formatVaultItemForCopy(item);
    assert.match(text, /Title: Gmail/);
    assert.match(text, /Type: Login/);
    assert.match(text, /Username: a@b.com/);
    assert.match(text, /Password: secret/);
    assert.match(text, /URL: https:\/\/mail\.google\.com/);
    assert.match(text, /Custom fields/);
    assert.match(text, /pin: 1234/);
    assert.match(text, /Notes\nprimary account/);
  });

  it('formats card expiry as month/year', () => {
    const text = formatVaultItemForCopy({
      id: '2',
      type: 'card',
      title: 'Visa',
      number: '4111',
      expMonth: '12',
      expYear: '2030',
      createdAt: 1,
      updatedAt: 1,
    });
    assert.match(text, /Expires: 12\/2030/);
  });
});

describe('normalizeVaultUrl', () => {
  it('adds https when protocol is missing', () => {
    assert.equal(normalizeVaultUrl('example.com/login'), 'https://example.com/login');
  });

  it('keeps existing protocols', () => {
    assert.equal(normalizeVaultUrl('https://a.com'), 'https://a.com');
    assert.equal(normalizeVaultUrl('http://a.com'), 'http://a.com');
  });

  it('returns null for empty values', () => {
    assert.equal(normalizeVaultUrl('  '), null);
  });
});
