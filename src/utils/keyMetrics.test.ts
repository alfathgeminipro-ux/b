import test from 'node:test';
import assert from 'node:assert/strict';
import type { OwnerAlertRecord } from '../types/admin';
import {
  computeKeyMetricsSummary,
  formatRelativeSyncTime,
  getStartOfDayMs
} from './keyMetrics';

test('getStartOfDayMs aligns timestamps to exact start of day in a fixed timezone offset', () => {
  // 2026-11-21 15:30:00 UTC+7 = 2026-11-21T08:30:00Z
  const nowMs = Date.UTC(2026, 10, 21, 8, 30, 0);
  const startWib = getStartOfDayMs(nowMs, 420); // UTC+7
  // Start of 2026-11-21 in UTC+7 is 2026-11-20T17:00:00Z
  assert.equal(startWib, Date.UTC(2026, 10, 20, 17, 0, 0));
});

test('computeKeyMetricsSummary separates today successful transactions from prior days and prioritizes active alerts', () => {
  const nowMs = Date.UTC(2026, 10, 21, 10, 0, 0);
  const orders = [
    // Completed today
    {
      status: 'completed' as const,
      totalAmount: 92711,
      createdAtMs: nowMs - 45 * 60_000,
      confirmedAtMs: nowMs - 40 * 60_000
    },
    {
      status: 'completed' as const,
      totalAmount: 26942,
      createdAtMs: nowMs - 10 * 60_000,
      confirmedAtMs: nowMs - 5 * 60_000
    },
    // Completed yesterday (should count in total revenue, NOT today)
    {
      status: 'completed' as const,
      totalAmount: 150000,
      createdAtMs: nowMs - 30 * 3600_000,
      confirmedAtMs: nowMs - 29 * 3600_000
    },
    // Pending verification
    {
      status: 'waiting_verification' as const,
      totalAmount: 115308,
      createdAtMs: nowMs - 14 * 60_000
    },
    // Pending payment
    {
      status: 'pending' as const,
      totalAmount: 19619,
      createdAtMs: nowMs - 3 * 60_000
    }
  ];

  const alerts: OwnerAlertRecord[] = [
    {
      id: 'a1',
      createdAtMs: nowMs - 5 * 60_000,
      severity: 'warning',
      title: 'Acknowledged newer alert',
      message: 'Already handled',
      channel: 'Panel Owner',
      acknowledged: true
    },
    {
      id: 'a2',
      createdAtMs: nowMs - 60 * 60_000,
      severity: 'critical',
      title: 'Critical IP Block',
      message: 'Blocked after 10 failures',
      channel: 'Panel Owner',
      acknowledged: false
    },
    {
      id: 'a3',
      createdAtMs: nowMs - 20 * 60_000,
      severity: 'warning',
      title: 'Pending violation review',
      message: 'Needs owner review',
      channel: 'Panel Owner',
      acknowledged: false
    }
  ];

  const summary = computeKeyMetricsSummary({
    orders,
    alerts,
    nowMs,
    tzOffsetMinutes: 0
  });

  assert.equal(summary.successfulTransactionsToday, 2);
  assert.equal(summary.revenueTodayIdr, 119653);
  assert.equal(summary.confirmedOrdersCount, 3);
  assert.equal(summary.confirmedRevenueIdr, 269653);
  assert.equal(summary.waitingVerificationCount, 1);
  assert.equal(summary.pendingPaymentCount, 1);
  assert.equal(summary.unacknowledgedAlertsCount, 2);
  assert.equal(summary.criticalAlertsCount, 1);
  // Unacknowledged alerts come first (newest first), followed by acknowledged
  assert.deepEqual(
    summary.recentAlerts.map((a) => a.id),
    ['a3', 'a2', 'a1']
  );
});

test('formatRelativeSyncTime returns clear Indonesian relative strings', () => {
  const now = 1_763_750_000_000;
  assert.equal(formatRelativeSyncTime(null, now), 'Memuat data...');
  assert.equal(formatRelativeSyncTime(now - 2_000, now), 'Baru saja');
  assert.equal(formatRelativeSyncTime(now - 24_000, now), '24 detik lalu');
  assert.equal(formatRelativeSyncTime(now - 180_000, now), '3 menit lalu');
  assert.equal(formatRelativeSyncTime(now - 7_200_000, now), '2 jam lalu');
});
