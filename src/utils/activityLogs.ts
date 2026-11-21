import type { AdminRole, AuditLogRecord } from '../types/admin';

export type ActivityCategory =
  | 'all'
  | 'auth'
  | 'orders'
  | 'settings'
  | 'finance'
  | 'content'
  | 'security';

export type ActivityTone = 'neutral' | 'info' | 'success' | 'warning';

export interface ActivityActionMeta {
  code: string;
  label: string;
  category: Exclude<ActivityCategory, 'all'>;
  categoryLabel: string;
  tone: ActivityTone;
}

export interface ActivityFilterState {
  search: string;
  category: ActivityCategory;
  action: string;
  role: 'ALL' | AdminRole;
  actorId: string;
  dateFrom: string; // YYYY-MM-DD or empty
  dateTo: string;   // YYYY-MM-DD or empty
  sortOrder: 'newest' | 'oldest';
}

export const DEFAULT_ACTIVITY_FILTER: ActivityFilterState = {
  search: '',
  category: 'all',
  action: 'ALL',
  role: 'ALL',
  actorId: 'ALL',
  dateFrom: '',
  dateTo: '',
  sortOrder: 'newest'
};

export const ACTIVITY_CATEGORIES: Array<{
  id: ActivityCategory;
  label: string;
}> = [
  { id: 'all', label: 'Semua' },
  { id: 'auth', label: 'Autentikasi' },
  { id: 'orders', label: 'Transaksi' },
  { id: 'settings', label: 'Pengaturan & Biaya' },
  { id: 'finance', label: 'Keuangan & Gaji' },
  { id: 'content', label: 'Banner' },
  { id: 'security', label: 'Keamanan & Staf' }
];

const ACTION_CATALOG: Record<string, Omit<ActivityActionMeta, 'code'>> = {
  OWNER_BOOTSTRAP: {
    label: 'Aktivasi Akun Owner',
    category: 'auth',
    categoryLabel: 'Autentikasi',
    tone: 'info'
  },
  OWNER_SSO_LOGIN: {
    label: 'Login Langsung Owner (Google)',
    category: 'auth',
    categoryLabel: 'Autentikasi',
    tone: 'success'
  },
  LOGIN_SUCCESS: {
    label: 'Login Panel Admin',
    category: 'auth',
    categoryLabel: 'Autentikasi',
    tone: 'success'
  },
  LOGOUT: {
    label: 'Keluar Sesi Admin',
    category: 'auth',
    categoryLabel: 'Autentikasi',
    tone: 'neutral'
  },
  TOTP_ENABLED: {
    label: 'Aktivasi TOTP 2FA',
    category: 'auth',
    categoryLabel: 'Autentikasi',
    tone: 'success'
  },
  TOTP_DISABLED: {
    label: 'Nonaktifkan TOTP 2FA',
    category: 'auth',
    categoryLabel: 'Autentikasi',
    tone: 'warning'
  },
  PASSWORD_CHANGED: {
    label: 'Perubahan Sandi Akun',
    category: 'auth',
    categoryLabel: 'Autentikasi',
    tone: 'info'
  },
  ORDER_STATUS_UPDATE: {
    label: 'Pembaruan Status Transaksi',
    category: 'orders',
    categoryLabel: 'Transaksi',
    tone: 'info'
  },
  ORDER_BULK_CONFIRM: {
    label: 'Konfirmasi Massal Transaksi',
    category: 'orders',
    categoryLabel: 'Transaksi',
    tone: 'success'
  },
  SETTINGS_UPDATED: {
    label: 'Pengaturan Biaya & Kebijakan',
    category: 'settings',
    categoryLabel: 'Pengaturan & Biaya',
    tone: 'warning'
  },
  PAYOUT_ACCOUNT_SAVED: {
    label: 'Perubahan Rekening Pencairan',
    category: 'finance',
    categoryLabel: 'Keuangan & Gaji',
    tone: 'warning'
  },
  PAYROLL_DRAFT_CREATED: {
    label: 'Pembuatan Draf Gaji',
    category: 'finance',
    categoryLabel: 'Keuangan & Gaji',
    tone: 'info'
  },
  PAYROLL_DISBURSED: {
    label: 'Pencairan Gaji Karyawan',
    category: 'finance',
    categoryLabel: 'Keuangan & Gaji',
    tone: 'success'
  },
  BANNER_SAVED: {
    label: 'Simpan Banner Promo',
    category: 'content',
    categoryLabel: 'Banner',
    tone: 'info'
  },
  BANNER_DELETED: {
    label: 'Hapus Banner Promo',
    category: 'content',
    categoryLabel: 'Banner',
    tone: 'warning'
  },
  VIOLATION_APPROVED_BILLING: {
    label: 'Persetujuan Tagihan Pelanggaran',
    category: 'security',
    categoryLabel: 'Keamanan & Staf',
    tone: 'warning'
  },
  VIOLATION_PARDONED: {
    label: 'Pengampunan Kasus Pelanggaran',
    category: 'security',
    categoryLabel: 'Keamanan & Staf',
    tone: 'success'
  },
  VIOLATION_CANCELLED: {
    label: 'Pembatalan Kasus Pelanggaran',
    category: 'security',
    categoryLabel: 'Keamanan & Staf',
    tone: 'neutral'
  },
  STAFF_CREATED: {
    label: 'Pembuatan Akun Staf',
    category: 'security',
    categoryLabel: 'Keamanan & Staf',
    tone: 'info'
  },
  STAFF_ACTIVATED: {
    label: 'Aktivasi Akun Staf',
    category: 'security',
    categoryLabel: 'Keamanan & Staf',
    tone: 'success'
  },
  STAFF_DEACTIVATED: {
    label: 'Penonaktifan Akun Staf',
    category: 'security',
    categoryLabel: 'Keamanan & Staf',
    tone: 'warning'
  },
  IP_UNBLOCKED: {
    label: 'Pembukaan Blokir IP/Perangkat',
    category: 'security',
    categoryLabel: 'Keamanan & Staf',
    tone: 'info'
  }
};

