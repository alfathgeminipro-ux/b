import React, { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  Settings,
  ShieldCheck,
  Unlock,
  UserPlus
} from 'lucide-react';
import type {
  AdminRole,
  AdminSettingsRecord,
  AdminUserPublic,
  AuditLogRecord,
  IpDeviceBlockRecord,
  LoginAttemptRecord
} from '../../types/admin';
import { adminFetch, formatDateTimeId, formatIdr } from '../../utils/adminApi';

interface StaffProps {
  staff: AdminUserPublic[];
  currentAdminId: string;
  onRefresh: () => void;
}

export const AdminStaffSection: React.FC<StaffProps> = ({
  staff,
  currentAdminId,
  onRefresh
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<AdminRole, 'OWNER'>>('ADMIN');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await adminFetch('/api/admin/staff', {
        method: 'POST',
        body: { fullName, email, role, password }
      });
      setFullName('');
      setEmail('');
      setPassword('');
      setFeedback({
        type: 'ok',
        text: 'Akun staf baru berhasil dibuat dengan sandi terenkripsi Argon2id. Setiap aksi akan tercatat atas nama akun ini.'
      });
      onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal membuat akun staf.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (member: AdminUserPublic) => {
    setFeedback(null);
    try {
      await adminFetch(`/api/admin/staff/${encodeURIComponent(member.id)}/status`, {
        method: 'PATCH',
        body: { isActive: !member.isActive }
      });
      onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengubah status staf.'
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-50">Manajemen Staf Admin</h2>
        <p className="text-xs text-slate-400 mt-1">
          Setiap karyawan memiliki akun dan sandi masing-masing (dilarang berbagi sandi) agar seluruh aksi tercatat akurat di Audit Log.
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs ${
            feedback.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-950/35 text-emerald-200'
              : 'border-rose-500/30 bg-rose-950/35 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <tr>
                  <th className="py-3 px-4 font-medium">Nama &amp; Email</th>
                  <th className="py-3 px-4 font-medium">Peran</th>
                  <th className="py-3 px-4 font-medium">TOTP 2FA</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {staff.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/30">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-100">{m.fullName}</p>
                      <p className="font-mono text-[11px] text-slate-400">{m.email}</p>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-sky-300">{m.role}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {m.totpEnabled ? 'Aktif' : m.totpRequired ? 'Wajib' : 'Opsional'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={m.isActive ? 'text-emerald-300' : 'text-rose-300'}>
                        {m.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {m.role !== 'OWNER' && m.id !== currentAdminId ? (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(m)}
                          className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs whitespace-nowrap cursor-pointer"
                        >
                          {m.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">Owner Utama</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form
          onSubmit={handleCreateStaff}
          className="lg:col-span-4 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3.5"
        >
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-sky-400" />
            Buat Akun Staf Baru
          </h3>

          <div className="space-y-1">
            <label htmlFor="staff-name" className="block text-xs text-slate-300">
              Nama Lengkap
            </label>
            <input
              id="staff-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Contoh: Raka Pratama"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="staff-email" className="block text-xs text-slate-300">
              Email Staf
            </label>
            <input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="raka@alstore.id"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="staff-role" className="block text-xs text-slate-300">
              Peran Akses
            </label>
            <select
              id="staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'KEUANGAN')}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            >
              <option value="ADMIN">Admin (Transaksi, Konfirmasi, Banner)</option>
              <option value="KEUANGAN">Keuangan (Laporan &amp; Siapkan Gaji)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="staff-pass" className="block text-xs text-slate-300">
              Sandi Pribadi (Min. 12 karakter, huruf besar/kecil, angka, simbol)
            </label>
            <input
              id="staff-pass"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contoh: Staf#Alstore2026!"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            {submitting ? 'Membuat Akun...' : 'Buat Akun Staf'}
          </button>
        </form>
      </div>
    </div>
  );
};

interface SecurityLogsProps {
  attempts: LoginAttemptRecord[];
  blocks: IpDeviceBlockRecord[];
  auditLogs: AuditLogRecord[];
  onRefresh: () => void;
}

export const AdminSecurityLogsSection: React.FC<SecurityLogsProps> = ({
  attempts,
  blocks,
  auditLogs,
  onRefresh
}) => {
  const [subTab, setSubTab] = useState<'attempts' | 'blocks' | 'audit'>('attempts');
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const handleUnblock = async (id: string) => {
    setUnblockingId(id);
    try {
      await adminFetch(`/api/admin/blocks/${encodeURIComponent(id)}/unblock`, {
        method: 'POST',
        body: {}
      });
      onRefresh();
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-50">Log Keamanan &amp; Audit</h2>
          <p className="text-xs text-slate-400 mt-1">
            Merekam waktu, IP, user agent, target akun (tanpa pernah menyimpan sandi), daftar blokir, dan audit aksi staf.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('attempts')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
              subTab === 'attempts' ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Percobaan Masuk ({attempts.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('blocks')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
              subTab === 'blocks' ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Blokir IP/Perangkat ({blocks.filter((b) => b.active).length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
              subTab === 'audit' ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Audit Aksi ({auditLogs.length})
          </button>
        </div>
      </div>

      {subTab === 'attempts' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <tr>
                  <th className="py-3 px-4 font-medium">Waktu</th>
                  <th className="py-3 px-4 font-medium">IP &amp; Perangkat</th>
                  <th className="py-3 px-4 font-medium">Target / Path</th>
                  <th className="py-3 px-4 font-medium">Jenis</th>
                  <th className="py-3 px-4 font-medium">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {attempts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Belum ada catatan percobaan masuk.
                    </td>
                  </tr>
                ) : (
                  attempts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {formatDateTimeId(a.createdAtMs)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono text-slate-100">{a.ipAddress}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[240px]" title={a.userAgent}>
                          {a.deviceHash} · {a.userAgent}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-200">{a.targetAccount}</td>
                      <td className="py-3 px-4">
                        <span
                          className={
                            a.attemptType === 'login_success'
                              ? 'text-emerald-300'
                              : a.attemptType === 'blocked_path'
                                ? 'text-rose-300'
                                : 'text-amber-300'
                          }
                        >
                          {a.attemptType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{a.outcome}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'blocks' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <tr>
                  <th className="py-3 px-4 font-medium">Waktu Blokir</th>
                  <th className="py-3 px-4 font-medium">IP &amp; Perangkat</th>
                  <th className="py-3 px-4 font-medium">Alasan</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {blocks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Tidak ada IP atau perangkat yang diblokir.
                    </td>
                  </tr>
                ) : (
                  blocks.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {formatDateTimeId(b.blockedAtMs)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono text-slate-100">{b.ipAddress}</p>
                        <p className="text-[11px] text-slate-400">{b.deviceHash}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{b.reason}</td>
                      <td className="py-3 px-4">
                        {b.active ? (
                          <span className="text-rose-300 font-medium">Diblokir Aktif</span>
                        ) : (
                          <span className="text-emerald-300">Dibuka oleh {b.unblockedBy}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {b.active && (
                          <button
                            type="button"
                            disabled={unblockingId === b.id}
                            onClick={() => handleUnblock(b.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs whitespace-nowrap cursor-pointer"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Buka Blokir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'audit' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <tr>
                  <th className="py-3 px-4 font-medium">Waktu</th>
                  <th className="py-3 px-4 font-medium">Aktor</th>
                  <th className="py-3 px-4 font-medium">Aksi</th>
                  <th className="py-3 px-4 font-medium">Detail</th>
                  <th className="py-3 px-4 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {formatDateTimeId(log.createdAtMs)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-100">{log.actorName}</p>
                      <p className="font-mono text-[11px] text-sky-300">{log.actorRole}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-200">{log.action}</td>
                    <td className="py-3 px-4 text-slate-300">{log.details}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

interface SecuritySettingsProps {
  admin: AdminUserPublic;
  settings: AdminSettingsRecord | null;
  onAdminUpdated: (updated: AdminUserPublic) => void;
  onRefreshSettings: () => void;
  onOpenSecurityModal?: () => void;
}

export const AdminSecuritySettingsSection: React.FC<SecuritySettingsProps> = ({
  admin,
  settings,
  onAdminUpdated,
  onRefreshSettings,
  onOpenSecurityModal
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingPwd, setSavingPwd] = useState(false);

  const [feeInput, setFeeInput] = useState(String(settings?.violationFeeIdr ?? 90000));
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [totpQr, setTotpQr] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpMsg, setTotpMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    setSavingPwd(true);
    try {
      const res = await adminFetch<{ ok: boolean; admin: AdminUserPublic }>(
        '/api/admin/auth/change-password',
        {
          method: 'POST',
          body: { currentPassword, newPassword }
        }
      );
      setCurrentPassword('');
      setNewPassword('');
      onAdminUpdated(res.admin);
      setPwdMsg({
        type: 'ok',
        text: 'Sandi berhasil diperbarui dengan hash Argon2id yang kuat.'
      });
    } catch (err) {
      setPwdMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memperbarui sandi.'
      });
    } finally {
      setSavingPwd(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsMsg(null);
    setSavingSettings(true);
    try {
      const res = await adminFetch<{ ok: boolean; violationFeeIdr: number }>('/api/admin/settings', {
        method: 'PUT',
        body: { violationFeeIdr: Number(feeInput) }
      });
      setSettingsMsg({
        type: 'ok',
        text: `Biaya pelanggaran akses diperbarui menjadi ${formatIdr(res.violationFeeIdr)}.`
      });
      onRefreshSettings();
    } catch (err) {
      setSettingsMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.'
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleStartStaffTotp = async () => {
    setTotpMsg(null);
    try {
      const res = await adminFetch<{ secretBase32: string; qrDataUrl: string }>(
        '/api/admin/auth/totp/setup',
        { method: 'POST', body: {} }
      );
      setTotpQr(res.qrDataUrl);
      setTotpSecret(res.secretBase32);
    } catch (err) {
      setTotpMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memulai setup TOTP.'
      });
    }
  };

  const handleConfirmStaffTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpMsg(null);
    try {
      const res = await adminFetch<{ ok: boolean; admin: AdminUserPublic }>(
        '/api/admin/auth/totp/confirm',
        { method: 'POST', body: { code: totpCode } }
      );
      setTotpQr('');
      setTotpSecret('');
      setTotpCode('');
      onAdminUpdated(res.admin);
      setTotpMsg({ type: 'ok', text: 'TOTP 2FA berhasil diaktifkan pada akun Anda.' });
    } catch (err) {
      setTotpMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Kode TOTP tidak valid.'
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-50">Keamanan Akun &amp; Pengaturan</h2>
        <p className="text-xs text-slate-400 mt-1">
          Kelola kekuatan sandi (Argon2id), verifikasi dua langkah TOTP 2FA, dan kebijakan keamanan panel.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Change Password */}
        <form
          onSubmit={handleChangePassword}
          className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-100">Ganti Sandi Akun</h3>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cur-pwd" className="block text-xs text-slate-300">
              Sandi Saat Ini
            </label>
            <input
              id="cur-pwd"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-pwd" className="block text-xs text-slate-300">
              Sandi Baru (Min. 12 karakter, huruf besar, kecil, angka, simbol)
            </label>
            <input
              id="new-pwd"
              type="password"
              required
              minLength={12}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Contoh: Alstore#Vault2026!"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </div>

          {pwdMsg && (
            <p
              className={`text-xs rounded-lg border px-3 py-2 ${
                pwdMsg.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-950/35 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-950/35 text-rose-200'
              }`}
            >
              {pwdMsg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={savingPwd}
            className="px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            {savingPwd ? 'Menyimpan...' : 'Perbarui Sandi'}
          </button>
        </form>

        {/* TOTP 2FA Status */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-100">Verifikasi Dua Langkah (TOTP 2FA)</h3>
            </div>
            {admin.totpEnabled ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
              </span>
            ) : (
              <span className="text-xs font-medium text-amber-300">Belum Aktif</span>
            )}
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {admin.totpEnabled
              ? 'TOTP 2FA aktif. Kode 6 digit diminta saat login dan saat melakukan aksi sensitif (konfirmasi massal, ubah rekening, pencairan gaji).'
              : 'Aktifkan TOTP 2FA agar akun Anda dapat melakukan aksi sensitif seperti konfirmasi massal transaksi.'}
          </p>

          {admin.role === 'OWNER' && onOpenSecurityModal ? (
            <button
              type="button"
              data-testid="settings-open-security-modal-btn"
              onClick={onOpenSecurityModal}
              className="px-4 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-medium cursor-pointer"
            >
              Kelola TOTP 2FA &amp; QR Autentikator
            </button>
          ) : (
            !admin.totpEnabled &&
            !totpQr && (
              <button
                type="button"
                onClick={handleStartStaffTotp}
                className="px-4 py-2 rounded-lg border border-sky-500/40 text-sky-300 hover:bg-sky-950/40 text-xs font-medium cursor-pointer"
              >
                Aktifkan TOTP 2FA Sekarang
              </button>
            )
          )}

          {totpQr && (
            <form onSubmit={handleConfirmStaffTotp} className="space-y-3 border-t border-slate-800 pt-3">
              <img src={totpQr} alt="QR TOTP 2FA" className="w-36 h-36 rounded bg-white p-1" />
              <p className="font-mono text-xs text-sky-300 break-all">{totpSecret}</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Kode 6 digit"
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 font-mono text-sm text-slate-100 w-36"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer"
                >
                  Konfirmasi
                </button>
              </div>
            </form>
          )}

          {totpMsg && (
            <p className="text-xs text-sky-200">{totpMsg.text}</p>
          )}
        </div>

        {/* Owner-Only Security Policy Settings */}
        {admin.role === 'OWNER' && settings && (
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                Pengaturan Sanksi &amp; Integrasi Keamanan (Khusus Owner)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label htmlFor="violation-fee-input" className="block text-xs text-slate-300">
                  Biaya Pelanggaran Akses Pelanggan Terdaftar (Rp)
                </label>
                <input
                  id="violation-fee-input"
                  type="number"
                  min={0}
                  step={1000}
                  required
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 font-mono text-sm text-slate-100"
                />
                <p className="text-[11px] text-slate-400">
                  Default Rp 90.000. Hanya ditagihkan ke pelanggan Google/Apple setelah ditinjau dan disetujui Owner.
                </p>
              </div>

              <div className="space-y-2 text-xs text-slate-300 bg-slate-950/70 border border-slate-800 rounded-lg p-4">
                <p className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Status Perlindungan Server
                </p>
                <p>Path Rahasia: {settings.adminPathHint}</p>
                <p>
                  Cloudflare Turnstile:{' '}
                  {settings.turnstileConfigured
                    ? 'Aktif (Site Key & Secret terpasang)'
                    : 'Mode Tantangan Server (siap dihubungkan via env TURNSTILE_*)'}
                </p>
                <p>
                  Peringatan Owner (5x gagal): Panel Owner{' '}
                  {settings.telegramConfigured ? '· Telegram Aktif' : '· Telegram (via env TELEGRAM_*)'}
                  {settings.ownerAlertEmail ? ` · Email (${settings.ownerAlertEmail})` : ''}
                </p>
              </div>
            </div>

            {settingsMsg && (
              <p
                className={`text-xs rounded-lg border px-3 py-2 ${
                  settingsMsg.type === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-950/35 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-950/35 text-rose-200'
                }`}
              >
                {settingsMsg.text}
              </p>
            )}

            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Keamanan'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
