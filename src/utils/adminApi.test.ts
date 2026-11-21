import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdminSessionToken,
  setAdminSessionToken,
  shouldAttachAdminSessionHeader,
  shouldClearAdminSessionOnError,
  syncSessionTokenFromPayload
} from './adminApi';

test('shouldAttachAdminSessionHeader attaches token only to admin routes and gate check', () => {
  assert.equal(shouldAttachAdminSessionHeader('/api/admin/overview'), true);
  assert.equal(shouldAttachAdminSessionHeader('/api/admin/orders?status=pending'), true);
  assert.equal(shouldAttachAdminSessionHeader('/api/gate/check'), true);
  assert.equal(shouldAttachAdminSessionHeader('/api/public/banners'), false);
  assert.equal(shouldAttachAdminSessionHeader('/api/customer/suspension'), false);
});

test('shouldClearAdminSessionOnError clears token only on session-gated admin 401s', () => {
  assert.equal(shouldClearAdminSessionOnError('/api/admin/overview', 401), true);
  assert.equal(shouldClearAdminSessionOnError('/api/admin/orders?limit=20', 401), true);
  assert.equal(shouldClearAdminSessionOnError('/api/admin/overview', 403), false);
  assert.equal(shouldClearAdminSessionOnError('/api/admin/auth/login', 401), false);
  assert.equal(shouldClearAdminSessionOnError('/api/admin/auth/firebase-sso', 401), false);
  assert.equal(shouldClearAdminSessionOnError('/api/admin/auth/firebase-eligibility', 401), false);
  assert.equal(shouldClearAdminSessionOnError('/api/admin/auth/bootstrap-owner', 401), false);
});

test('syncSessionTokenFromPayload updates and clears in-memory session token predictably', () => {
  setAdminSessionToken(null);
  syncSessionTokenFromPayload('/api/admin/auth/firebase-sso', { sessionToken: 'tok_fresh_123' });
  assert.equal(getAdminSessionToken(), 'tok_fresh_123');

  // Unauthenticated status response clears stale token
  syncSessionTokenFromPayload('/api/admin/auth/status', {
    session: { authenticated: false }
  });
  assert.equal(getAdminSessionToken(), null);

  // Nested authenticated status restores token
  syncSessionTokenFromPayload('/api/admin/auth/status', {
    session: { authenticated: true, sessionToken: 'tok_nested_456' }
  });
  assert.equal(getAdminSessionToken(), 'tok_nested_456');

  // Logout always clears token
  syncSessionTokenFromPayload('/api/admin/auth/logout', { ok: true });
  assert.equal(getAdminSessionToken(), null);
});
