export type Priority = 'low' | 'medium' | 'high';
export type ThemeMode = 'light' | 'dark';

export interface Category {
  id: string;
  name: string;
  color: string; // Tailwind color name or hex code
  bgClass: string;
  textClass: string;
  borderClass: string;
  /** Lower comes first; index 0 is the default category. */
  sortOrder?: number;
  isDefault?: boolean;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD format
  completed: boolean;
  categoryId: string;
  priority: Priority;
  dueTime?: string; // e.g., "14:30"
  estimatedMinutes?: number;
  imageUrl?: string; // Image attachment (Base64 data URL or HTTP URL)
  subtasks: SubTask[];
  pinned?: boolean;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

export interface TaskDraft {
  title: string;
  description?: string;
  date: string;
  dueTime?: string;
  estimatedMinutes?: number;
  categoryId: string;
  priority: Priority;
  subtasks: string[];
}

export type TaskFilterStatus = 'all' | 'pending' | 'completed' | 'high_priority';

export type SortByOption = 'createdAt' | 'priority' | 'dueTime' | 'category';

export interface DailyStats {
  date: string;
  total: number;
  completed: number;
  completionRate: number;
}

export interface DropItem {
  id: string;
  content: string;
  url?: string;
  storage_path?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  type?: 'text' | 'link' | 'image' | 'file';
  created_at: string | number;
  expires_at?: string | number;
  user_id?: string;
}

export type VaultItemType = 'login' | 'card' | 'identity' | 'note' | 'custom';

export interface VaultCustomField {
  label: string;
  value: string;
  secret?: boolean;
}

/** Decrypted vault entry (memory only; never persisted in plaintext). */
export interface VaultItemPlain {
  id: string;
  type: VaultItemType;
  title: string;
  /** Bitwarden item.id for re-import merge. */
  externalId?: string;
  username?: string;
  password?: string;
  url?: string;
  totp?: string;
  cardholder?: string;
  number?: string;
  brand?: string;
  expMonth?: string;
  expYear?: string;
  cvv?: string;
  fullName?: string;
  idNumber?: string;
  idType?: string;
  notes?: string;
  folder?: string;
  fields?: VaultCustomField[];
  createdAt: number;
  updatedAt: number;
}

export interface VaultMetaRow {
  user_id: string;
  salt: string;
  verifier_ciphertext: string;
  verifier_iv: string;
  kdf_iterations: number;
  created_at?: string;
  updated_at?: string;
}

export interface VaultItemRow {
  id: string;
  user_id: string;
  type: VaultItemType;
  ciphertext: string;
  iv: string;
  updated_at: number;
}

/** Minimal Bitwarden unencrypted JSON shapes used for import. */
export interface BitwardenFolder {
  id: string;
  name: string;
}

export interface BitwardenField {
  name?: string;
  value?: string;
  type?: number;
}

export interface BitwardenItem {
  id?: string;
  folderId?: string | null;
  type: number;
  name?: string;
  notes?: string | null;
  favorite?: boolean;
  fields?: BitwardenField[] | null;
  login?: {
    username?: string | null;
    password?: string | null;
    totp?: string | null;
    uris?: Array<{ uri?: string | null; match?: number | null }> | null;
  } | null;
  card?: {
    cardholderName?: string | null;
    brand?: string | null;
    number?: string | null;
    expMonth?: string | null;
    expYear?: string | null;
    code?: string | null;
  } | null;
  identity?: {
    title?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    address1?: string | null;
    address2?: string | null;
    address3?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    ssn?: string | null;
    username?: string | null;
    passportNumber?: string | null;
    licenseNumber?: string | null;
  } | null;
  secureNote?: Record<string, unknown> | null;
  revisionDate?: string | null;
  creationDate?: string | null;
  deletedDate?: string | null;
}

export interface BitwardenExport {
  encrypted?: boolean;
  folders?: BitwardenFolder[];
  items?: BitwardenItem[];
}

export type VaultMergeAction = 'add' | 'update' | 'skip';

export interface VaultMergeEntry {
  action: VaultMergeAction;
  reason: string;
  incoming: VaultItemPlain;
  existing?: VaultItemPlain;
}

export interface VaultMergePlan {
  adds: VaultMergeEntry[];
  updates: VaultMergeEntry[];
  skips: VaultMergeEntry[];
}
