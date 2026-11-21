export type RouteGateMode = 'checking' | 'storefront' | 'admin_portal' | 'not_found' | 'access_denied';

export function normalizePathname(rawPathname: string | null | undefined): string {
  const cleaned = (rawPathname || '').trim().replace(/\/+$/, '');
  return cleaned || '/';
}

/**
 * Determines whether the client should invoke POST /api/gate/check for the current pathname.
 * Prevents redundant or destructive gate checks when:
 * - On the public root storefront ('/')
 * - Firebase Auth has not finished initializing yet
 * - Already actively inside the admin_portal route mode (e.g. while signing in via Google inside AdminLoginView)
 */
export function shouldRunServerGateCheck(params: {
  pathname: string;
  authReady: boolean;
  routeMode: RouteGateMode;
  hasActiveAdminSession: boolean;
}): boolean {
  const normalized = normalizePathname(params.pathname);
  if (normalized === '/') return false;
  if (!params.authReady) return false;
  if (params.routeMode === 'admin_portal' && params.hasActiveAdminSession) {
    return false;
  }
  return true;
}

/**
 * Computes the next route mode after a browser popstate navigation.
 */
export function resolvePopstateRouteMode(nextPathname: string): RouteGateMode {
  return normalizePathname(nextPathname) === '/' ? 'storefront' : 'checking';
}
