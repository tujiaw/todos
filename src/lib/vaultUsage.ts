const USAGE_KEY = 'vault_recent_usage';

export type VaultUsageMap = Record<string, number>;

export function loadVaultUsage(): VaultUsageMap {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const map: VaultUsageMap = {};
    for (const [id, timestamp] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
        map[id] = timestamp;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function saveVaultUsage(map: VaultUsageMap): void {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function markVaultItemUsed(id: string): void {
  const map = loadVaultUsage();
  map[id] = Date.now();
  saveVaultUsage(map);
}

export function removeVaultUsage(id: string): void {
  const map = loadVaultUsage();
  if (!(id in map)) return;
  delete map[id];
  saveVaultUsage(map);
}

/** 清理已不存在条目的记录并返回清理后的映射，防止 localStorage 无限膨胀。 */
export function pruneVaultUsage(existingIds: Iterable<string>): VaultUsageMap {
  const valid = new Set(existingIds);
  const map = loadVaultUsage();
  const pruned: VaultUsageMap = {};
  for (const [id, timestamp] of Object.entries(map)) {
    if (valid.has(id)) pruned[id] = timestamp;
  }
  saveVaultUsage(pruned);
  return pruned;
}
