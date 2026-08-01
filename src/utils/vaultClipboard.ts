import type { VaultItemPlain } from '../types';
import { vaultItemTypeLabel } from './bitwardenImport';

function pushLine(lines: string[], label: string, value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push(`${label}: ${trimmed}`);
}

/** Build a human-readable plain-text dump of a vault item for clipboard. */
export function formatVaultItemForCopy(item: VaultItemPlain): string {
  const lines: string[] = [];

  pushLine(lines, 'Title', item.title);
  pushLine(lines, 'Type', vaultItemTypeLabel(item.type));
  pushLine(lines, 'Folder', item.folder);

  if (item.type === 'login') {
    pushLine(lines, 'Username', item.username);
    pushLine(lines, 'Password', item.password);
    pushLine(lines, 'URL', item.url);
    pushLine(lines, 'TOTP', item.totp);
  } else if (item.type === 'card') {
    pushLine(lines, 'Cardholder', item.cardholder);
    pushLine(lines, 'Brand', item.brand);
    pushLine(lines, 'Number', item.number);
    if (item.expMonth || item.expYear) {
      const month = (item.expMonth || '').trim();
      const year = (item.expYear || '').trim();
      lines.push(`Expires: ${month}${month && year ? '/' : ''}${year}`);
    }
    pushLine(lines, 'CVV', item.cvv);
  } else if (item.type === 'identity') {
    pushLine(lines, 'Name', item.fullName);
    pushLine(lines, 'ID type', item.idType);
    pushLine(lines, 'ID number', item.idNumber);
  }

  if (item.fields?.length) {
    const fieldLines = item.fields
      .filter((field) => field.label?.trim() || field.value?.trim())
      .map((field) => {
        const label = field.label?.trim() || 'Field';
        const value = field.value?.trim() || '';
        return `${label}: ${value}`;
      });
    if (fieldLines.length > 0) {
      lines.push('');
      lines.push('Custom fields');
      for (const line of fieldLines) lines.push(line);
    }
  }

  const notes = item.notes?.trim();
  if (notes) {
    lines.push('');
    lines.push('Notes');
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
