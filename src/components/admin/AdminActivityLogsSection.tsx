import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  RotateCcw,
  Search,
  X
} from 'lucide-react';
import type { AdminRole, AuditLogRecord } from '../../types/admin';
import {
  ACTIVITY_CATEGORIES,
  DEFAULT_ACTIVITY_FILTER,
  type ActivityCategory,
  type ActivityFilterState,
  type ActivityTone,
  buildActivityLogsCsv,
  extractDistinctActions,
  extractDistinctActors,
  filterActivityLogs,
  getActivityActionMeta,
  getTargetTypeLabel,
  paginateActivityLogs
} from '../../utils/activityLogs';
import { buildCsvFilename, downloadCsvFile } from '../../utils/csvExport';

interface AdminActivityLogsSectionProps {
  logs: AuditLogRecord[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onExportSuccess?: (exportedCount: number) => void;
}

function formatAuditTimestamp(ms: number): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(ms));
}

function getToneTextClass(tone: ActivityTone): string {
  switch (tone) {
    case 'success':
      return 'text-emerald-300';
    case 'warning':
      return 'text-amber-300';
    case 'info':
      return 'text-sky-300';
    default:
      return 'text-slate-200';
  }
}

export const AdminActivityLogsSection: React.FC<AdminActivityLogsSectionProps> = ({
  logs,
  totalCount,
  loading,
  error,
  onRefresh,
  onExportSuccess
}) => {
  const [filter, setFilter] = useState<ActivityFilterState>(DEFAULT_ACTIVITY_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const distinctActors = useMemo(() => extractDistinctActors(logs), [logs]);
  const distinctActions = useMemo(() => extractDistinctActions(logs), [logs]);

  const categoryCounts = useMemo(() => {
    const counts: Record<ActivityCategory, number> = {
      all: logs.length,
      auth: 0,
      orders: 0,
      settings: 0,
      finance: 0,
      content: 0,
      security: 0
    };
    for (const log of logs) {
      const meta = getActivityActionMeta(log.action);
      counts[meta.category] += 1;
    }
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => filterActivityLogs(logs, filter), [logs, filter]);
  const pagination = useMemo(
    () => paginateActivityLogs(filteredLogs, page, pageSize),
    [filteredLogs, page, pageSize]
  );

  const hasActiveFilters =
    filter.search.trim().length > 0 ||
    filter.category !== 'all' ||
    filter.action !== 'ALL' ||
    filter.role !== 'ALL' ||
    filter.actorId !== 'ALL' ||
    filter.dateFrom !== '' ||
    filter.dateTo !== '' ||
    filter.sortOrder !== 'newest';

  const updateFilter = (patch: Partial<ActivityFilterState>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilter(DEFAULT_ACTIVITY_FILTER);
    setPage(1);
  };

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;
    const csv = buildActivityLogsCsv(filteredLogs);
    downloadCsvFile(buildCsvFilename('alstore-activity-logs'), csv);
    onExportSuccess?.(filteredLogs.length);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold text-slate-50">
            Log Aktivitas Admin
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Audit permanen seluruh aksi administratif (login, pembaruan status transaksi, pengaturan biaya, keuangan, banner, dan keamanan) lengkap dengan stempel waktu &amp; aktor.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {filteredLogs.length} / {totalCount} catatan
          </span>
          <button
            type="button"
            data-testid="download-activity-csv-btn"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40 text-xs font-medium text-slate-100 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh CSV
          </button>
        </div>
      </div>

      {/* Category Segmented Filter Bar */}
      <div
        role="tablist"
        aria-label="Filter kategori aktivitas"
        className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 overflow-x-auto"
      >
        {ACTIVITY_CATEGORIES.map((cat) => {
          const active = filter.category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => updateFilter({ category: cat.id, action: 'ALL' })}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                active
                  ? 'bg-slate-800 text-slate-50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{cat.label}</span>
              <span className="ml-1.5 font-mono tabular-nums text-[11px] text-slate-400">
                {categoryCounts[cat.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <label htmlFor="activity-search" className="sr-only">
              Cari log aktivitas
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="activity-search"
              type="search"
              value={filter.search}
              onChange={(e) => updateFilter({ search: e.target.value })}
              placeholder="Cari nama aktor, email, aksi, ID target, detail, atau alamat IP..."
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
            {filter.search && (
              <button
                type="button"
                onClick={() => updateFilter({ search: '' })}
                aria-label="Hapus kata kunci pencarian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              updateFilter({
                sortOrder: filter.sortOrder === 'newest' ? 'oldest' : 'newest'
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-sky-400" />
            {filter.sortOrder === 'newest' ? 'Urutkan: Terbaru' : 'Urutkan: Terlama'}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label htmlFor="activity-filter-role" className="block text-[11px] text-slate-400">
              Peran Aktor
            </label>
            <select
              id="activity-filter-role"
              value={filter.role}
              onChange={(e) => updateFilter({ role: e.target.value as 'ALL' | AdminRole })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Semua Peran</option>
              <option value="OWNER">OWNER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="KEUANGAN">KEUANGAN</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="activity-filter-actor" className="block text-[11px] text-slate-400">
              Aktor
            </label>
            <select
              id="activity-filter-actor"
              value={filter.actorId}
              onChange={(e) => updateFilter({ actorId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Semua Aktor ({distinctActors.length})</option>
              {distinctActors.map((actor) => (
                <option key={actor.actorId} value={actor.actorId}>
                  {actor.actorName} ({actor.actorRole})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="activity-filter-action" className="block text-[11px] text-slate-400">
              Jenis Aksi
            </label>
            <select
              id="activity-filter-action"
              value={filter.action}
              onChange={(e) => updateFilter({ action: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Semua Aksi ({distinctActions.length})</option>
              {distinctActions.map((act) => (
                <option key={act.code} value={act.code}>
                  {act.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="activity-date-from" className="block text-[11px] text-slate-400">
              Dari Tanggal
            </label>
            <input
              id="activity-date-from"
              type="date"
              value={filter.dateFrom}
              onChange={(e) => updateFilter({ dateFrom: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="activity-date-to" className="block text-[11px] text-slate-400">
              Sampai Tanggal
            </label>
            <input
              id="activity-date-to"
              type="date"
              value={filter.dateTo}
              onChange={(e) => updateFilter({ dateTo: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/35 bg-rose-950/35 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg border border-rose-400/40 hover:bg-rose-900/40 text-rose-100 font-medium whitespace-nowrap cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Activity Logs Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="activity-logs-table">
            <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
              <tr>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Waktu</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Aktor</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Aksi &amp; Kategori</th>
                <th className="py-3 px-4 font-medium">Target &amp; Rincian</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Alamat IP</th>
                <th className="py-3 px-4 font-medium text-right whitespace-nowrap">Inspeksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && logs.length === 0 ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx}>
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-32 rounded bg-slate-800 animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-28 rounded bg-slate-800 animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-36 rounded bg-slate-800 animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-56 rounded bg-slate-800 animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-24 rounded bg-slate-800 animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="h-3.5 w-14 ml-auto rounded bg-slate-800 animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : pagination.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center space-y-3">
                    <p className="text-sm font-medium text-slate-200">
                      {hasActiveFilters
                        ? 'Tidak ada log aktivitas yang cocok dengan filter saat ini.'
                        : 'Belum ada aktivitas administratif yang tercatat.'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {hasActiveFilters
                        ? 'Coba ubah kata kunci pencarian, kategori, aktor, atau rentang tanggal.'
                        : 'Setiap login, konfirmasi pesanan, perubahan rekening, dan pengaturan biaya akan otomatis tercatat di sini.'}
                    </p>
                    {hasActiveFilters && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset Semua Filter
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                pagination.items.map((log) => {
                  const meta = getActivityActionMeta(log.action);
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap align-top">
                          {formatAuditTimestamp(log.createdAtMs)}
                        </td>
                        <td className="py-3.5 px-4 align-top whitespace-nowrap">
                          <p className="font-semibold text-slate-100">{log.actorName}</p>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                            <span className="text-sky-300">{log.actorRole}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{log.actorEmail || log.actorId}</span>
                          </p>
                        </td>
                        <td className="py-3.5 px-4 align-top whitespace-nowrap">
                          <p className={`font-medium ${getToneTextClass(meta.tone)}`}>
                            {meta.label}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            <span>{meta.categoryLabel}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono text-slate-500">{log.action}</span>
                          </p>
                        </td>
                        <td className="py-3.5 px-4 align-top max-w-md">
                          <p className="text-slate-200 leading-relaxed">{log.details}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            <span>{getTargetTypeLabel(log.targetType)}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono text-slate-300">{log.targetId}</span>
                          </p>
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap align-top">
                          {log.ipAddress}
                        </td>
                        <td className="py-3.5 px-4 text-right align-top whitespace-nowrap">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Tutup' : 'Lihat'} rincian log ${log.id}`}
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs cursor-pointer"
                          >
                            <span>Detail</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-950/70">
                          <td colSpan={6} className="px-5 py-4">
                            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                              <div>
                                <dt className="text-[11px] text-slate-500">ID Catatan Audit</dt>
                                <dd className="font-mono text-slate-200 mt-0.5">{log.id}</dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-slate-500">Waktu UTC (ISO-8601)</dt>
                                <dd className="font-mono tabular-nums text-slate-200 mt-0.5">
                                  {new Date(log.createdAtMs).toISOString()}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-slate-500">ID &amp; Email Aktor</dt>
                                <dd className="font-mono text-slate-200 mt-0.5 break-words">
                                  {log.actorEmail && <span className="block text-slate-100">{log.actorEmail}</span>}
                                  <span className="block text-slate-400">{log.actorId}</span>
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-slate-500">Tipe &amp; ID Target</dt>
                                <dd className="font-mono text-slate-200 mt-0.5 break-words">
                                  {log.targetType} / {log.targetId}
                                </dd>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-4 border-t border-slate-800/80 pt-3">
                                <dt className="text-[11px] text-slate-500">Keterangan Lengkap</dt>
                                <dd className="text-slate-200 mt-1 leading-relaxed">
                                  {log.details}
                                </dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-mono tabular-nums">
              Menampilkan {pagination.startIndex}–{pagination.endIndex} dari {pagination.totalItems} aktivitas
            </span>
            <label htmlFor="activity-page-size" className="sr-only">
              Jumlah baris per halaman
            </label>
            <select
              id="activity-page-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono"
            >
              <option value={10}>10 / hal</option>
              <option value={15}>15 / hal</option>
              <option value={25}>25 / hal</option>
              <option value={50}>50 / hal</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Sebelumnya
            </button>
            <span className="font-mono tabular-nums text-slate-300 px-1">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              Berikutnya
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
