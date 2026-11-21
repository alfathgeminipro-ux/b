import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  X
} from 'lucide-react';
import type { AdminUserPublic } from '../../types/admin';
import { adminFetch } from '../../utils/adminApi';
import {
  formatBase32SecretGroups,
  getTotpSecondsRemaining,
  isCompleteTotpCode,
  normalizeTotpCodeInput
} from '../../utils/totpFormat';

interface AdminSecuritySettingsModalProps {
  isOpen: boolean;
  admin: AdminUserPublic;
  authMethod?: 'password' | 'firebase_sso';
  onClose: () => void;
  onAdminUpdated: (updated: AdminUserPublic) => void;
  onStatusToast?: (message: string) => void;
}

type ModalFlowMode = 'idle' | 'setup_qr' | 'confirm_disable';

interface GeneratedQrState {
  secretBase32: string;
  otpAuthUri: string;
  qrDataUrl: string;
}

export const AdminSecuritySettingsModal: React.FC<AdminSecuritySettingsModalProps> = ({
  isOpen,
  admin,
  authMethod = 'password',
  onClose,
  onAdminUpdated,
  onStatusToast
}) => {
  const [mode, setMode] = useState<ModalFlowMode>('idle');
  const [qrState, setQrState] = useState<GeneratedQrState | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [enableCode, setEnableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [totpWindowSeconds, setTotpWindowSeconds] = useState(() => getTotpSecondsRemaining());

  const resetTransientState = useCallback(() => {
    setMode('idle');
    setQrState(null);
    setGeneratingQr(false);
    setEnableCode('');
    setDisablePassword('');
    setDisableCode('');
    setSubmitting(false);
    setCopiedSecret(false);
    setError(null);
    setSuccessMsg(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetTransientState();
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, resetTransientState, submitting]);

  // Keep the 30-second RFC 6238 code rotation timer current while entering a 6-digit code
  useEffect(() => {
    if (!isOpen || mode === 'idle') return;
    setTotpWindowSeconds(getTotpSecondsRemaining());
    const id = window.setInterval(() => {
      setTotpWindowSeconds(getTotpSecondsRemaining());
    }, 1000);
    return () => window.clearInterval(id);
  }, [isOpen, mode]);

  const handleGenerateQr = useCallback(async () => {
    setError(null);
    setSuccessMsg(null);
    setGeneratingQr(true);
    setCopiedSecret(false);
    setEnableCode('');
    setMode('setup_qr');
    try {
      const res = await adminFetch<GeneratedQrState>('/api/admin/auth/totp/setup', {
        method: 'POST',
        body: {}
      });
      setQrState(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat kode QR TOTP.');
    } finally {
      setGeneratingQr(false);
    }
  }, []);

  const handleCopySecret = async () => {
    if (!qrState?.secretBase32) return;
    try {
      await navigator.clipboard.writeText(qrState.secretBase32);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      setError('Tidak dapat menyalin otomatis. Silakan salin kunci secara manual.');
    }
  };

  const handleConfirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCompleteTotpCode(enableCode)) {
      setError('Masukkan 6 digit kode dari aplikasi autentikator Anda.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await adminFetch<{ ok: boolean; admin: AdminUserPublic }>(
        '/api/admin/auth/totp/confirm',
        {
          method: 'POST',
          body: { code: normalizeTotpCodeInput(enableCode) }
        }
      );
      const wasEnabled = admin.totpEnabled;
      onAdminUpdated(res.admin);
      setMode('idle');
      setQrState(null);
      setEnableCode('');
      const msg = wasEnabled
        ? 'Perangkat autentikator TOTP 2FA berhasil diperbarui.'
        : 'Verifikasi dua langkah (TOTP 2FA) berhasil diaktifkan.';
      setSuccessMsg(msg);
      onStatusToast?.(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kode TOTP 6 digit tidak valid.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMethod !== 'firebase_sso' && !disablePassword.trim()) {
      setError('Masukkan sandi saat ini untuk mengonfirmasi penonaktifan 2FA.');
      return;
    }
    if (!isCompleteTotpCode(disableCode)) {
      setError('Masukkan kode TOTP 6 digit yang aktif dari aplikasi autentikator Anda.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await adminFetch<{ ok: boolean; admin: AdminUserPublic }>(
        '/api/admin/auth/totp/disable',
        {
          method: 'POST',
          body: {
            currentPassword: disablePassword,
            totpCode: normalizeTotpCodeInput(disableCode)
          }
        }
      );
      onAdminUpdated(res.admin);
      setMode('idle');
      setDisablePassword('');
      setDisableCode('');
      const msg = 'Verifikasi dua langkah (TOTP 2FA) berhasil dinonaktifkan.';
      setSuccessMsg(msg);
      onStatusToast?.(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menonaktifkan TOTP 2FA.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleSwitch = () => {
    if (submitting || generatingQr) return;
    setError(null);
    setSuccessMsg(null);
    if (admin.totpEnabled) {
      setDisablePassword('');
      setDisableCode('');
      setMode(mode === 'confirm_disable' ? 'idle' : 'confirm_disable');
    } else {
      if (mode === 'setup_qr') {
        setMode('idle');
        setQrState(null);
      } else {
        void handleGenerateQr();
      }
    }
  };

  if (!isOpen) return null;

  const formattedSecret = qrState ? formatBase32SecretGroups(qrState.secretBase32) : '';
  const requiresPasswordForDisable = authMethod !== 'firebase_sso';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-settings-modal-title"
      data-testid="security-settings-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-800">
          <div className="space-y-1 min-w-0">
            <h2
              id="security-settings-modal-title"
              className="font-display text-lg font-bold text-slate-50"
            >
              Pengaturan Keamanan (TOTP 2FA)
            </h2>
            <p className="text-xs text-slate-400 truncate">
              {admin.email} <span aria-hidden="true">·</span> {admin.role}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Tutup Pengaturan Keamanan"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Status + Interactive Toggle Row */}
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {admin.totpEnabled ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <ShieldOff className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="text-sm font-semibold text-slate-100">
                  Autentikasi Dua Langkah (TOTP)
                </span>
              </div>
              <p className="text-xs text-slate-400" data-testid="totp-modal-status-text">
                Status saat ini:{' '}
                <span className={admin.totpEnabled ? 'text-emerald-300 font-medium' : 'text-amber-300 font-medium'}>
                  {admin.totpEnabled ? 'Aktif' : 'Nonaktif'}
                </span>
                {' · '}
                {admin.totpEnabled
                  ? 'Melindungi login & aksi keuangan sensitif'
                  : 'Hubungkan aplikasi autentikator untuk perlindungan ekstra'}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={admin.totpEnabled}
              aria-label={admin.totpEnabled ? 'Nonaktifkan TOTP 2FA' : 'Aktifkan TOTP 2FA'}
              data-testid="totp-toggle-switch"
              disabled={submitting || generatingQr}
              onClick={handleToggleSwitch}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50 ${
                admin.totpEnabled
                  ? 'bg-emerald-500/85 border-emerald-400/50'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  admin.totpEnabled ? 'translate-x-5.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {successMsg && (
            <div
              role="status"
              data-testid="security-modal-success"
              className="rounded-lg border border-emerald-500/35 bg-emerald-950/35 px-4 py-3 text-xs text-emerald-200 flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              data-testid="security-modal-error"
              className="rounded-lg border border-rose-500/35 bg-rose-950/40 px-4 py-3 text-xs text-rose-200 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* IDLE VIEW */}
          {mode === 'idle' && (
            <div className="space-y-4">
              {admin.totpEnabled ? (
                <>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Akun Owner Anda dilindungi kode TOTP 6 digit (Google Authenticator, Authy, 1Password, atau Microsoft Authenticator). Setiap konfirmasi massal transaksi, perubahan rekening, dan pencairan gaji memerlukan kode ini.
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      data-testid="rotate-totp-btn"
                      onClick={() => void handleGenerateQr()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-medium text-sky-300 whitespace-nowrap cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Buat QR Baru (Ganti Perangkat)
                    </button>
                    <button
                      type="button"
                      data-testid="start-disable-totp-btn"
                      onClick={() => {
                        setError(null);
                        setSuccessMsg(null);
                        setDisablePassword('');
                        setDisableCode('');
                        setMode('confirm_disable');
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-500/40 bg-rose-950/30 hover:bg-rose-950/60 text-xs font-medium text-rose-300 whitespace-nowrap cursor-pointer"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      Nonaktifkan TOTP 2FA
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Aktifkan verifikasi dua langkah berbasis TOTP dengan memindai kode QR menggunakan aplikasi autentikator di ponsel Anda. Setelah aktif, aksi keuangan sensitif dapat kembali diverifikasi secara aman.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      data-testid="start-enable-totp-btn"
                      onClick={() => void handleGenerateQr()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      Buat Kode QR &amp; Aktifkan 2FA
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* SETUP / ROTATE QR GENERATOR FLOW */}
          {mode === 'setup_qr' && (
            <form onSubmit={handleConfirmEnable} className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-100">
                  1. Pindai Kode QR di Aplikasi Autentikator
                </p>
                <button
                  type="button"
                  data-testid="regenerate-qr-btn"
                  disabled={generatingQr || submitting}
                  onClick={() => void handleGenerateQr()}
                  className="inline-flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generatingQr ? 'animate-spin' : ''}`} />
                  Buat Ulang QR
                </button>
              </div>

              {generatingQr || !qrState ? (
                <div className="h-52 rounded-lg border border-slate-800 bg-slate-950 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
                  <span>Membuat kunci rahasia &amp; kode QR TOTP...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-center gap-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
                    <div className="bg-white p-2.5 rounded-lg shrink-0">
                      <img
                        src={qrState.qrDataUrl}
                        alt="Kode QR TOTP 2FA untuk Aplikasi Autentikator"
                        data-testid="security-modal-qr-img"
                        className="w-40 h-40 block"
                      />
                    </div>
                    <div className="space-y-2.5 min-w-0 flex-1 w-full">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Buka Google Authenticator, Authy, atau 1Password lalu pindai kode QR di samping. Atau masukkan kunci pengaturan manual berikut:
                      </p>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                        <code
                          data-testid="security-modal-secret-key"
                          className="font-mono text-xs text-sky-300 break-words leading-relaxed select-all"
                        >
                          {formattedSecret}
                        </code>
                        <button
                          type="button"
                          data-testid="copy-secret-btn"
                          onClick={() => void handleCopySecret()}
                          className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedSecret ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedSecret ? 'Tersalin' : 'Salin'}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        ALSTORE Admin · SHA-1 · 6 digit · 30 dtk
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="security-modal-enable-code"
                    className="block text-xs font-medium text-slate-300"
                  >
                    2. Masukkan Kode Verifikasi 6 Digit
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    Siklus {totpWindowSeconds} dtk
                  </span>
                </div>
                <input
                  id="security-modal-enable-code"
                  data-testid="enable-totp-code-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={enableCode}
                  onChange={(e) => setEnableCode(normalizeTotpCodeInput(e.target.value))}
                  placeholder="123456"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono tabular-nums text-base tracking-[0.25em] text-center text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              {admin.totpEnabled && (
                <p className="text-[11px] text-slate-400">
                  TOTP lama tetap aktif sampai Anda berhasil mengonfirmasi kode 6 digit dari perangkat baru ini.
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setMode('idle');
                    setQrState(null);
                    setEnableCode('');
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  data-testid="confirm-enable-totp-btn"
                  disabled={submitting || generatingQr || !qrState || !isCompleteTotpCode(enableCode)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {submitting ? 'Memverifikasi...' : 'Verifikasi & Aktifkan 2FA'}
                </button>
              </div>
            </form>
          )}

          {/* CONFIRM DISABLE FLOW (STEP-UP VERIFICATION) */}
          {mode === 'confirm_disable' && (
            <form onSubmit={handleConfirmDisable} className="space-y-4">
              <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 p-3.5 text-xs text-amber-200 space-y-1">
                <p className="font-semibold text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Konfirmasi Penonaktifan TOTP 2FA
                </p>
                <p className="text-amber-200/85 leading-relaxed">
                  Menonaktifkan TOTP 2FA akan menghapus kunci autentikator saat ini dan mencatat aksi ini ke Log Aktivitas. Aksi keuangan sensitif (konfirmasi massal, ubah rekening, pencairan gaji) akan meminta aktivasi ulang TOTP 2FA.
                </p>
              </div>

              {requiresPasswordForDisable && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="security-modal-disable-password"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Sandi Akun Owner Saat Ini
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="security-modal-disable-password"
                      data-testid="disable-totp-password-input"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder="Masukkan sandi Owner"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="security-modal-disable-code"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Kode TOTP 6 Digit Saat Ini
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    Siklus {totpWindowSeconds} dtk
                  </span>
                </div>
                <input
                  id="security-modal-disable-code"
                  data-testid="disable-totp-code-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={disableCode}
                  onChange={(e) => setDisableCode(normalizeTotpCodeInput(e.target.value))}
                  placeholder="123456"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono tabular-nums text-base tracking-[0.25em] text-center text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setMode('idle');
                    setDisablePassword('');
                    setDisableCode('');
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  data-testid="confirm-disable-totp-btn"
                  disabled={
                    submitting ||
                    !isCompleteTotpCode(disableCode) ||
                    (requiresPasswordForDisable && !disablePassword.trim())
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  {submitting ? 'Memverifikasi...' : 'Nonaktifkan 2FA Sekarang'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
