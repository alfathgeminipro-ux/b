import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { signInWithApple, signInWithGoogle } from '../lib/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignInIntent?: () => void;
  onSignInCancel?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSignInIntent,
  onSignInCancel
}) => {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setLoadingProvider('google');
    onSignInIntent?.();
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: unknown) {
      onSignInCancel?.();
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setErrorMessage('Jendela login Google ditutup sebelum selesai.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMessage('Popup diblokir oleh browser. Izinkan popup untuk melanjutkan login Google.');
      } else {
        setErrorMessage('Login Google gagal. Pastikan konfigurasi Firebase Anda aktif.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleAppleSignIn = async () => {
    setErrorMessage(null);
    setLoadingProvider('apple');
    onSignInIntent?.();
    try {
      await signInWithApple();
      onClose();
    } catch (err: unknown) {
      onSignInCancel?.();
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setErrorMessage('Jendela login Apple ditutup sebelum selesai.');
      } else if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/configuration-not-found'
      ) {
        setErrorMessage(
          'Provider Apple Sign-In belum diaktifkan di Firebase Console Anda. Aktifkan Apple di Authentication > Sign-in method dan atur Service ID di src/firebase-config.js.'
        );
      } else {
        setErrorMessage('Login Apple gagal. Pastikan Apple Service ID sudah aktif di Firebase Console.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md"
    >
      <div className="liquid-glass-strong rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-6 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup Modal Login"
          className="absolute right-5 top-5 w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-opacity hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-3 pr-8">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[22%] overflow-hidden shrink-0 ring-1 ring-white/20 shadow-md bg-[#0b1020]">
              <img
                src="/assets/aistudio/Gemini_Generated_Image_6thn0x6thn0x6thn_dd57a2b3.jpeg"
                alt="Logo ALSTORE"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover scale-[1.15]"
              />
            </span>
            <div>
              <div className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                Akun Member ALSTORE
              </div>
              <h2
                id="auth-modal-title"
                className="font-display text-2xl font-extrabold tracking-tight leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Masuk atau Daftar
              </h2>
            </div>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Simpan riwayat transaksi lintas perangkat dan isi otomatis ID game favorit serta nomor WhatsApp Anda.
          </p>
        </div>

        <div className="space-y-3">
          {/* Official Google Sign-In Button with Liquid Glass Finish */}
          <button
            type="button"
            disabled={loadingProvider !== null}
            onClick={handleGoogleSignIn}
            className="w-full h-12 px-5 rounded-xl bg-white text-[#1F1F1F] hover:bg-slate-50 active:scale-[0.985] transition-all border border-slate-200/90 shadow-md flex items-center justify-center gap-3 text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.29A7.19 7.19 0 0 1 4.9 12c0-.79.14-1.56.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1z"
              />
              <path
                fill="#EA4335"
                d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1c.95-2.84 3.6-4.95 6.72-4.95z"
              />
            </svg>
            <span>
              {loadingProvider === 'google' ? 'Menghubungkan Google...' : 'Continue with Google'}
            </span>
          </button>

          {/* Official Apple Sign-In Button with Liquid Glass Specular Edge */}
          <button
            type="button"
            disabled={loadingProvider !== null}
            onClick={handleAppleSignIn}
            className="w-full h-12 px-5 rounded-xl bg-black text-white hover:bg-neutral-900 active:scale-[0.985] transition-all border border-white/20 shadow-md flex items-center justify-center gap-3 text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            <svg className="w-5 h-5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
            </svg>
            <span>
              {loadingProvider === 'apple' ? 'Menghubungkan Apple...' : 'Continue with Apple'}
            </span>
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl p-3 text-xs leading-relaxed"
            style={{
              background: 'rgba(225, 29, 72, 0.12)',
              border: '1px solid rgba(225, 29, 72, 0.35)',
              color: 'var(--danger)'
            }}
          >
            {errorMessage}
          </div>
        )}

        <div
          className="pt-3 border-t flex items-start gap-2.5 text-xs"
          style={{ borderColor: 'var(--divider)', color: 'var(--text-muted)' }}
        >
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
          <span>
            Autentikasi terenkripsi melalui Firebase Authentication. Anda tetap dapat melakukan top-up cepat tanpa wajib login.
          </span>
        </div>
      </div>
    </div>
  );
};
