import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterOrdersByCategory,
  getOrderStatusVisual,
  resolveEffectiveOrderStatus,
  summarizeOrdersByCategory
} from './orderStatus';
import type { OrderStatus } from '../types/store';

interface StubOrder {
  id: string;
  status: OrderStatus;
  expiresAtMs: number;
}

const NOW = 1_700_000_000_000;

test('resolveEffectiveOrderStatus marks overdue pending orders as expired while preserving terminal and verification states', () => {
  assert.equal(resolveEffectiveOrderStatus({ status: 'pending', expiresAtMs: NOW + 60_000 }, NOW), 'pending');
  assert.equal(resolveEffectiveOrderStatus({ status: 'pending', expiresAtMs: NOW - 1_000 }, NOW), 'expired');
  assert.equal(
    resolveEffectiveOrderStatus({ status: 'waiting_verification', expiresAtMs: NOW - 60_000 }, NOW),
    'waiting_verification'
  );
  assert.equal(resolveEffectiveOrderStatus({ status: 'completed', expiresAtMs: NOW - 60_000 }, NOW), 'completed');
  assert.equal(resolveEffectiveOrderStatus({ status: 'expired', expiresAtMs: NOW + 60_000 }, NOW), 'expired');
});

test('getOrderStatusVisual maps each status to its expected icon and category', () => {
  const pendingVis = getOrderStatusVisual({ status: 'pending', expiresAtMs: NOW + 60_000 }, NOW);
  assert.equal(pendingVis.iconKey, 'clock');
  assert.equal(pendingVis.category, 'pending');

  const verifyVis = getOrderStatusVisual({ status: 'waiting_verification', expiresAtMs: NOW + 60_000 }, NOW);
  assert.equal(verifyVis.iconKey, 'shield-check');
  assert.equal(verifyVis.category, 'pending');

  const successVis = getOrderStatusVisual({ status: 'completed', expiresAtMs: NOW - 60_000 }, NOW);
  assert.equal(successVis.iconKey, 'check-circle');
  assert.equal(successVis.category, 'success');

  const failedVis = getOrderStatusVisual({ status: 'expired', expiresAtMs: NOW - 60_000 }, NOW);
  assert.equal(failedVis.iconKey, 'x-circle');
  assert.equal(failedVis.category, 'failed');
});

test('summarizeOrdersByCategory and filterOrdersByCategory classify orders accurately', () => {
  const orders: StubOrder[] = [
    { id: '1', status: 'pending', expiresAtMs: NOW + 5_000 },
    { id: '2', status: 'waiting_verification', expiresAtMs: NOW - 5_000 },
    { id: '3', status: 'completed', expiresAtMs: NOW - 5_000 },
    { id: '4', status: 'pending', expiresAtMs: NOW - 5_000 }, // overdue -> failed
    { id: '5', status: 'expired', expiresAtMs: NOW - 10_000 }
  ];

  const summary = summarizeOrdersByCategory(orders, NOW);
  assert.deepEqual(summary, {
    total: 5,
    pending: 2,
    success: 1,
    failed: 2
  });

  assert.deepEqual(
    filterOrdersByCategory(orders, 'pending', NOW).map((o) => o.id),
    ['1', '2']
  );
  assert.deepEqual(
    filterOrdersByCategory(orders, 'success', NOW).map((o) => o.id),
    ['3']
  );
  assert.deepEqual(
    filterOrdersByCategory(orders, 'failed', NOW).map((o) => o.id),
    ['4', '5']
  );
  assert.equal(filterOrdersByCategory(orders, 'all', NOW).length, 5);
});
