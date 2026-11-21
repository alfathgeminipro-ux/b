import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import type {
  AdminKeyMetricsData,
  AdminRole,
  OwnerAlertRecord
} from '../../types/admin';
import { formatDateTimeId, formatIdr } from '../../utils/adminApi';
import { formatRelativeSyncTime } from '../../utils/keyMetrics';

interface AdminKeyMetricsWidgetProps {
  role: AdminRole;
  metrics: AdminKeyMetricsData;
  alerts: OwnerAlertRecord[];
  lastUpdatedMs: number | null;
  nowMs: number;
  refreshing: boolean;
  autoRefreshEnabled: boolean;
  acknowledgingId: string | null;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => void;
  onOpenPendingVerification: () => void;
  onOpenViolations?: () => void;
  onAcknowledgeAlert?: (alertId: string) => void;
}

export const AdminKeyMetricsWidget: React.FC<AdminKeyMetricsWidgetProps> = ({
  role,
  metrics,
  alerts,
  lastUpdatedMs,
  nowMs,
  refreshing,
  autoRefreshEnabled,
  acknowledgingId,
  onToggleAutoRefresh,
  onManualRefresh,
  onOpenPendingVerification,
  onOpenViolations,
  onAcknowledgeAlert
}) => {
  const visibleAlerts = alerts.slice(0, 4);
  const alertsValueClass =
    metrics.criticalAlertsCount > 0
      ? 'text-rose-300'
      : metrics.unacknowledgedAlertsCount > 0
        ? 'text-amber-300'
        : 'text-emerald-300';

  const alertsIconClass =
    metrics.criticalAlertsCount > 0
      ? 'text-rose-400'
      : metrics.unacknowledgedAlertsCount > 0
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <section
      aria-label="Ringkasan Metrik Utama"
      data-testid="key-metrics-widget"
      className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden"
    >
      {/* Widget Header Strip */}
      <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">Ringkasan Metrik Utama</h2>
          <p
            data-testid="key-metrics-sync-status"
            className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5"
          >
            Data langsung · Diperbarui {formatRelativeSyncTime(lastUpdatedMs, nowMs)}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-pressed={autoRefreshEnabled}
            onClick={onToggleAutoRefresh}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              autoRefreshEnabled
                ? 'border-sky-500/35 bg-sky-500/10 text-sky-300 hover:bg-sky-500/15'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            {autoRefreshEnabled ? (
              <Pause className="w-3 h-3 shrink-0" />
            ) : (
              <Play className="w-3 h-3 shrink-0" />
            )}
            <span>{autoRefreshEnabled ? 'Auto 30d: Aktif' : 'Auto 30d: Jeda'}</span>
          </button>

          <button
            type="button"
            onClick={onManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800/80 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* 4-Column Hairline KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-slate-800">
        {/* KPI 1: Total Successful Transactions Today */}
        <div
          data-testid="metric-today-success"
          className="bg-slate-900 p-5 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">
              Transaksi Sukses Hari Ini
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          </div>
          <p
            data-testid="metric-today-success-value"
            className="font-mono text-2xl font-bold text-emerald-300 tabular-nums tracking-tight"
          >
            {metrics.successfulTransactionsToday}
          </p>
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            Omzet hari ini {formatIdr(metrics.revenueTodayIdr)}
          </p>
        </div>

        {/* KPI 2: Total Revenue Generated */}
        <div
          data-testid="metric-total-revenue"
          className="bg-slate-900 p-5 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Total Pendapatan</span>
            <Banknote className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
          </div>
          <p
            data-testid="metric-total-revenue-value"
            className="font-mono text-2xl font-bold text-slate-50 tabular-nums tracking-tight"
          >
            {formatIdr(metrics.confirmedRevenueIdr)}
          </p>
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            {metrics.confirmedOrdersCount} transaksi terkonfirmasi
          </p>
        </div>

        {/* KPI 3: Pending Verification Orders Count */}
        <div
          data-testid="metric-pending-verification"
          className="bg-slate-900 p-5 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Menunggu Verifikasi</span>
            <Clock className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
          </div>
          <p
            data-testid="metric-pending-verification-value"
            className="font-mono text-2xl font-bold text-sky-300 tabular-nums tracking-tight"
          >
            {metrics.waitingVerificationCount}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
              {metrics.pendingPaymentCount} menunggu bayar
            </span>
            <button
              type="button"
              onClick={onOpenPendingVerification}
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap cursor-pointer"
            >
              <span>Tinjau Antrean</span>
              <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* KPI 4: Recent System Alerts */}
        <div
          data-testid="metric-system-alerts"
          className="bg-slate-900 p-5 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Peringatan Sistem</span>
            <ShieldAlert className={`w-4 h-4 shrink-0 ${alertsIconClass}`} aria-hidden="true" />
          </div>
          <p
            data-testid="metric-system-alerts-value"
            className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${alertsValueClass}`}
          >
            {metrics.unacknowledgedAlertsCount}
          </p>
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            {role === 'OWNER'
              ? `${metrics.criticalAlertsCount} kritis · ${metrics.activeViolationCasesCount} kasus · ${metrics.activeBlockedDevicesCount} blokir IP`
              : metrics.unacknowledgedAlertsCount > 0
                ? 'Perlu perhatian operasional'
                : 'Semua sistem normal'}
          </p>
        </div>
      </div>

      {/* Integrated Recent System Alerts Feed */}
      <div className="border-t border-slate-800">
        <div className="px-5 py-3 bg-slate-950/50 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-xs font-semibold text-slate-200">
              Peringatan Sistem Terbaru
            </h3>
            <span className="text-[11px] text-slate-500 font-mono tabular-nums">
              · {metrics.unacknowledgedAlertsCount} belum dibaca
            </span>
          </div>

          {role === 'OWNER' && onOpenViolations && (
            <button
              type="button"
              onClick={onOpenViolations}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap cursor-pointer"
            >
              <span>Lihat Kasus Pelanggaran</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {visibleAlerts.length === 0 ? (
          <div className="px-5 py-5 text-xs text-slate-400">
            Tidak ada peringatan sistem aktif saat ini.
          </div>
        ) : (
          <ul data-testid="recent-system-alerts-list" className="divide-y divide-slate-800/80">
            {visibleAlerts.map((alert) => {
              const isCritical = alert.severity === 'critical';
              const isAcknowledging = acknowledgingId === alert.id;
              return (
                <li
                  key={alert.id}
                  data-testid={`system-alert-item-${alert.id}`}
                  className={`px-5 py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-colors ${
                    alert.acknowledged ? 'opacity-65 bg-slate-900/40' : 'hover:bg-slate-800/25'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          isCritical ? 'text-rose-300' : 'text-amber-300'
                        }`}
                      >
                        {isCritical ? (
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {isCritical ? 'Kritis' : 'Peringatan'}
                      </span>
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-semibold text-slate-100">{alert.title}</span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{alert.message}</p>

                    <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {formatDateTimeId(alert.createdAtMs)} · Kanal: {alert.channel}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center sm:pt-0.5">
                    {alert.acknowledged ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 whitespace-nowrap">
                        <Check className="w-3 h-3" aria-hidden="true" />
                        Sudah dibaca
                      </span>
                    ) : role === 'OWNER' && onAcknowledgeAlert ? (
                      <button
                        type="button"
                        disabled={isAcknowledging}
                        onClick={() => onAcknowledgeAlert(alert.id)}
                        aria-label={`Tandai dibaca: ${alert.title}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap disabled:opacity-60 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                        <span>{isAcknowledging ? 'Menyimpan...' : 'Tandai Dibaca'}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-300 whitespace-nowrap">
                        Aktif
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
