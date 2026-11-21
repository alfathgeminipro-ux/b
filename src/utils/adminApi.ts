export class AdminApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.payload = payload;
  }
}

function getClientDeviceHint(): string {
  if (typeof window === 'undefined') return 'ssr';
  const parts = [
    navigator.platform || '',
    navigator.language || '',
    String(window.screen?.width || 0),
    String(window.screen?.height || 0),
    String(navigator.hardwareConcurrency || 0)
  ];
  return parts.join('|');
}

// Strictly in-memory session token (NEVER persisted in localStorage or sessionStorage).
// Acts as a secure fallback alongside the HttpOnly; Secure; SameSite=None; Partitioned cookie
// for browsers/iframes that strip or partition third-party cookies.
let inMemoryAdminSessionToken: string | null = null;

export function setAdminSessionToken(token: string | null | undefined): void {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  inMemoryAdminSessionToken = trimmed ? trimmed : null;
}

export function getAdminSessionToken(): string | null {
  return inMemoryAdminSessionToken;
}

function extractUrlPath(url: string): string {
  const qIndex = url.indexOf('?');
  return qIndex >= 0 ? url.slice(0, qIndex) : url;
}

export function shouldAttachAdminSessionHeader(url: string): boolean {
  const path = extractUrlPath(url);
  return path.startsWith('/api/admin') || path === '/api/gate/check';
}

const NON_SESSION_AUTH_PATHS = new Set([
  '/api/admin/auth/login',
  '/api/admin/auth/bootstrap-owner',
  '/api/admin/auth/firebase-sso',
  '/api/admin/auth/firebase-eligibility'
]);

/**
 * Only clear the in-memory admin session token when a session-authenticated
 * admin route returns 401. Never wipe a valid admin session just because an
 * unrelated Firebase bearer-token call (e.g. firebase-sso) returned 401.
 */
export function shouldClearAdminSessionOnError(url: string, status: number): boolean {
  if (status !== 401) return false;
  const path = extractUrlPath(url);
  if (!path.startsWith('/api/admin/')) return false;
  return !NON_SESSION_AUTH_PATHS.has(path);
}

export function syncSessionTokenFromPayload(url: string, data: Record<string, unknown>): void {
  const path = extractUrlPath(url);
  if (path === '/api/admin/auth/logout') {
    inMemoryAdminSessionToken = null;
    return;
  }
  if (typeof data.sessionToken === 'string' && data.sessionToken.trim()) {
    inMemoryAdminSessionToken = data.sessionToken.trim();
    return;
  }
  const nestedSession = data.session;
  if (nestedSession && typeof nestedSession === 'object') {
    const sessionObj = nestedSession as Record<string, unknown>;
    const nestedToken = sessionObj.sessionToken;
    if (typeof nestedToken === 'string' && nestedToken.trim()) {
      inMemoryAdminSessionToken = nestedToken.trim();
      return;
    }
    if (path === '/api/admin/auth/status' && sessionObj.authenticated === false) {
      inMemoryAdminSessionToken = null;
    }
  }
}

export async function adminFetch<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    bearerToken?: string | null;
  } = {}
): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'X-Alstore-Device': getClientDeviceHint()
  };

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['X-Requested-With'] = 'ALSTORE-Admin';
  }

  if (options.bearerToken) {
    headers.Authorization = `Bearer ${options.bearerToken}`;
  }

  if (inMemoryAdminSessionToken && shouldAttachAdminSessionHeader(url)) {
    headers['X-Admin-Session'] = inMemoryAdminSessionToken;
  }

  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (shouldClearAdminSessionOnError(url, response.status)) {
      inMemoryAdminSessionToken = null;
    }
    const message =
      typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : `Permintaan gagal (${response.status})`;
    throw new AdminApiError(message, response.status, data);
  }

  syncSessionTokenFromPayload(url, data);
  return data as T;
}

export function formatIdr(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

export function formatDateTimeId(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(ms));
}
