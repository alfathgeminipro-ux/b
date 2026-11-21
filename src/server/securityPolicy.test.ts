import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ADMIN_PATH,
  LOCKOUT_15M_MS,
  LOCKOUT_1H_MS,
  SESSION_IDLE_TIMEOUT_MS,
  evaluateIntrusionPolicy,
  evaluateViolationEligibility,
  extractSessionTokenCandidates,
  hasRolePermission,
  isAllowedAdminOrigin,
  isAllowlistedOwnerEmail,
  isSafeImageUrl,
  isSessionIdleExpired,
  normalizeAdminPath,
  shouldRequireTotpEnrollment
} from './securityPolicy';

test('progressive lockout escalates cleanly at 3, 5, and 10 failures or 3 blocked path hits', () => {
  const now = 1_763_750_000_000;

  const below = evaluateIntrusionPolicy({ failedLoginCount24h: 2, blockedPathCount24h: 0, nowMs: now });
  assert.equal(below.tier, 'none');
  assert.equal(below.requireCaptcha, false);

  const tier3 = evaluateIntrusionPolicy({ failedLoginCount24h: 3, blockedPathCount24h: 0, nowMs: now });
  assert.equal(tier3.tier, 'lock_15m_captcha');
  assert.equal(tier3.lockDurationMs, LOCKOUT_15M_MS);
  assert.equal(tier3.requireCaptcha, true);
  assert.equal(tier3.triggerOwnerAlert, false);

  const tier5 = evaluateIntrusionPolicy({ failedLoginCount24h: 5, blockedPathCount24h: 0, nowMs: now });
  assert.equal(tier5.tier, 'lock_1h_alert');
  assert.equal(tier5.lockDurationMs, LOCKOUT_1H_MS);
  assert.equal(tier5.triggerOwnerAlert, true);
  assert.equal(tier5.blockIpAndDevice, false);

  const tier10 = evaluateIntrusionPolicy({ failedLoginCount24h: 10, blockedPathCount24h: 0, nowMs: now });
  assert.equal(tier10.tier, 'ip_device_blocked');
  assert.equal(tier10.blockIpAndDevice, true);
  assert.equal(tier10.openViolationCase, true);

  const path3 = evaluateIntrusionPolicy({ failedLoginCount24h: 0, blockedPathCount24h: 3, nowMs: now });
  assert.equal(path3.tier, 'ip_device_blocked');
  assert.equal(path3.blockIpAndDevice, true);
  assert.equal(path3.openViolationCase, true);
});

test('violation fee eligibility applies strictly to registered customers and never anonymous visitors', () => {
  const registered = evaluateViolationEligibility('firebase-uid-123');
  assert.equal(registered.isRegisteredCustomer, true);
  assert.equal(registered.billable, true);
  assert.equal(registered.suspendAccount, true);
  assert.equal(registered.initialStatus, 'pending_review');

  const anonymous = evaluateViolationEligibility(null);
  assert.equal(anonymous.isRegisteredCustomer, false);
  assert.equal(anonymous.billable, false);
  assert.equal(anonymous.suspendAccount, false);
  assert.equal(anonymous.initialStatus, 'anonymous_blocked');
});

test('RBAC matrix enforces Owner, Admin, and Keuangan boundaries', () => {
  assert.equal(hasRolePermission('OWNER', 'payroll:disburse'), true);
  assert.equal(hasRolePermission('OWNER', 'payout_accounts:manage'), true);
  assert.equal(hasRolePermission('OWNER', 'violations:manage'), true);
  assert.equal(hasRolePermission('OWNER', 'activity_logs:view'), true);

  assert.equal(hasRolePermission('ADMIN', 'orders:confirm'), true);
  assert.equal(hasRolePermission('ADMIN', 'banners:manage'), true);
  assert.equal(hasRolePermission('ADMIN', 'payout_accounts:manage'), false);
  assert.equal(hasRolePermission('ADMIN', 'payroll:disburse'), false);
  assert.equal(hasRolePermission('ADMIN', 'activity_logs:view'), false);

  assert.equal(hasRolePermission('KEUANGAN', 'finance:view'), true);
  assert.equal(hasRolePermission('KEUANGAN', 'payroll:prepare'), true);
  assert.equal(hasRolePermission('KEUANGAN', 'activity_logs:view'), true);
  assert.equal(hasRolePermission('KEUANGAN', 'security_logs:view'), false);
  assert.equal(hasRolePermission('KEUANGAN', 'payroll:disburse'), false);
  assert.equal(hasRolePermission('KEUANGAN', 'banners:manage'), false);
});