export function getActivityActionMeta(actionCode: string): ActivityActionMeta {
  const normalized = (actionCode || '').trim().toUpperCase();
  const known = ACTION_CATALOG[normalized];
  if (known) {
    return { code: normalized, ...known };
  }

  if (normalized.includes('LOGIN') || normalized.includes('LOGOUT') || normalized.includes('PASSWORD') || normalized.includes('TOTP')) {
    return {
      code: normalized,
      label: normalized.replace(/_/g, ' '),
      category: 'auth',
      categoryLabel: 'Autentikasi',
      tone: 'info'
    };
  }
  if (normalized.includes('ORDER')) {
    return {
      code: normalized,
      label: normalized.replace(/_/g, ' '),
      category: 'orders',
      categoryLabel: 'Transaksi',
      tone: 'info'
    };
  }
  if (normalized.includes('SETTING') || normalized.includes('FEE')) {
    return {
      code: normalized,
      label: normalized.replace(/_/g, ' '),
      category: 'settings',
      categoryLabel: 'Pengaturan & Biaya',
      tone: 'warning'
    };
  }
  if (normalized.includes('PAYROLL') || normalized.includes('PAYOUT')) {
    return {
      code: normalized,
      label: normalized.replace(/_/g, ' '),
      category: 'finance',
      categoryLabel: 'Keuangan & Gaji',
      tone: 'info'
    };
  }
  if (normalized.includes('BANNER')) {
    return {
      code: normalized,
      label: normalized.replace(/_/g, ' '),
      category: 'content',
      categoryLabel: 'Banner',
      tone: 'info'
    };
  }
  return {
    code: normalized || 'UNKNOWN',
    label: normalized ? normalized.replace(/_/g, ' ') : 'Aksi Sistem',
    category: 'security',
    categoryLabel: 'Keamanan & Staf',
    tone: 'neutral'
  };
}

export function getTargetTypeLabel(targetType: string): string {
  switch (targetType) {
    case 'session':
      return 'Sesi';
    case 'admin_user':
      return 'Akun Staf';
    case 'order':
      return 'Pesanan';
    case 'order_batch':
      return 'Batch Pesanan';
    case 'admin_settings':
      return 'Pengaturan';
    case 'payout_account':
      return 'Rekening';
    case 'payroll':
      return 'Gaji';
    case 'banner':
      return 'Banner';
    case 'violation_case':
      return 'Kasus Pelanggaran';
    case 'ip_block':
      return 'Blokir IP';
    default:
      return targetType || 'Sistem';
  }
}

