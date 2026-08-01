import type { Category } from '../types';

/** Keep list order as source of truth: index 0 is default. */
export function normalizeCategoryOrder(categories: Category[]): Category[] {
  return categories.map((cat, index) => ({
    ...cat,
    sortOrder: index,
    isDefault: index === 0,
  }));
}

export function sortCategoriesByOrder(categories: Category[]): Category[] {
  // Stable sort: equal sortOrder keeps the current relative order.
  return categories
    .map((cat, index) => ({ cat, index }))
    .sort((a, b) => {
      const orderA = a.cat.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.cat.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    })
    .map(({ cat }) => cat);
}

export function moveCategory(
  categories: Category[],
  categoryId: string,
  direction: 'up' | 'down'
): Category[] | null {
  const index = categories.findIndex((cat) => cat.id === categoryId);
  if (index < 0) return null;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= categories.length) return null;

  const next = [...categories];
  const current = next[index];
  next[index] = next[target];
  next[target] = current;
  return normalizeCategoryOrder(next);
}

export function getDefaultCategoryId(categories: Category[]): string {
  const ordered = sortCategoriesByOrder(categories);
  return ordered.find((cat) => cat.isDefault)?.id || ordered[0]?.id || '';
}
