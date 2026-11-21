import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ReceiptText,
  Search,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import type { TopUpOrder } from '../types/store';
import {
  filterOrdersByCategory,
  getOrderStatusVisual,
  summarizeOrdersByCategory,
  type OrderStatusFilter,
  type StatusIconKey
} from '../utils/orderStatus';
import { formatIDR } from '../utils/pricing';

interface TrackOrderPageProps {
  orders: TopUpOrder[];
  onOpenInvoice: (invoiceId: string) => void;
  onStartShopping: () => void;
}

const STATUS_ICON_MAP: Record<StatusIconKey, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  clock: Clock,
  'shield-check': ShieldCheck,
  'check-circle': CheckCircle2,
  'x-circle': XCircle
};

export const TrackOrderPage: React.FC<TrackOrderPageProps> = ({
  orders,
  onOpenInvoice,
  onStartShopping
}) => {
  const [queryInput, setQueryInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const nowMs = Date.now();

  const matchedOrder = useMemo(() => {
    const clean = submittedQuery.trim().toLowerCase();
    if (!clean) return null;
    return orders.find((o) => o.invoiceId.toLowerCase() === clean) || null;
  }, [orders, submittedQuery]);

  const statusSummary = useMemo(
    () => summarizeOrdersByCategory(orders, nowMs),
    [orders, nowMs]
  );

  const visibleOrders = useMemo(
    () => filterOrdersByCategory(orders, statusFilter, nowMs),
    [orders, statusFilter, nowMs]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(queryInput.trim());
  };

  const formatDate = (ms: number) => {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms));
  };

  const matchedVisual = matchedOrder ? getOrderStatusVisual(matchedOrder, nowMs) : null;
  const MatchedIcon = matchedVisual ? STATUS_ICON_MAP[matchedVisual.iconKey] : null;

  const filterTabs: {
    id: OrderStatusFilter;
    label: string;
    count: number;
    icon?: React.FC<{ className?: string; style?: React.CSSProperties }>;
    iconColor?: string;
  }[] = [
    { id: 'all', label: 'Semua', count: statusSummary.total },
    { id: 'pending', label: 'Pending', count: statusSummary.pending, icon: Clock, iconColor: 'var(--warning)' },
    { id: 'success', label: 'Berhasil', count: statusSummary.success, icon: CheckCircle2, iconColor: 'var(--success)' },
    { id: 'failed', label: 'Gagal', count: statusSummary.failed, icon: XCircle, iconColor: 'var(--danger)' }
  ];

  return (
    <section aria-label="Cek Status Transaksi" className="pt-22 sm:pt-26 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-7">
        {/* Search Hero Card */}
        <div className="liquid-glass rounded-3xl p-6 sm:p-8 space-y-5">
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--accent)' }}>
              Pelacakan Pesanan Real-Time
            </div>
            <h1
              className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Cek Transaksi ALSTORE
            </h1>
            <p className="text-sm mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Masukkan Nomor Invoice (contoh: ALS-2026XXXX) untuk melihat status pembayaran dan detail top-up Anda.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Masukkan Nomor Invoice (misal: ALS-2026...)"
                aria-label="Nomor Invoice"
                className="liquid-input w-full h-12 pl-11 pr-4 rounded-xl text-sm font-mono-num uppercase"
              />
            </div>
            <button
              type="submit"
              className="liquid-btn-primary h-12 px-6 rounded-xl text-sm whitespace-nowrap cursor-pointer"
            >
              Lacak Pesanan
            </button>
          </form>

          {/* Search Result */}
          {submittedQuery && (
            <div className="pt-4 border-t" style={{ borderColor: 'var(--divider)' }}>
              {matchedOrder && matchedVisual && MatchedIcon ? (
                <div
                  data-testid="matched-order-card"
                  className="liquid-glass rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-[3px]"
                  style={{ borderLeftColor: matchedVisual.accentBarColor }}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      data-testid="order-status-emblem"
                      data-status={matchedVisual.status}
                      aria-hidden="true"
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
                      style={{
                        backgroundColor: matchedVisual.surfaceBg,
                        borderColor: matchedVisual.borderColor
                      }}
                    >
                      <MatchedIcon className="w-5 h-5" style={{ color: matchedVisual.colorVar }} />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div
                        data-testid="order-status-indicator"
                        data-status={matchedVisual.status}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-lg border"
                        style={{
                          color: matchedVisual.colorVar,
                          backgroundColor: matchedVisual.surfaceBg,
                          borderColor: matchedVisual.borderColor
                        }}
                      >
                        <MatchedIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{matchedVisual.label}</span>
                      </div>
                      <div className="font-mono-num text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {matchedOrder.invoiceId}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {matchedOrder.gameName} · {matchedOrder.itemName} · ID{' '}
                        <span className="font-mono-num">{matchedOrder.accountId}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="text-left sm:text-right">
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Total Bayar
                      </div>
                      <div className="font-mono-num text-base font-bold" style={{ color: 'var(--accent)' }}>
                        {formatIDR(matchedOrder.totalAmount)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenInvoice(matchedOrder.invoiceId)}
                      className="liquid-btn-primary h-10 px-4 rounded-xl text-xs whitespace-nowrap cursor-pointer"
                    >
                      <span>Buka Invoice</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm py-3" style={{ color: 'var(--danger)' }}>
                  Invoice <strong className="font-mono-num">{submittedQuery}</strong> tidak ditemukan di perangkat atau akun Anda. Periksa kembali penulisan nomor invoice.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Order History */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Riwayat Transaksi Terbaru
              </h2>
              <span className="font-mono-num text-xs" style={{ color: 'var(--text-muted)' }}>
                · {orders.length} transaksi
              </span>
            </div>

            {orders.length > 0 && (
              <div
                role="tablist"
                aria-label="Filter status transaksi"
                className="liquid-glass rounded-xl p-1 flex items-center gap-1 overflow-x-auto"
              >
                {filterTabs.map((tab) => {
                  const active = statusFilter === tab.id;
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setStatusFilter(tab.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
                      style={{
                        background: active ? 'var(--accent)' : 'transparent',
                        color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)'
                      }}
                    >
                      {TabIcon && (
                        <TabIcon
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: active ? 'var(--accent-contrast)' : tab.iconColor }}
                        />
                      )}
                      <span>{tab.label}</span>
                      <span
                        className="font-mono-num text-[11px] opacity-80"
                        style={{ color: active ? 'var(--accent-contrast)' : 'var(--text-muted)' }}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {orders.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-10 text-center space-y-3">
              <ReceiptText className="w-9 h-9 mx-auto" style={{ color: 'var(--text-muted)' }} />
              <div className="font-display text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Belum Ada Riwayat Transaksi
              </div>
              <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Pesanan yang Anda buat akan otomatis tersimpan di sini agar mudah dipantau kapan saja.
              </p>
              <button
                type="button"
                onClick={onStartShopping}
                className="liquid-btn-primary rounded-xl px-5 py-2.5 text-xs cursor-pointer"
              >
                Mulai Top-Up Sekarang
              </button>
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-8 text-center space-y-3">
              <div className="font-display text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Tidak ada transaksi pada status ini
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Pilih tab Semua untuk melihat seluruh riwayat transaksi Anda.
              </p>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="liquid-glass px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                style={{ color: 'var(--accent)' }}
              >
                Tampilkan Semua Transaksi
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleOrders.map((ord) => {
                const visual = getOrderStatusVisual(ord, nowMs);
                const Icon = STATUS_ICON_MAP[visual.iconKey];
                return (
                  <button
                    key={ord.invoiceId}
                    type="button"
                    data-testid="order-history-row"
                    data-status={visual.status}
                    onClick={() => onOpenInvoice(ord.invoiceId)}
                    className="liquid-glass liquid-glass-interactive w-full rounded-2xl p-4 sm:p-5 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-[3px] cursor-pointer"
                    style={{ borderLeftColor: visual.accentBarColor }}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      {/* At-a-Glance Visual Status Emblem */}
                      <div
                        data-testid="order-status-emblem"
                        data-status={visual.status}
                        aria-hidden="true"
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border mt-0.5"
                        style={{
                          backgroundColor: visual.surfaceBg,
                          borderColor: visual.borderColor
                        }}
                      >
                        <Icon className="w-5 h-5" style={{ color: visual.colorVar }} />
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono-num font-bold" style={{ color: 'var(--text-primary)' }}>
                            {ord.invoiceId}
                          </span>
                          <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
                            ·
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{formatDate(ord.createdAtMs)}</span>
                        </div>
                        <div className="font-display text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                          {ord.gameName} — {ord.itemName}
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          ID: <span className="font-mono-num">{ord.accountId}</span>
                          {ord.zoneId ? ` (${ord.zoneId})` : ''} · {ord.paymentMethodName}
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pl-14 sm:pl-0">
                      <div className="font-mono-num text-base font-extrabold" style={{ color: 'var(--accent)' }}>
                        {formatIDR(ord.totalAmount)}
                      </div>
                      <span
                        data-testid="order-status-indicator"
                        data-status={visual.status}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap"
                        style={{
                          color: visual.colorVar,
                          backgroundColor: visual.surfaceBg,
                          borderColor: visual.borderColor
                        }}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{visual.label}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
