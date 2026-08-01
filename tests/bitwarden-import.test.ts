import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { VaultItemPlain } from '../src/types.ts';
import {
  buildVaultMergePlan,
  mapBitwardenItem,
  parseBitwardenExport,
} from '../src/utils/bitwardenImport.ts';

describe('parseBitwardenExport', () => {
  it('rejects encrypted exports', () => {
    assert.throws(
      () => parseBitwardenExport({ encrypted: true, items: [] }),
      /Unencrypted/
    );
  });

  it('maps login card identity note and folders', () => {
    const items = parseBitwardenExport({
      encrypted: false,
      folders: [{ id: 'f1', name: 'Work' }],
      items: [
        {
          id: 'bw-login',
          type: 1,
          name: 'Gmail',
          folderId: 'f1',
          notes: 'primary',
          revisionDate: '2024-01-02T00:00:00.000Z',
          creationDate: '2024-01-01T00:00:00.000Z',
          login: {
            username: 'a@b.com',
            password: 'secret',
            totp: 'otpauth://totp/test',
            uris: [{ uri: 'https://mail.google.com' }],
          },
          fields: [{ name: 'pin', value: '1234', type: 1 }],
        },
        {
          id: 'bw-note',
          type: 2,
          name: 'Secret note',
          notes: 'hello',
          secureNote: {},
        },
        {
          id: 'bw-card',
          type: 3,
          name: 'Visa',
          card: {
            cardholderName: 'Ada',
            number: '4111111111111111',
            brand: 'Visa',
            expMonth: '12',
            expYear: '2030',
            code: '123',
          },
        },
        {
          id: 'bw-id',
          type: 4,
          name: 'Passport',
          identity: {
            firstName: 'Ada',
            lastName: 'Lovelace',
            passportNumber: 'P123',
            email: 'ada@example.com',
          },
        },
      ],
    });

    assert.equal(items.length, 4);

    const login = items.find((item) => item.externalId === 'bw-login');
    assert.ok(login);
    assert.equal(login.type, 'login');
    assert.equal(login.folder, 'Work');
    assert.equal(login.username, 'a@b.com');
    assert.equal(login.url, 'https://mail.google.com');
    assert.equal(login.totp, 'otpauth://totp/test');
    assert.equal(login.fields?.[0]?.secret, true);

    const card = items.find((item) => item.externalId === 'bw-card');
    assert.ok(card);
    assert.equal(card.type, 'card');
    assert.equal(card.cvv, '123');

    const identity = items.find((item) => item.externalId === 'bw-id');
    assert.ok(identity);
    assert.equal(identity.type, 'identity');
    assert.equal(identity.fullName, 'Ada Lovelace');
    assert.equal(identity.idNumber, 'P123');
    assert.ok(identity.fields?.some((field) => field.label === 'Email'));

    const note = items.find((item) => item.externalId === 'bw-note');
    assert.ok(note);
    assert.equal(note.type, 'note');
  });

  it('skips deleted items and demotes unknown types to notes', () => {
    const deleted = mapBitwardenItem({
      id: 'x',
      type: 1,
      name: 'gone',
      deletedDate: '2024-01-01T00:00:00.000Z',
      login: {},
    });
    assert.equal(deleted, null);

    const ssh = mapBitwardenItem({
      id: 'ssh1',
      type: 5,
      name: 'Deploy key',
      notes: 'prod',
    });
    assert.ok(ssh);
    assert.equal(ssh.type, 'note');
    assert.match(ssh.notes || '', /Bitwarden type: 5/);
  });
});

describe('buildVaultMergePlan', () => {
  const local: VaultItemPlain = {
    id: 'local-1',
    type: 'login',
    title: 'Gmail',
    externalId: 'bw-login',
    username: 'a@b.com',
    password: 'old',
    createdAt: 1,
    updatedAt: 100,
  };

  it('adds new items', () => {
    const plan = buildVaultMergePlan([], [
      {
        id: 'tmp',
        type: 'note',
        title: 'New',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    assert.equal(plan.adds.length, 1);
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.skips.length, 0);
  });

  it('updates by externalId when incoming is newer', () => {
    const plan = buildVaultMergePlan([local], [
      {
        ...local,
        id: 'tmp',
        password: 'new',
        updatedAt: 200,
      },
    ]);
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].incoming.id, 'local-1');
    assert.equal(plan.updates[0].incoming.password, 'new');
  });

  it('skips older externalId matches', () => {
    const plan = buildVaultMergePlan([local], [
      {
        ...local,
        id: 'tmp',
        password: 'older',
        updatedAt: 50,
      },
    ]);
    assert.equal(plan.skips.length, 1);
    assert.equal(plan.updates.length, 0);
  });

  it('matches by fingerprint when externalId missing', () => {
    const plan = buildVaultMergePlan(
      [{ ...local, externalId: undefined }],
      [
        {
          id: 'tmp',
          type: 'login',
          title: 'Gmail',
          username: 'a@b.com',
          password: 'merged',
          createdAt: 1,
          updatedAt: 200,
        },
      ]
    );
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].reason, 'fingerprint');
  });
});
