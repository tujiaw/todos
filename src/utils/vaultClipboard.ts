import type { VaultItemPlain } from '../types';
import { vaultItemTypeLabel } from './bitwardenImport';

function pushLine(lines: string[], label: string, value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push(`${label}：${trimmed}`);
}

/** Build a human-readable plain-text dump of a vault item for clipboard. */
export function formatVaultItemForCopy(item: VaultItemPlain): string {
  const lines: string[] = [];

  pushLine(lines, '标题', item.title);
  pushLine(lines, '类型', vaultItemTypeLabel(item.type));
  pushLine(lines, '文件夹', item.folder);

  if (item.type === 'login') {
    pushLine(lines, '用户名', item.username);
    pushLine(lines, '密码', item.password);
    pushLine(lines, '网址', item.url);
    pushLine(lines, 'TOTP', item.totp);
  } else if (item.type === 'card') {
    pushLine(lines, '持卡人', item.cardholder);
    pushLine(lines, '品牌', item.brand);
    pushLine(lines, '卡号', item.number);
    if (item.expMonth || item.expYear) {
      const month = (item.expMonth || '').trim();
      const year = (item.expYear || '').trim();
      lines.push(`有效期：${month}${month && year ? '/' : ''}${year}`);
    }
    pushLine(lines, 'CVV', item.cvv);
  } else if (item.type === 'identity') {
    pushLine(lines, '姓名', item.fullName);
    pushLine(lines, '证件类型', item.idType);
    pushLine(lines, '证件号', item.idNumber);
  }

  if (item.fields?.length) {
    const fieldLines = item.fields
      .filter((field) => field.label?.trim() || field.value?.trim())
      .map((field) => {
        const label = field.label?.trim() || '字段';
        const value = field.value?.trim() || '';
        return `${label}：${value}`;
      });
    if (fieldLines.length > 0) {
      lines.push('');
      lines.push('自定义字段');
      for (const line of fieldLines) lines.push(line);
    }
  }

  const notes = item.notes?.trim();
  if (notes) {
    lines.push('');
    lines.push('备注');
    lines.push(notes);
  }

  return lines.join('\n').trim();
}

/** Normalize a vault URL so window.open can navigate reliably. */
export function normalizeVaultUrl(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value;
  return `https://${value}`;
}
