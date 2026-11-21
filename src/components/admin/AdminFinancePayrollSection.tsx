import React, { useState } from 'react';
import { Banknote, Building2, CheckCircle2, Lock, Plus, Wallet } from 'lucide-react';
import type { AdminRole, PayoutAccountRecord, PayrollItemRecord } from '../../types/admin';
import { adminFetch, formatDateTimeId, formatIdr } from '../../utils/adminApi';

interface FinanceProps {
  role: AdminRole;
  accounts: PayoutAccountRecord[];
  methodBreakdown: Array<{ methodName: string; ordersCount: number; totalIdr: number }>;
  onRequestStepUp: (
    title: string,
    description: string,
    executor: (creds: { stepUpPassword: string; stepUpTotpCode: string }) => Promise<void>
  ) => void;
  onRefresh: () => void;
}

export const AdminFinanceSection: React.FC<FinanceProps> = ({
  role,
  accounts,
  methodBreakdown,
  onRequestStepUp,
  onRefresh
}) => {
  const isOwner = role === 'OWNER';
  const [providerType, setProviderType] = useState<'BANK' | 'EWALLET' | 'QRIS'>('BANK');
  const [providerName, setProviderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerName.trim() || !accountNumber.trim() || !accountHolder.trim()) return;
    onRequestStepUp(
      'Ubah / Tambah Rekening Pencairan',
      `Menambahkan rekening ${providerName} (${accountNumber} a.n. ${accountHolder}). Perubahan rekening bersifat sensitif dan wajib diverifikasi ulang dengan sandi + TOTP.`,
      async (creds) => {
        await adminFetch('/api/admin/payout-accounts', {
          method: 'POST',
          body: {
            providerType,
            providerName: providerName.trim(),
            accountNumber: accountNumber.trim(),
            accountHolder: accountHolder.trim(),
            isPrimary,
            ...creds
          }
        });
        setProviderName('');
        setAccountNumber('');
        setAccountHolder('');
        setIsPrimary(false);
        onRefresh();
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-50">Rekening &amp; Laporan Keuangan</h2>
        <p className="text-xs text-slate-400 mt-1">
          {isOwner
            ? 'Owner memiliki akses penuh untuk mengubah rekening tujuan dana (wajib verifikasi ulang Sandi + TOTP).'
            : 'Peran Keuangan hanya dapat melihat laporan pendapatan dan daftar rekening (read-only).'}
        </p>
      </div>

      {/* Revenue Breakdown */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Ringkasan Pendapatan Terkonfirmasi per Kanal</h3>
          <span className="text-xs text-slate-400 font-mono">Status: Selesai</span>
        </div>
        {methodBreakdown.length === 0 ? (
          <p className="p-5 text-xs text-slate-400">Belum ada transaksi selesai untuk diringkas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <tr>
                  <th className="py-3 px-5 font-medium">Kanal Pembayaran</th>
                  <th className="py-3 px-5 font-medium text-right">Jumlah Transaksi</th>
                  <th className="py-3 px-5 font-medium text-right">Total Terkonfirmasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {methodBreakdown.map((row) => (
                  <tr key={row.methodName} className="hover:bg-slate-800/30">
                    <td className="py-3 px-5 text-slate-200 font-medium">{row.methodName}</td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-300">
                      {row.ordersCount}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-emerald-300">
                      {formatIdr(row.totalIdr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout Accounts List + Owner Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className={isOwner ? 'lg:col-span-7 space-y-3' : 'lg:col-span-12 space-y-3'}>
          <h3 className="text-sm font-semibold text-slate-100">Daftar Rekening Pencairan &amp; QRIS</h3>
          <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-sky-400 shrink-0">
                    {acc.providerType === 'QRIS' ? <Wallet className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {acc.providerName}{' '}
                      {acc.isPrimary && (
                        <span className="text-xs font-medium text-emerald-400">· Rekening Utama</span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-sky-300 mt-0.5">{acc.accountNumber}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      a.n. {acc.accountHolder} · Diperbarui {formatDateTimeId(acc.updatedAtMs)} oleh {acc.updatedByName}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {isOwner && (
          <form
            onSubmit={handleSaveAccount}
            className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Tambah / Ubah Rekening</h3>
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                <Lock className="w-3 h-3" /> Wajib Sandi + TOTP
              </span>
            </div>

            <div className="space-y-1">
              <label htmlFor="payout-type" className="block text-xs text-slate-300">
                Jenis Kanal
              </label>
              <select
                id="payout-type"
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as 'BANK' | 'EWALLET' | 'QRIS')}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
              >
                <option value="BANK">Transfer Bank</option>
                <option value="EWALLET">E-Wallet</option>
                <option value="QRIS">Merchant QRIS</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="payout-provider" className="block text-xs text-slate-300">
                Nama Bank / Kanal
              </label>
              <input
                id="payout-provider"
                type="text"
                required
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="Contoh: Bank Mandiri"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="payout-number" className="block text-xs text-slate-300">
                Nomor Rekening / NMID
              </label>
              <input
                id="payout-number"
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Contoh: 1320-0011-9988"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm font-mono text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="payout-holder" className="block text-xs text-slate-300">
                Atas Nama
              </label>
              <input
                id="payout-holder"
                type="text"
                required
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="Contoh: PT ALSTORE DIGITAL"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="rounded border-slate-600"
              />
              Jadikan rekening pencairan utama
            </label>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Simpan Rekening (Verifikasi TOTP)
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

interface PayrollProps {
  role: AdminRole;
  items: PayrollItemRecord[];
  onRequestStepUp: (
    title: string,
    description: string,
    executor: (creds: { stepUpPassword: string; stepUpTotpCode: string }) => Promise<void>
  ) => void;
  onRefresh: () => void;
}

export const AdminPayrollSection: React.FC<PayrollProps> = ({
  role,
  items,
  onRequestStepUp,
  onRefresh
}) => {
  const isOwner = role === 'OWNER';
  const [periodLabel, setPeriodLabel] = useState('November 2026');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeRole, setEmployeeRole] = useState<AdminRole>('ADMIN');
  const [bankLabel, setBankLabel] = useState('BCA');
  const [accountNumber, setAccountNumber] = useState('');
  const [amountIdr, setAmountIdr] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handlePrepareDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      await adminFetch('/api/admin/payroll', {
        method: 'POST',
        body: {
          periodLabel,
          employeeName,
          employeeRole,
          bankLabel,
          accountNumber,
          amountIdr: Number(amountIdr),
          note
        }
      });
      setEmployeeName('');
      setAccountNumber('');
      setAmountIdr('');
      setNote('');
      setMessage('Draf gaji berhasil disiapkan. Menunggu pencairan oleh Owner.');
      onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Gagal membuat draf gaji.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisburse = (item: PayrollItemRecord) => {
    onRequestStepUp(
      `Cairkan Gaji · ${item.employeeName}`,
      `Mencairkan gaji ${item.employeeName} (${item.periodLabel}) sebesar ${formatIdr(item.amountIdr)} ke ${item.bankLabel} ${item.accountNumber}. Wajib verifikasi ulang sandi + TOTP.`,
      async (creds) => {
        await adminFetch(`/api/admin/payroll/${encodeURIComponent(item.id)}/disburse`, {
          method: 'POST',
          body: creds
        });
        onRefresh();
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-50">Penggajian Karyawan</h2>
        <p className="text-xs text-slate-400 mt-1">
          Bagian Keuangan dapat menyiapkan draf gaji. Hanya Owner yang berhak mencairkan dana gaji setelah verifikasi ulang Sandi + TOTP.
        </p>
      </div>

      {message && (
        <p className="text-xs text-sky-200 bg-sky-950/40 border border-sky-500/30 rounded-lg px-4 py-2.5">
          {message}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Payroll Table */}
        <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <tr>
                  <th className="py-3 px-4 font-medium">Karyawan &amp; Periode</th>
                  <th className="py-3 px-4 font-medium">Rekening</th>
                  <th className="py-3 px-4 font-medium text-right">Nominal</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-100">{item.employeeName}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.employeeRole} · {item.periodLabel}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {item.bankLabel} · {item.accountNumber}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-100">
                      {formatIdr(item.amountIdr)}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.status === 'DISBURSED' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Dicairkan
                        </span>
                      ) : (
                        <span className="text-amber-300 font-medium">Draf · Menunggu Owner</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {item.status === 'DRAFT' && isOwner ? (
                        <button
                          type="button"
                          onClick={() => handleDisburse(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          Cairkan
                        </button>
                      ) : item.status === 'DRAFT' ? (
                        <span className="text-[11px] text-slate-500">Khusus Owner</span>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          oleh {item.disbursedByName}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Prepare Draft Payroll Form (Owner + Keuangan) */}
        <form
          onSubmit={handlePrepareDraft}
          className="lg:col-span-4 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3"
        >
          <h3 className="text-sm font-semibold text-slate-100">Siapkan Draf Gaji</h3>

          <div className="space-y-1">
            <label htmlFor="pay-period" className="block text-xs text-slate-300">
              Periode
            </label>
            <input
              id="pay-period"
              type="text"
              required
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="pay-emp" className="block text-xs text-slate-300">
              Nama Karyawan
            </label>
            <input
              id="pay-emp"
              type="text"
              required
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor="pay-role" className="block text-xs text-slate-300">
                Peran
              </label>
              <select
                id="pay-role"
                value={employeeRole}
                onChange={(e) => setEmployeeRole(e.target.value as AdminRole)}
                className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
              >
                <option value="ADMIN">Admin</option>
                <option value="KEUANGAN">Keuangan</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="pay-bank" className="block text-xs text-slate-300">
                Bank
              </label>
              <input
                id="pay-bank"
                type="text"
                required
                value={bankLabel}
                onChange={(e) => setBankLabel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="pay-acc" className="block text-xs text-slate-300">
              Nomor Rekening Tujuan
            </label>
            <input
              id="pay-acc"
              type="text"
              required
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Contoh: 7741-9920-11"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm font-mono text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="pay-amount" className="block text-xs text-slate-300">
              Nominal Gaji (Rp)
            </label>
            <input
              id="pay-amount"
              type="number"
              min={10000}
              required
              value={amountIdr}
              onChange={(e) => setAmountIdr(e.target.value)}
              placeholder="3500000"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm font-mono text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="pay-note" className="block text-xs text-slate-300">
              Catatan
            </label>
            <input
              id="pay-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Gaji pokok + tunjangan"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            {submitting ? 'Menyimpan...' : 'Simpan Draf Gaji'}
          </button>
        </form>
      </div>
    </div>
  );
};