test('session idle timeout enforces 15-minute inactivity boundary and admin path normalization stays safe', () => {
  const base = 1_763_750_000_000;
  assert.equal(isSessionIdleExpired(base, base + SESSION_IDLE_TIMEOUT_MS), false);
  assert.equal(isSessionIdleExpired(base, base + SESSION_IDLE_TIMEOUT_MS + 1), true);

  assert.equal(normalizeAdminPath('masuk-alstore-x7/'), '/masuk-alstore-x7');
  assert.equal(normalizeAdminPath('/api/hack'), DEFAULT_ADMIN_PATH);
  assert.equal(normalizeAdminPath(''), DEFAULT_ADMIN_PATH);

  assert.equal(isSafeImageUrl('/assets/aistudio/banner.jpeg'), true);
  assert.equal(isSafeImageUrl('https://cdn.example.com/banner.jpg'), true);
  assert.equal(isSafeImageUrl('javascript:alert(1)'), false);
});

test('allowlisted Owner emails require verified email and match configured owners case-insensitively', () => {
  assert.equal(isAllowlistedOwnerEmail('alfathadiputra24@gmail.com', true), true);
  assert.equal(isAllowlistedOwnerEmail('ALFATHGEMINIPRO@GMAIL.COM ', true), true);
  assert.equal(isAllowlistedOwnerEmail('alfathadiputra24@gmail.com', false), false);
  assert.equal(isAllowlistedOwnerEmail('pelanggan@gmail.com', true), false);
  assert.equal(isAllowlistedOwnerEmail(null, true), false);
  assert.equal(
    isAllowlistedOwnerEmail('extra-owner@alstore.id', true, 'extra-owner@alstore.id'),
    true
  );

  assert.equal(
    shouldRequireTotpEnrollment({ role: 'OWNER', totpEnabled: false, authMethod: 'firebase_sso' }),
    false
  );
  assert.equal(
    shouldRequireTotpEnrollment({ role: 'OWNER', totpEnabled: false, authMethod: 'password' }),
    true
  );
  assert.equal(
    shouldRequireTotpEnrollment({ role: 'OWNER', totpEnabled: true, authMethod: 'password' }),
    false
  );
  assert.equal(
    shouldRequireTotpEnrollment({
      role: 'OWNER',
      totpEnabled: false,
      authMethod: 'password',
      totpOptedOut: true
    }),
    false
  );
  assert.equal(
    shouldRequireTotpEnrollment({
      role: 'OWNER',
      totpEnabled: false,
      authMethod: 'password',
      totpOptedOut: false
    }),
    true
  );
});

test('isAllowedAdminOrigin accepts reverse-proxy hosts and same-origin fetches while blocking cross-site origins', () => {
  // Missing origin (direct server / non-CORS)
  assert.equal(isAllowedAdminOrigin({ origin: undefined, host: 'localhost:3000' }), true);

  // Exact match
  assert.equal(
    isAllowedAdminOrigin({
      origin: 'https://ais-dev-abc.asia-east1.run.app',
      host: 'ais-dev-abc.asia-east1.run.app'
    }),
    true
  );

  // Reverse proxy comma-separated X-Forwarded-Host and default :443 port
  assert.equal(
    isAllowedAdminOrigin({
      origin: 'https://ais-dev-abc.asia-east1.run.app',
      host: 'localhost:3000',
      forwardedHost: 'ais-dev-abc.asia-east1.run.app:443, internal-proxy:8080'
    }),
    true
  );

  // Reverse proxy omitted X-Forwarded-Host and rewrote Host to localhost:3000, but browser sent Sec-Fetch-Site: same-origin
  assert.equal(
    isAllowedAdminOrigin({
      origin: 'https://ais-dev-abc.asia-east1.run.app',
      host: 'localhost:3000',
      forwardedHost: '',
      secFetchSite: 'same-origin'
    }),
    true
  );

  // Genuine cross-site origin MUST be blocked
  assert.equal(
    isAllowedAdminOrigin({
      origin: 'https://evil.example',
      host: 'ais-dev-abc.asia-east1.run.app',
      secFetchSite: 'cross-site'
    }),
    false
  );

  // Malformed or non-http(s) origin MUST be blocked
  assert.equal(
    isAllowedAdminOrigin({
      origin: 'javascript:alert(1)',
      host: 'localhost:3000'
    }),
    false
  );
  assert.equal(
    isAllowedAdminOrigin({
      origin: 'not-a-valid-url',
      host: 'localhost:3000'
    }),
    false
  );
});

test('extractSessionTokenCandidates prioritizes X-Admin-Session header and preserves all duplicate cookies', () => {
  const candidates = extractSessionTokenCandidates({
    headerToken: 'fresh_header_tok',
    parsedCookieToken: 'stale_unpartitioned_tok',
    rawCookieHeader:
      'other=1; alstore_admin_sid=stale_unpartitioned_tok; alstore_admin_sid=fresh_partitioned_tok',
    cookieName: 'alstore_admin_sid'
  });

  assert.deepEqual(candidates, [
    'fresh_header_tok',
    'stale_unpartitioned_tok',
    'fresh_partitioned_tok'
  ]);

  const deduped = extractSessionTokenCandidates({
    headerToken: 'same_tok',
    parsedCookieToken: 'same_tok',
    rawCookieHeader: 'alstore_admin_sid=same_tok',
    cookieName: 'alstore_admin_sid'
  });
  assert.deepEqual(deduped, ['same_tok']);
});


