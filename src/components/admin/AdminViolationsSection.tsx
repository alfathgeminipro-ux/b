import React, { useState } from 'react';
import { CheckCircle2, FileWarning, Gavel, ShieldAlert, XCircle } from 'lucide-react';
import type { ViolationCaseRecord } from '../../types/admin';
import { adminFetch, formatDateTimeId, formatIdr } from '../../utils/adminApi';

interface AdminViolationsSectionProps {
  cases: ViolationCaseRecord[];
  defaultViolationFeeIdr: number;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<string, { label: string; colorClass: string }> = {
  pending_review: { label: 'Menunggu Tinjauan Owner', colorClass: 'text-amber-300' },
  approved_unpaid: { label: 'Tagihan Dibuat · Belum Lunas', colorClass: 'text-sky-300' },
  resolved_paid: { label: 'Lunas · Akun Dipulihkan', colorClass: 'text-emerald-300' },
  pardoned: { label: 'Diampuni · Akun Dipulihkan', colorClass: 'text-emerald-300' },
  cancelled: { label: 'Dibatalkan', colorClass: 'text-slate-400' },
  anonymous_blocked: { label: 'Anonim · Diblokir (Tidak Dapat Ditagih)', colorClass: 'text-rose-300' }
};

export const AdminViolationsSection: React.FC<AdminViolationsSectionProps> = ({
  cases,
  defaultViolationFeeIdr,
  onRefresh
}) => {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(cases[0]?.id || null);
  const [reviewNote, setReviewNote] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const selectedCase = cases.find((c) => c.id === selectedCaseId) || cases[0] || null;

  const handleDecision = async (caseId: string, decision: 'approve' | 'pardon' | 'cancel') => {
    setFeedback(null);
    setSubmittingId(caseId);
    try {
      const res = await adminFetch<{ ok: boolean; invoiceId?: string }>(
        `/api/admin/violations/${encodeURIComponent(caseId)}/review`,
        {
          method: 'POST',
          body: { decision, reviewNote }
        }
      );
      setReviewNote('');
      setFeedback({
        type: 'ok',
        text:
          decision === 'approve'
            ? `Tagihan biaya pelanggaran berhasil dibuat (${res.invoiceId}). Akun pelanggan akan pulih otomatis setelah lunas.`
            : decision === 'pardon'
              ? 'Kasus diampuni. Blokir dicabut dan akun pelanggan dipulihkan.'
              : 'Kasus dibatalkan dan akses dipulihkan.'
      });
      onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memproses keputusan kasus.'
      });
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-50">
            Kasus Pelanggaran Akses
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Biaya pelanggaran ({formatIdr(defaultViolationFeeIdr)}) hanya berlaku untuk akun pelanggan terdaftar (Google/Apple) setelah tinjauan Owner. Pengunjung anonim hanya diblokir &amp; dicatat.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-xs ${
            feedback.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-950/35 text-emerald-200'
              : 'border-rose-500/30 bg-rose-950/35 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {cases.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
          Belum ada kasus pelanggaran akses yang tercatat.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Case List */}
          <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800 overflow-hidden">
            {cases.map((item) => {
              const statusMeta = STATUS_LABELS[item.status] || {
                label: item.status,
                colorClass: 'text-slate-300'
              };
              const isSelected = selectedCase?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedCaseId(item.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    isSelected ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-100">
                      {item.id}
                    </span>
                    <span className={`text-xs font-medium ${statusMeta.colorClass}`}>
                      {statusMeta.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-200 mt-1 truncate">
                    {item.isRegisteredCustomer
                      ? item.customerEmail || item.customerUid
                      : 'Pengunjung Anonim (Tanpa Akun)'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-1.5 font-mono tabular-nums">
                    <span>IP {item.ipAddress}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.attemptCount}x percobaan</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.billable ? formatIdr(item.feeAmountIdr) : 'Non-Tagihan'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Forensic Evidence & Owner Review Panel */}
          {selectedCase && (
            <div
              data-testid="violation-case-detail"
              className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <p className="font-mono text-xs text-slate-400">
                    {selectedCase.id} · Dicatat {formatDateTimeId(selectedCase.createdAtMs)}
                  </p>
                  <h3 className="font-display text-lg font-bold text-slate-50 mt-1">
                    {selectedCase.isRegisteredCustomer
                      ? `Pelanggan Terdaftar: ${selectedCase.customerEmail}`
                      : 'Pengunjung Anonim (Hanya Diblokir)'}
                  </h3>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    STATUS_LABELS[selectedCase.status]?.colorClass || 'text-slate-300'
                  }`}
                >
                  {STATUS_LABELS[selectedCase.status]?.label || selectedCase.status}
                </span>
              </div>

              {/* Forensic Evidence Grid */}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <dt className="text-slate-400">Alamat IP</dt>
                  <dd className="font-mono text-slate-100">{selectedCase.ipAddress}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-slate-400">ID Perangkat</dt>
                  <dd className="font-mono text-slate-100">{selectedCase.deviceHash}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-slate-400">Jumlah Percobaan</dt>
                  <dd className="font-mono text-slate-100 tabular-nums">
                    {selectedCase.attemptCount}x ({selectedCase.triggerReason})
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-slate-400">Status Penagihan</dt>
                  <dd className="font-mono text-slate-100 tabular-nums">
                    {selectedCase.billable
                      ? `${formatIdr(selectedCase.feeAmountIdr)} (Wajib tinjauan Owner)`
                      : 'Tidak dapat ditagih (Pengunjung anonim)'}
                  </dd>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <dt className="text-slate-400">User Agent Perangkat</dt>
                  <dd className="font-mono text-[11px] text-slate-300 break-all bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                    {selectedCase.userAgent}
                  </dd>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <dt className="text-slate-400">Ringkasan Bukti</dt>
                  <dd className="text-slate-200 leading-relaxed">{selectedCase.evidenceSummary}</dd>
                </div>
                {selectedCase.invoiceId && (
                  <div className="sm:col-span-2 space-y-1">
                    <dt className="text-slate-400">Invoice Tagihan Pemulihan</dt>
                    <dd className="font-mono text-sky-300 font-semibold">
                      {selectedCase.invoiceId}
                    </dd>
                  </div>
                )}
                {selectedCase.reviewedByName && (
                  <div className="sm:col-span-2 space-y-1">
                    <dt className="text-slate-400">Ditinjau Oleh</dt>
                    <dd className="text-slate-300">
                      {selectedCase.reviewedByName} · {formatDateTimeId(selectedCase.reviewedAtMs)}
                      {selectedCase.reviewNote ? ` — "${selectedCase.reviewNote}"` : ''}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Owner Review Controls */}
              {selectedCase.isRegisteredCustomer && selectedCase.status === 'pending_review' ? (
                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor="violation-review-note" className="block text-xs font-medium text-slate-300">
                      Catatan Tinjauan Owner (Opsional)
                    </label>
                    <input
                      id="violation-review-note"
                      type="text"
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="Contoh: Terbukti memaksa akses path admin berulang"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={submittingId === selectedCase.id}
                      onClick={() => handleDecision(selectedCase.id, 'approve')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
                    >
                      <Gavel className="w-3.5 h-3.5" />
                      Setujui &amp; Buat Tagihan {formatIdr(selectedCase.feeAmountIdr)}
                    </button>
                    <button
                      type="button"
                      disabled={submittingId === selectedCase.id}
                      onClick={() => handleDecision(selectedCase.id, 'pardon')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50 font-medium text-xs whitespace-nowrap cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ampuni &amp; Pulihkan Akun
                    </button>
                    <button
                      type="button"
                      disabled={submittingId === selectedCase.id}
                      onClick={() => handleDecision(selectedCase.id, 'cancel')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50 font-medium text-xs whitespace-nowrap cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Batalkan Kasus
                    </button>
                  </div>
                </div>
              ) : !selectedCase.isRegisteredCustomer ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 flex items-start gap-2.5 text-xs text-slate-400">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p>
                    Pengunjung anonim tidak memiliki akun Google/Apple sehingga tidak dapat ditagih biaya pelanggaran. IP &amp; perangkat tetap diblokir dalam log keamanan.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 flex items-start gap-2.5 text-xs text-slate-300">
                  <FileWarning className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <p>
                    {selectedCase.status === 'approved_unpaid'
                      ? `Tagihan ${selectedCase.invoiceId} telah diterbitkan. Setelah pelanggan melunasi di menu Transaksi, akun akan pulih otomatis.`
                      : 'Kasus ini sudah selesai ditinjau.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
