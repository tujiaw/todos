import type {
  BitwardenExport,
  BitwardenItem,
  VaultCustomField,
  VaultItemPlain,
  VaultItemType,
  VaultMergeEntry,
  VaultMergePlan,
} from '../types';

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseTimestamp(value?: string | null, fallback = Date.now()): number {
  if (!value) return fallback;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : fallback;
}

function mapCustomFields(
  fields: BitwardenItem['fields']
): VaultCustomField[] | undefined {
  if (!fields?.length) return undefined;
  const mapped = fields
    .filter((field) => field.name || field.value)
    .map((field) => ({
      label: field.name?.trim() || 'Field',
      value: field.value ?? '',
      secret: field.type === 1,
    }));
  return mapped.length > 0 ? mapped : undefined;
}

function identityFullName(item: BitwardenItem): string {
  const identity = item.identity;
  if (!identity) return '';
  return [identity.firstName, identity.middleName, identity.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function identityExtraFields(item: BitwardenItem): VaultCustomField[] {
  const identity = item.identity;
  if (!identity) return [];

  const pairs: Array<[string, string | null | undefined]> = [
    ['Title', identity.title],
    ['Company', identity.company],
    ['Email', identity.email],
    ['Phone', identity.phone],
    ['Username', identity.username],
    ['SSN', identity.ssn],
    ['Passport', identity.passportNumber],
    ['License', identity.licenseNumber],
    ['Address1', identity.address1],
    ['Address2', identity.address2],
    ['Address3', identity.address3],
    ['City', identity.city],
    ['State', identity.state],
    ['Postal Code', identity.postalCode],
    ['Country', identity.country],
  ];

  return pairs
    .filter(([, value]) => Boolean(value && String(value).trim()))
    .map(([label, value]) => ({ label, value: String(value) }));
}

function fingerprintKey(item: VaultItemPlain): string {
  const title = normalizeTitle(item.title || '');
  if (item.type === 'login') {
    return `${item.type}|${title}|${(item.username || '').trim().toLowerCase()}`;
  }
  if (item.type === 'card') {
    const digits = (item.number || '').replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `${item.type}|${title}|${last4}`;
  }
  if (item.type === 'identity') {
    return `${item.type}|${title}|${(item.idNumber || '').trim().toLowerCase()}`;
  }
  return `${item.type}|${title}|`;
}

export function mapBitwardenItem(
  item: BitwardenItem,
  folderName?: string
): VaultItemPlain | null {
  if (item.deletedDate) return null;

  const now = Date.now();
  const createdAt = parseTimestamp(item.creationDate, now);
  const updatedAt = parseTimestamp(item.revisionDate, createdAt);
  const title = (item.name || 'Untitled').trim() || 'Untitled';
  const notes = item.notes?.trim() || undefined;
  const fields = mapCustomFields(item.fields);
  const base = {
    id: crypto.randomUUID(),
    title,
    externalId: item.id || undefined,
    notes,
    folder: folderName || undefined,
    fields,
    createdAt,
    updatedAt,
  };

  if (item.type === 1) {
    const login = item.login;
    return {
      ...base,
      type: 'login',
      username: login?.username || undefined,
      password: login?.password || undefined,
      url: login?.uris?.find((uri) => uri.uri)?.uri || undefined,
      totp: login?.totp || undefined,
    };
  }

  if (item.type === 2) {
    return { ...base, type: 'note' };
  }

  if (item.type === 3) {
    const card = item.card;
    return {
      ...base,
      type: 'card',
      cardholder: card?.cardholderName || undefined,
      number: card?.number || undefined,
      brand: card?.brand || undefined,
      expMonth: card?.expMonth || undefined,
      expYear: card?.expYear || undefined,
      cvv: card?.code || undefined,
    };
  }

  if (item.type === 4) {
    const identity = item.identity;
    const idNumber =
      identity?.ssn || identity?.passportNumber || identity?.licenseNumber || undefined;
    let idType: string | undefined;
    if (identity?.ssn) idType = 'SSN';
    else if (identity?.passportNumber) idType = 'Passport';
    else if (identity?.licenseNumber) idType = 'License';

    const extras = identityExtraFields(item);
    const mergedFields = [...(fields || []), ...extras];
    return {
      ...base,
      type: 'identity',
      fullName: identityFullName(item) || undefined,
      idNumber: idNumber || undefined,
      idType,
      fields: mergedFields.length > 0 ? mergedFields : undefined,
    };
  }

  // SSH keys and unknown types → note so data is not dropped.
  const summaryParts = [`Bitwarden type: ${item.type}`];
  if (item.login) summaryParts.push(`login: ${JSON.stringify(item.login)}`);
  if (item.card) summaryParts.push(`card: ${JSON.stringify(item.card)}`);
  if (item.identity) summaryParts.push(`identity: ${JSON.stringify(item.identity)}`);
  if ((item as { sshKey?: unknown }).sshKey) {
    summaryParts.push(`sshKey: ${JSON.stringify((item as { sshKey?: unknown }).sshKey)}`);
  }

  const fallbackNotes = [notes, summaryParts.join('\n')].filter(Boolean).join('\n\n');
  return {
    ...base,
    type: 'note',
    notes: fallbackNotes || undefined,
  };
}

export function parseBitwardenExport(raw: unknown): VaultItemPlain[] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('无效的 Bitwarden 导出文件。');
  }

  const data = raw as BitwardenExport;
  if (data.encrypted === true) {
    throw new Error('不支持加密的 Bitwarden 导出，请导出「JSON（未加密）」。');
  }
  if (!Array.isArray(data.items)) {
    throw new Error('未找到 items 数组。请使用 Bitwarden 未加密 JSON 导出。');
  }

  const folderMap = new Map<string, string>();
  for (const folder of data.folders || []) {
    if (folder?.id && folder.name) folderMap.set(folder.id, folder.name);
  }

  const mapped: VaultItemPlain[] = [];
  for (const item of data.items) {
    if (!item || typeof item.type !== 'number') continue;
    const folderName = item.folderId ? folderMap.get(item.folderId) : undefined;
    const plain = mapBitwardenItem(item, folderName);
    if (plain) mapped.push(plain);
  }

  return mapped;
}

