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
      label: field.name?.trim() || '字段',
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
    ['标题', identity.title],
    ['公司', identity.company],
    ['邮箱', identity.email],
    ['电话', identity.phone],
    ['用户名', identity.username],
    ['社会保障号码', identity.ssn],
    ['护照', identity.passportNumber],
    ['驾照', identity.licenseNumber],
    ['地址一', identity.address1],
    ['地址二', identity.address2],
    ['地址三', identity.address3],
    ['城市', identity.city],
    ['省／州', identity.state],
    ['邮政编码', identity.postalCode],
    ['国家', identity.country],
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
  const title = (item.name || '未命名').trim() || '未命名';
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
    if (identity?.ssn) idType = '社会保障号码';
    else if (identity?.passportNumber) idType = '护照';
    else if (identity?.licenseNumber) idType = '驾照';

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
  const summaryParts = [`Bitwarden 类型： ${item.type}`];
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
    throw new Error('Bitwarden 导出文件无效。');
  }

  const data = raw as BitwardenExport;
  if (data.encrypted === true) {
    throw new Error(
      '不支持加密的 Bitwarden 导出文件，请导出为“JSON（未加密）”。'
    );
  }
  if (!Array.isArray(data.items)) {
    throw new Error('未找到条目数据，请使用未加密的 Bitwarden JSON 导出文件。');
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
        reason: '新条目',
        incoming,
      });
      continue;
    }

    if (incoming.updatedAt < match.updatedAt) {
      skips.push({
        action: 'skip',
        reason: `导入数据早于本地数据（${matchReason}）`,
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
  if (type === 'identity') return '身份';
  if (type === 'note') return '笔记';
  return '自定义';
}
