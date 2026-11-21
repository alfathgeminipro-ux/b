import type { OwnerAlertRecord } from '../types/admin';
import type { OrderStatus } from '../types/store';

export interface MinimalOrderForMetrics {
  status: OrderStatus;
  totalAmount: number;
  createdAtMs: number;
  confirmedAtMs?: number | null;
}

export interface ComputedKeyMetrics {
  successfulTransactionsToday: number;
  revenueTodayIdr: number;
  confirmedRevenueIdr: number;
  confirmedOrdersCount: number;
  waitingVerificationCount: number;
  pendingPaymentCount: number;
  unacknowledgedAlertsCount: number;
  criticalAlertsCount: number;
  recentAlerts: OwnerAlertRecord[];
}

/**
 * Computes local midnight (00:00:00.000) timestamp for the given epoch ms.
 * Optionally accepts a timezone offset in minutes (defaults to runtime local TZ).
 */
export function getStartOfDayMs(nowMs: number, tzOffsetMinutes?: number): number {
  if (typeof tzOffsetMinutes === 'number' && Number.isFinite(tzOffsetMinutes)) {
    const shifted = nowMs + tzOffsetMinutes * 60_000;
    const dayStartShifted = Math.floor(shifted / 86_400_000) * 86_400_000;
    return dayStartShifted - tzOffsetMinutes * 60_000;
  }
  const dt = new Date(nowMs);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

export function computeKeyMetricsSummary(params: {
  orders: readonly MinimalOrderForMetrics[];
  alerts: readonly OwnerAlertRecord[];
  nowMs: number;
  tzOffsetMinutes?: number;
  maxRecentAlerts?: number;
}): ComputedKeyMetrics {
  const startOfDayMs = getStartOfDayMs(params.nowMs, params.tzOffsetMinutes);
  const maxRecent = Math.max(1, params.maxRecentAlerts ?? 4);

  let successfulTransactionsToday = 0;
  let revenueTodayIdr = 0;
  let confirmedRevenueIdr = 0;
  let confirmedOrdersCount = 0;
  let waitingVerificationCount = 0;
  let pendingPaymentCount = 0;

  for (const order of params.orders) {
    const amount = Math.max(0, Math.round(Number(order.totalAmount) || 0));
    if (order.status === 'completed') {
      confirmedOrdersCount += 1;
      confirmedRevenueIdr += amount;
      const effectiveTimeMs =
        typeof order.confirmedAtMs === 'number' && order.confirmedAtMs > 0
          ? order.confirmedAtMs
          : order.createdAtMs;
      if (effectiveTimeMs >= startOfDayMs) {
        successfulTransactionsToday += 1;
        revenueTodayIdr += amount;
      }
    } else if (order.status === 'waiting_verification') {
      waitingVerificationCount += 1;
    } else if (order.status === 'pending') {
      pendingPaymentCount += 1;
    }
  }

  let unacknowledgedAlertsCount = 0;
  let criticalAlertsCount = 0;
  for (const alert of params.alerts) {
    if (!alert.acknowledged) {
      unacknowledgedAlertsCount += 1;
      if (alert.severity === 'critical') {
        criticalAlertsCount += 1;
      }
    }
  }

  const recentAlerts = [...params.alerts]
    .sort((a, b) => {
      if (a.acknowledged !== b.acknowledged) {
        return a.acknowledged ? 1 : -1;
      }
      return b.createdAtMs - a.createdAtMs;
    })
    .slice(0, maxRecent);

  return {
    successfulTransactionsToday,
    revenueTodayIdr,
    confirmedRevenueIdr,
    confirmedOrdersCount,
    waitingVerificationCount,
    pendingPaymentCount,
    unacknowledgedAlertsCount,
    criticalAlertsCount,
    recentAlerts
  };
}

export function formatRelativeSyncTime(lastUpdatedMs: number | null, nowMs: number): string {
  if (!lastUpdatedMs) return 'Memuat data...';
  const diffSec = Math.max(0, Math.floor((nowMs - lastUpdatedMs) / 1000));
  if (diffSec < 5) return 'Baru saja';
  if (diffSec < 60) return `${diffSec} detik lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour} jam lalu`;
}
