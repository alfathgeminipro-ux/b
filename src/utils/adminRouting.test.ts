import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePathname,
  resolvePopstateRouteMode,
  shouldRunServerGateCheck
} from './adminRouting';

test('normalizePathname strips trailing slashes and defaults empty values to root', () => {
  assert.equal(normalizePathname('/'), '/');
  assert.equal(normalizePathname(''), '/');
  assert.equal(normalizePathname('/masuk-alstore-x7/'), '/masuk-alstore-x7');
  assert.equal(normalizePathname('/masuk-alstore-x7///'), '/masuk-alstore-x7');
});

test('shouldRunServerGateCheck skips root, unready auth, and active authenticated admin sessions', () => {
  assert.equal(
    shouldRunServerGateCheck({
      pathname: '/',
      authReady: true,
      routeMode: 'storefront',
      hasActiveAdminSession: false
    }),
    false
  );

  assert.equal(
    shouldRunServerGateCheck({
      pathname: '/masuk-alstore-x7',
      authReady: false,
      routeMode: 'checking',
      hasActiveAdminSession: false
    }),
    false
  );

  assert.equal(
    shouldRunServerGateCheck({
      pathname: '/masuk-alstore-x7',
      authReady: true,
      routeMode: 'checking',
      hasActiveAdminSession: false
    }),
    true
  );

  assert.equal(
    shouldRunServerGateCheck({
      pathname: '/masuk-alstore-x7',
      authReady: true,
      routeMode: 'admin_portal',
      hasActiveAdminSession: true
    }),
    false
  );
});

test('resolvePopstateRouteMode maps root to storefront and non-root to checking', () => {
  assert.equal(resolvePopstateRouteMode('/'), 'storefront');
  assert.equal(resolvePopstateRouteMode('/masuk-alstore-x7'), 'checking');
});
