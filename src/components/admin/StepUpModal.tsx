import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, X } from 'lucide-react';

interface StepUpModalProps {
  isOpen: boolean;
  actionTitle: string;
  actionDescription: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (credentials: { stepUpPassword: string; stepUpTotpCode: string }) => void;
}

export const StepUpModal: React.FC<StepUpModalProps> = ({
  isOpen,
  actionTitle,
  actionDescription,
  submitting,
  error,
  onCancel,
  onConfirm
}) => {
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({
      stepUpPassword: password,
      stepUpTotpCode: totpCode.trim()
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-up-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="step-up-modal-title" className="font-display text-lg font-bold text-slate-100">
                Verifikasi Ulang Aksi Sensitif
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{actionTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup dialog verifikasi"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/70 border border-slate-800 rounded-lg p-3.5">
          {actionDescription}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="step-up-password" className="block text-xs font-medium text-slate-300">
              Sandi Akun Anda
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="step-up-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan sandi akun"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="step-up-totp" className="block text-xs font-medium text-slate-300">
              Kode Authenticator (TOTP 6 Digit)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="step-up-totp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm font-mono tracking-widest text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-300 bg-rose-950/60 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || !password || totpCode.length !== 6}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              {submitting ? 'Memverifikasi...' : 'Konfirmasi & Jalankan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
