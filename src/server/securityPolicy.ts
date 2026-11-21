import type { AdminPermission, AdminRole } from '../types/admin';

export const DEFAULT_ADMIN_PATH = '/masuk-alstore-x7';
export const DEFAULT_VIOLATION_FEE_IDR = 90_000;
export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const LOCKOUT_15M_MS = 15 * 60 * 1000;
export const LOCKOUT_1H_MS = 60 * 60 * 1000;
export const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

export const GENERIC_LOGIN_ERROR = 'Sandi salah';
export const ACCESS_DENIED_WARNING_MESSAGE =
  'Percobaan akses tidak sah dicatat dan dapat dikenai sanksi sesuai ketentuan ALSTORE.';

export const DEFAULT_OWNER_SSO_EMAILS: readonly string[] = [
  'alfathadiputra24@gmail.com',
  'alfathgeminipro@gmail.com'
];

export type AdminSessionAuthMethod = 'password' | 'firebase_sso';

export function getAllowedOwnerSsoEmails(envValue = process.env.ADMIN_OWNER_EMAILS): ReadonlySet<string> {
  const allowed = new Set<string>(DEFAULT_OWNER_SSO_EMAILS.map((e) => e.trim().toLowerCase()));
  if (typeof envValue === 'string' && envValue.trim()) {
    for (const part of envValue.split(',')) {
      const normalized = part.trim().toLowerCase();
      if (normalized && normalized.includes('@')) {
        allowed.add(normalized);
      }
    }
  }
  return allowed;
}

export function isAllowlistedOwnerEmail(
  email: string | null | undefined,
  emailVerified: boolean,
  envValue = process.env.ADMIN_OWNER_EMAILS
): boolean {
  if (!emailVerified || !email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return false;
  return getAllowedOwnerSsoEmails(envValue).has(normalized);
}

export function shouldRequireTotpEnrollment(params: {
  role: AdminRole;
  totpEnabled: boolean;
  authMethod: AdminSessionAuthMethod;
  totpOptedOut?: boolean;
}): boolean {
  if (params.authMethod === 'firebase_sso') return false;
  if (params.totpOptedOut) return false;
  return params.role === 'OWNER' && !params.totpEnabled;
}

export const DECOY_ADMIN_PATHS = new Set([
  '/admin',
  '/administrator',
  '/panel-admin',
  '/wp-admin',
  '/dashboard-admin',
  '/cms-admin'
]);

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  OWNER: new Set<AdminPermission>([
    'dashboard:view',
    'orders:view',
    'orders:confirm',
    'orders:bulk_confirm',
    'banners:manage',
    'payout_accounts:view',
    'payout_accounts:manage',
    'finance:view',
    'payroll:view',
    'payroll:prepare',
    'payroll:disburse',
    'staff:manage',
    'violations:manage',
    'security_logs:view',
    'activity_logs:view',
    'settings:manage'
  ]),
  ADMIN: new Set<AdminPermission>([
    'dashboard:view',
    'orders:view',
    'orders:confirm',
    'orders:bulk_confirm',
    'banners:manage'
  ]),
  KEUANGAN: new Set<AdminPermission>([
    'dashboard:view',
    'orders:view',
    'payout_accounts:view',
    'finance:view',
    'payroll:view',
    'payroll:prepare',
    'activity_logs:view'
  ])
};

export function hasRolePermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function normalizeAdminPath(rawPath?: string | null): string {
  const trimmed = (rawPath || '').trim();
  if (!trimmed) return DEFAULT_ADMIN_PATH;
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const cleaned = withSlash.replace(/\/+$/, '');
  if (!cleaned || cleaned === '/' || cleaned.startsWith('/api') || cleaned.startsWith('/assets')) {
    return DEFAULT_ADMIN_PATH;
  }
  return cleaned;
}

export interface LockoutEvaluation {
  lockDurationMs: number;
  lockUntilMs: number | null;
  requireCaptcha: boolean;
  triggerOwnerAlert: boolean;
  blockIpAndDevice: boolean;
  openViolationCase: boolean;
  tier: 'none' | 'lock_15m_captcha' | 'lock_1h_alert' | 'ip_device_blocked';
}

/**
 * Progressive lockout & intrusion enforcement policy:
 * - 3x failed attempts: 15-minute lock + CAPTCHA required
 * - 5x failed attempts: 1-hour lock + Owner alert (Email/Telegram + in-app)
 * - 10x failed attempts OR 3x blocked admin path accesses in 24h:
 *   Block IP & device + open "Kasus Pelanggaran Akses"
 */