export function buildVaultMergePlan(
  existingItems: VaultItemPlain[],
  incomingItems: VaultItemPlain[]
): VaultMergePlan {
  const byExternalId = new Map<string, VaultItemPlain>();
  const byFingerprint = new Map<string, VaultItemPlain>();

  for (const item of existingItems) {
    if (item.externalId) byExternalId.set(item.externalId, item);
    byFingerprint.set(fingerprintKey(item), item);
  }

  const adds: VaultMergeEntry[] = [];
  const updates: VaultMergeEntry[] = [];
  const skips: VaultMergeEntry[] = [];

  for (const incoming of incomingItems) {
    let match: VaultItemPlain | undefined;
    let matchReason = '';

    if (incoming.externalId && byExternalId.has(incoming.externalId)) {
      match = byExternalId.get(incoming.externalId);
      matchReason = 'externalId';
    } else {
      const fp = fingerprintKey(incoming);
      match = byFingerprint.get(fp);
      if (match) matchReason = 'fingerprint';
    }

    if (!match) {
      adds.push({
        action: 'add',
        reason: 'new item',
        incoming,
      });
      continue;
    }

    if (incoming.updatedAt < match.updatedAt) {
      skips.push({
        action: 'skip',
        reason: `incoming older than local (${matchReason})`,
        incoming,
        existing: match,
      });
      continue;
    }

    const merged: VaultItemPlain = {
      ...incoming,
      id: match.id,
      createdAt: match.createdAt,
      updatedAt: Math.max(incoming.updatedAt, match.updatedAt),
      externalId: incoming.externalId || match.externalId,
    };

    updates.push({
      action: 'update',
      reason: matchReason,
      incoming: merged,
      existing: match,
    });
  }

  return { adds, updates, skips };
}

export function vaultItemTypeLabel(type: VaultItemType): string {
  if (type === 'login') return '登录';
  if (type === 'card') return '银行卡';
  if (type === 'identity') return '证件';
  if (type === 'note') return '笔记';
  return '自定义';
}
