import type { OrderStatus, TopUpOrder } from '../types/store';

export type OrderStatusCategory = 'pending' | 'success' | 'failed';
export type OrderStatusFilter = 'all' | OrderStatusCategory;
export type StatusIconKey = 'clock' | 'shield-check' | 'check-circle' | 'x-circle';

export interface OrderStatusVisual {
  status: OrderStatus;
  category: OrderStatusCategory;
  label: string;
  shortLabel: string;
  description: string;
  iconKey: StatusIconKey;
  colorVar: string;
  surfaceBg: string;
  borderColor: string;
  accentBarColor: string;
}

export const ORDER_STATUS_VISUALS: Record<OrderStatus, OrderStatusVisual> = {
  pending: {
    status: 'pending',
    category: 'pending',
    label: 'Menunggu Pembayaran',
    shortLabel: 'Pending',
    description: 'Selesaikan pembayaran sebelum batas waktu berakhir',
    iconKey: 'clock',
    colorVar: 'var(--warning)',
    surfaceBg: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.38)',
    accentBarColor: '#f59e0b'
  },
  waiting_verification: {
    status: 'waiting_verification',
    category: 'pending',
    label: 'Menunggu Verifikasi',
    shortLabel: 'Diproses',
    description: 'Bukti transfer diterima · sedang diverifikasi admin',
    iconKey: 'shield-check',
    colorVar: 'var(--accent)',
    surfaceBg: 'rgba(56, 189, 248, 0.14)',
    borderColor: 'rgba(56, 189, 248, 0.38)',
    accentBarColor: '#38bdf8'
  },
  completed: {
    status: 'completed',
    category: 'success',
    label: 'Transaksi Berhasil',
    shortLabel: 'Berhasil',
    description: 'Top-up selesai diproses ke akun game Anda',
    iconKey: 'check-circle',
    colorVar: 'var(--success)',
    surfaceBg: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(16, 185, 129, 0.38)',
    accentBarColor: '#10b981'
  },
  expired: {
    status: 'expired',
    category: 'failed',
    label: 'Gagal / Kedaluwarsa',
    shortLabel: 'Gagal',
    description: 'Batas waktu pembayaran telah berakhir',
    iconKey: 'x-circle',
    colorVar: 'var(--danger)',
    surfaceBg: 'rgba(244, 63, 94, 0.14)',
    borderColor: 'rgba(244, 63, 94, 0.38)',
    accentBarColor: '#f43f5e'
  }
};

/**
 * Resolves the effective status of an order, automatically marking unpaid
 * pending orders whose payment deadline has passed as 'expired'.
 */
export function resolveEffectiveOrderStatus(
  order: Pick<TopUpOrder, 'status' | 'expiresAtMs'>,
  nowMs: number = Date.now()
): OrderStatus {
  if (order.status === 'pending' && order.expiresAtMs <= nowMs) {
    return 'expired';
  }
  return order.status;
}

export function getOrderStatusVisual(
  order: Pick<TopUpOrder, 'status' | 'expiresAtMs'>,
  nowMs: number = Date.now()
): OrderStatusVisual {
  const effective = resolveEffectiveOrderStatus(order, nowMs);
  return ORDER_STATUS_VISUALS[effective];
}

export interface OrderStatusSummary {
  total: number;
  pending: number;
  success: number;
  failed: number;
}

export function summarizeOrdersByCategory(
  orders: Pick<TopUpOrder, 'status' | 'expiresAtMs'>[],
  nowMs: number = Date.now()
): OrderStatusSummary {
  const summary: OrderStatusSummary = {
    total: orders.length,
    pending: 0,
    success: 0,
    failed: 0
  };

  for (const order of orders) {
    const visual = getOrderStatusVisual(order, nowMs);
    summary[visual.category] += 1;
  }

  return summary;
}

export function filterOrdersByCategory<T extends Pick<TopUpOrder, 'status' | 'expiresAtMs'>>(
  orders: T[],
  filter: OrderStatusFilter,
  nowMs: number = Date.now()
): T[] {
  if (filter === 'all') return orders;
  return orders.filter((order) => getOrderStatusVisual(order, nowMs).category === filter);
}