export function evaluateIntrusionPolicy(params: {
  failedLoginCount24h: number;
  blockedPathCount24h: number;
  nowMs: number;
}): LockoutEvaluation {
  const { failedLoginCount24h, blockedPathCount24h, nowMs } = params;

  if (failedLoginCount24h >= 10 || blockedPathCount24h >= 3) {
    return {
      lockDurationMs: WINDOW_24H_MS,
      lockUntilMs: nowMs + WINDOW_24H_MS,
      requireCaptcha: true,
      triggerOwnerAlert: true,
      blockIpAndDevice: true,
      openViolationCase: true,
      tier: 'ip_device_blocked'
    };
  }

  if (failedLoginCount24h >= 5) {
    return {
      lockDurationMs: LOCKOUT_1H_MS,
      lockUntilMs: nowMs + LOCKOUT_1H_MS,
      requireCaptcha: true,
      triggerOwnerAlert: true,
      blockIpAndDevice: false,
      openViolationCase: false,
      tier: 'lock_1h_alert'
    };
  }

  if (failedLoginCount24h >= 3) {
    return {
      lockDurationMs: LOCKOUT_15M_MS,
      lockUntilMs: nowMs + LOCKOUT_15M_MS,
      requireCaptcha: true,
      triggerOwnerAlert: false,
      blockIpAndDevice: false,
      openViolationCase: false,
      tier: 'lock_15m_captcha'
    };
  }

  return {
    lockDurationMs: 0,
    lockUntilMs: null,
    requireCaptcha: false,
    triggerOwnerAlert: false,
    blockIpAndDevice: false,
    openViolationCase: false,
    tier: 'none'
  };
}

export interface ViolationEligibility {
  isRegisteredCustomer: boolean;
  billable: boolean;
  suspendAccount: boolean;
  initialStatus: 'pending_review' | 'anonymous_blocked';
}

/**
 * Violation fee (default Rp90.000) ONLY applies to registered customers (Google/Apple login)
 * and NEVER bills automatically without Owner review.
 * Anonymous visitors are blocked and logged only.
 */
export function evaluateViolationEligibility(customerUid: string | null | undefined): ViolationEligibility {
  const hasUid = Boolean(customerUid && customerUid.trim().length > 0);
  if (hasUid) {
    return {
      isRegisteredCustomer: true,
      billable: true,
      suspendAccount: true,
      initialStatus: 'pending_review'
    };
  }
  return {
    isRegisteredCustomer: false,
    billable: false,
    suspendAccount: false,
    initialStatus: 'anonymous_blocked'
  };
}

export function isSessionIdleExpired(
  lastActivityAtMs: number,
  nowMs = Date.now(),
  timeoutMs = SESSION_IDLE_TIMEOUT_MS
): boolean {
  return nowMs - lastActivityAtMs > timeoutMs;
}

export function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/qris-')) {
    return !trimmed.includes('..');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeHostValue(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return '';
  return cleaned.replace(/:(443|80)$/, '');
}

/**
 * Validates Origin against Host / X-Forwarded-Host behind reverse proxies (e.g. Cloud Run / AI Studio iframe).
 * - Allows missing Origin (non-CORS or direct server tools).
 * - Allows browser-verified same-origin fetches (`Sec-Fetch-Site: same-origin`) even when an internal proxy rewrites Host.
 * - Matches normalized Origin host against Host or any comma-separated X-Forwarded-Host entry.
 * - Rejects malformed Origins, non-http(s) schemes, and genuine cross-site origins.
 */
export function isAllowedAdminOrigin(params: {
  origin?: string | null;
  host?: string | null;
  forwardedHost?: string | null;
  secFetchSite?: string | null;
}): boolean {
  const rawOrigin = (params.origin || '').trim();
  if (!rawOrigin) return true;

  let originHost = '';
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    originHost = normalizeHostValue(parsed.host);
  } catch {
    return false;
  }

  if (!originHost) return false;

  const secFetchSite = (params.secFetchSite || '').trim().toLowerCase();
  if (secFetchSite === 'same-origin') {
    return true;
  }

  const candidateHosts = new Set<string>();
  const rawForwarded = (params.forwardedHost || '').trim();
  if (rawForwarded) {
    for (const part of rawForwarded.split(',')) {
      const normalized = normalizeHostValue(part);
      if (normalized) candidateHosts.add(normalized);
    }
  }
  const rawHost = normalizeHostValue(params.host || '');
  if (rawHost) {
    candidateHosts.add(rawHost);
  }

  if (candidateHosts.size === 0) return true;
  return candidateHosts.has(originHost);
}

/**
 * Extracts ordered, deduplicated admin session token candidates from a request.
 * Prioritizes the explicit in-memory `X-Admin-Session` header first, then inspects
 * every matching `<cookieName>=...` entry in the raw `Cookie` header (handling Chrome
 * Partitioned + legacy unpartitioned same-name cookie coexistence) and parsed cookie.
 */
export function extractSessionTokenCandidates(params: {
  headerToken?: string | null;
  parsedCookieToken?: string | null;
  rawCookieHeader?: string | null;
  cookieName: string;
}): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (raw: string | null | undefined) => {
    const trimmed = (raw || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  // 1. In-memory X-Admin-Session header is always the freshest token from the active tab
  pushUnique(params.headerToken);

  // 2. Parse ALL matching cookies from raw Cookie header so a stale legacy cookie
  // cannot shadow a newer Partitioned cookie with the same name
  const rawHeader = (params.rawCookieHeader || '').trim();
  if (rawHeader) {
    const prefix = `${params.cookieName}=`;
    for (const segment of rawHeader.split(';')) {
      const part = segment.trim();
      if (part.startsWith(prefix)) {
        const val = part.slice(prefix.length).trim();
        try {
          pushUnique(decodeURIComponent(val));
        } catch {
          pushUnique(val);
        }
      }
    }
  }

  // 3. Fallback to cookie-parser's parsed value
  pushUnique(params.parsedCookieToken);

  return candidates;
}