export function parseDateBoundaryMs(dateStr: string, boundary: 'start' | 'end'): number | null {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt =
    boundary === 'start'
      ? new Date(y, m - 1, d, 0, 0, 0, 0)
      : new Date(y, m - 1, d, 23, 59, 59, 999);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function filterActivityLogs(
  logs: readonly AuditLogRecord[],
  filter: ActivityFilterState
): AuditLogRecord[] {
  const query = filter.search.trim().toLowerCase();
  const fromMs = parseDateBoundaryMs(filter.dateFrom, 'start');
  const toMs = parseDateBoundaryMs(filter.dateTo, 'end');

  const matched = logs.filter((log) => {
    const meta = getActivityActionMeta(log.action);

    if (filter.category !== 'all' && meta.category !== filter.category) {
      return false;
    }

    if (filter.action !== 'ALL' && log.action !== filter.action) {
      return false;
    }

    if (filter.role !== 'ALL' && log.actorRole !== filter.role) {
      return false;
    }

    if (filter.actorId !== 'ALL' && log.actorId !== filter.actorId) {
      return false;
    }

    if (fromMs !== null && log.createdAtMs < fromMs) {
      return false;
    }

    if (toMs !== null && log.createdAtMs > toMs) {
      return false;
    }

    if (query) {
      const haystack = [
        log.id,
        log.actorName,
        log.actorEmail || '',
        log.actorId,
        log.actorRole,
        log.action,
        meta.label,
        meta.categoryLabel,
        log.targetType,
        getTargetTypeLabel(log.targetType),
        log.targetId,
        log.details,
        log.ipAddress
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });

  return matched.sort((a, b) =>
    filter.sortOrder === 'oldest' ? a.createdAtMs - b.createdAtMs : b.createdAtMs - a.createdAtMs
  );
}

export function extractDistinctActors(
  logs: readonly AuditLogRecord[]
): Array<{ actorId: string; actorName: string; actorRole: AdminRole; actorEmail?: string | null }> {
  const map = new Map<
    string,
    { actorId: string; actorName: string; actorRole: AdminRole; actorEmail?: string | null }
  >();
  for (const log of logs) {
    if (!map.has(log.actorId)) {
      map.set(log.actorId, {
        actorId: log.actorId,
        actorName: log.actorName,
        actorRole: log.actorRole,
        actorEmail: log.actorEmail ?? null
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.actorName.localeCompare(b.actorName, 'id'));
}

export function extractDistinctActions(logs: readonly AuditLogRecord[]): ActivityActionMeta[] {
  const map = new Map<string, ActivityActionMeta>();
  for (const log of logs) {
    const meta = getActivityActionMeta(log.action);
    if (!map.has(meta.code)) {
      map.set(meta.code, meta);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'id'));
}

export function paginateActivityLogs<T>(
  items: readonly T[],
  page: number,
  pageSize: number
): {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
} {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(page)));
  const start = (safePage - 1) * safePageSize;
  const sliced = items.slice(start, start + safePageSize);
  return {
    items: sliced,
    page: safePage,
    totalPages,
    totalItems,
    startIndex: totalItems === 0 ? 0 : start + 1,
    endIndex: start + sliced.length
  };
}

/**
 * Escapes a single CSV field and neutralizes formula injection prefixes (=, +, -, @, tab, CR)
 * so exported logs are safe when opened in spreadsheet software.
 */
export function escapeCsvCell(value: string): string {
  let text = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildActivityLogsCsv(logs: readonly AuditLogRecord[]): string {
  const headers = [
    'ID Log',
    'Waktu (ISO)',
    'Nama Aktor',
    'Email Aktor',
    'Peran',
    'Kategori',
    'Aksi',
    'Kode Aksi',
    'Tipe Target',
    'ID Target',
    'Rincian',
    'Alamat IP'
  ];

  const rows = logs.map((log) => {
    const meta = getActivityActionMeta(log.action);
    return [
      log.id,
      new Date(log.createdAtMs).toISOString(),
      log.actorName,
      log.actorEmail || '',
      log.actorRole,
      meta.categoryLabel,
      meta.label,
      log.action,
      getTargetTypeLabel(log.targetType),
      log.targetId,
      log.details,
      log.ipAddress
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}
