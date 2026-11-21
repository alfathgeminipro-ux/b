import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Check,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  UserPlus
} from 'lucide-react';
import { signInWithGoogle } from '../../lib/firebase';
import type { AdminSessionState } from '../../types/admin';
import { AdminApiError, adminFetch, setAdminSessionToken } from '../../utils/adminApi';

interface FallbackChallenge {
  challengeId: string;
  prompt: string;
}

interface AdminLoginViewProps {
  needsOwnerBootstrap: boolean;
  needsTotpEnrollment: boolean;
  sessionAdminEmail?: string;
  initialLockedUntilMs: number | null;
  initialRequireCaptcha: boolean;
  initialTurnstileSiteKey: string;
  initialFallbackChallenge: FallbackChallenge | null;
  onAuthenticated: (session: AdminSessionState) => void;
  onBlocked: (message: string) => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  needsOwnerBootstrap,
  needsTotpEnrollment,
  sessionAdminEmail,
  initialLockedUntilMs,
  initialRequireCaptcha,
  initialTurnstileSiteKey,
  initialFallbackChallenge,
  onAuthenticated,
  onBlocked
}) => {
  // Bootstrap Owner state
  const [bootstrapEmail, setBootstrapEmail] = useState('owner@alstore.id');
  const [bootstrapName, setBootstrapName] = useState('Owner ALSTORE');
  const [bootstrapPassword, setBootstrapPassword] = useState('');

  // Login state
  const [email, setEmail] = useState('owner@alstore.id');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);

  // Lockout & CAPTCHA state
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(initialLockedUntilMs);
  const [requireCaptcha, setRequireCaptcha] = useState(initialRequireCaptcha);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(initialTurnstileSiteKey);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [fallbackChallenge, setFallbackChallenge] = useState<FallbackChallenge | null>(
    initialFallbackChallenge
  );
  const [challengeAnswer, setChallengeAnswer] = useState('');

  // Mandatory Owner TOTP Enrollment state
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [enrollCode, setEnrollCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick every second while locked out
  useEffect(() => {
    if (!lockedUntilMs || lockedUntilMs <= Date.now()) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntilMs]);

  // Load Cloudflare Turnstile script only when configured and required
  useEffect(() => {
    if (!requireCaptcha || !turnstileSiteKey) return;
    const existing = document.querySelector('script[data-turnstile="1"]');
    const mountWidget = () => {
      const el = document.getElementById('alstore-turnstile-container');
      if (el && window.turnstile && !el.hasChildNodes()) {
        window.turnstile.render(el, {
          sitekey: turnstileSiteKey,
          callback: (token) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken('')
        });
      }
    };
    if (existing) {
      mountWidget();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = '1';
    script.onload = mountWidget;
    document.head.appendChild(script);
  }, [requireCaptcha, turnstileSiteKey]);

  // Auto-init TOTP setup QR when Owner enters mandatory enrollment screen
  useEffect(() => {
    if (!needsTotpEnrollment) return;
    let active = true;
    adminFetch<{ secretBase32: string; qrDataUrl: string }>('/api/admin/auth/totp/setup', {
      method: 'POST',
      body: {}
    })
      .then((res) => {
        if (!active) return;
        setTotpSecret(res.secretBase32);
        setTotpQrDataUrl(res.qrDataUrl);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal menyiapkan TOTP 2FA.');
      });
    return () => {
      active = false;
    };
  }, [needsTotpEnrollment]);

  const remainingLockSeconds =
    lockedUntilMs && lockedUntilMs > nowMs ? Math.ceil((lockedUntilMs - nowMs) / 1000) : 0;

  const handleBootstrapOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await adminFetch<AdminSessionState>('/api/admin/auth/bootstrap-owner', {
        method: 'POST',
        body: {
          email: bootstrapEmail,
          fullName: bootstrapName,
          password: bootstrapPassword
        }
      });
      setBootstrapPassword('');
      setAdminSessionToken(session.sessionToken);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengaktifkan akun Owner.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await adminFetch<
        AdminSessionState & { requiresTotp?: boolean; message?: string }
      >('/api/admin/auth/login', {
        method: 'POST',
        body: {
          email,
          password,
          totpCode: requiresTotp ? totpCode : undefined,
          turnstileToken: turnstileToken || undefined,
          challengeId: fallbackChallenge?.challengeId,
          challengeAnswer: challengeAnswer || undefined
        }
      });

      if (res.requiresTotp) {
        setRequiresTotp(true);
        setError(null);
        return;
      }

      setPassword('');
      setTotpCode('');
      setAdminSessionToken(res.sessionToken);
      onAuthenticated(res);
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.payload.blocked === true) {
          onBlocked(err.message);
          return;
        }
        if (typeof err.payload.lockedUntilMs === 'number') {
          setLockedUntilMs(err.payload.lockedUntilMs);
        }
        if (err.payload.requireCaptcha === true) {
          setRequireCaptcha(true);
        }
        if (typeof err.payload.turnstileSiteKey === 'string') {
          setTurnstileSiteKey(err.payload.turnstileSiteKey);
        }
        if (err.payload.fallbackChallenge && typeof err.payload.fallbackChallenge === 'object') {
          setFallbackChallenge(err.payload.fallbackChallenge as FallbackChallenge);
          setChallengeAnswer('');
        }
        setError(err.message);
      } else {
        setError('Sandi salah');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminFetch('/api/admin/auth/totp/confirm', {
        method: 'POST',
        body: { code: enrollCode }
      });
      const refreshed = await adminFetch<AdminSessionState>('/api/admin/auth/session');
      setAdminSessionToken(refreshed.sessionToken);
      onAuthenticated(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kode TOTP tidak valid.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleOwnerLogin = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      const user = await signInWithGoogle();
      const idToken = await user.getIdToken();
      const session = await adminFetch<AdminSessionState>('/api/admin/auth/firebase-sso', {
        method: 'POST',
        body: {},
        bearerToken: idToken
      });
      setAdminSessionToken(session.sessionToken);
      onAuthenticated(session);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setError('Jendela login Google ditutup sebelum selesai.');
      } else if (code === 'auth/popup-blocked') {
        setError('Popup diblokir oleh browser. Izinkan popup untuk login Owner via Google.');
      } else if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError('Gagal masuk dengan akun Google. Pastikan akun Anda terdaftar sebagai Owner.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleCopySecret = async () => {
    if (!totpSecret) return;
    try {
      await navigator.clipboard.writeText(totpSecret);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-7 space-y-6">
        <div className="flex items-center gap-3.5 border-b border-slate-800 pb-5">
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shrink-0">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_6thn0x6thn0x6thn_dd57a2b3.jpeg"
              alt="Logo ALSTORE"
              className="w-full h-full object-cover scale-[1.15]"
            />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-slate-50 leading-tight">
              Panel Admin Tertutup ALSTORE
            </h1>
            <p className="text-xs text-slate-400">
              Akses Internal · Terproteksi Argon2id &amp; TOTP 2FA
            </p>
          </div>
        </div>

        {/* STATE A: Mandatory Owner TOTP 2FA Enrollment */}
        {needsTotpEnrollment ? (
          <form onSubmit={handleConfirmTotp} className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-3.5 text-xs text-amber-200 space-y-1">
              <p className="font-semibold text-amber-300">Wajib Aktivasi TOTP 2FA untuk Owner</p>
              <p>
                Pindai QR di bawah dengan Google Authenticator, Authy, atau 1Password ({sessionAdminEmail}), lalu masukkan kode 6 digit untuk membuka dasbor.
              </p>
            </div>

            {totpQrDataUrl ? (
              <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800">
                <img
                  src={totpQrDataUrl}
                  alt="QR Code TOTP 2FA Owner ALSTORE"
                  className="w-44 h-44 rounded-md bg-white p-1.5"
                />
                <div className="w-full flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-md px-3 py-2">
                  <code
                    data-testid="totp-setup-secret"
                    className="font-mono text-xs text-sky-300 truncate"
                  >
                    {totpSecret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedSecret ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-48 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-xs text-slate-400">
                Menyiapkan kunci TOTP...
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="enroll-totp-code" className="block text-xs font-medium text-slate-300">
                Kode Verifikasi 6 Digit
              </label>
              <input
                id="enroll-totp-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono text-base tracking-[0.25em] text-center text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-300 bg-rose-950/60 border border-rose-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || enrollCode.length !== 6}
              className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting ? 'Memverifikasi...' : 'Aktifkan TOTP 2FA & Masuk Dasbor'}
            </button>
          </form>
        ) : needsOwnerBootstrap ? (
          /* STATE B: First-Run Owner Setup (Only when ADMIN_INITIAL_PASSWORD env is unset) */
          <form onSubmit={handleBootstrapOwner} className="space-y-4">
            <div className="rounded-lg border border-sky-500/30 bg-sky-950/30 p-3.5 text-xs text-sky-200 space-y-1">
              <p className="font-semibold text-sky-300">Aktivasi Akun Owner Pertama</p>
              <p>
                Variabel lingkungan <code className="font-mono">ADMIN_INITIAL_PASSWORD</code> belum diisi. Buat akun Owner pertama di sini (disimpan sebagai hash Argon2id, formulir ini terkunci otomatis setelah aktif).
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="boot-name" className="block text-xs font-medium text-slate-300">
                Nama Lengkap Owner
              </label>
              <input
                id="boot-name"
                type="text"
                required
                value={bootstrapName}
                onChange={(e) => setBootstrapName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="boot-email" className="block text-xs font-medium text-slate-300">
                Email Owner
              </label>
              <input
                id="boot-email"
                type="email"
                required
                value={bootstrapEmail}
                onChange={(e) => setBootstrapEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="boot-password" className="block text-xs font-medium text-slate-300">
                Sandi Awal Owner
              </label>
              <input
                id="boot-password"
                type="password"
                required
                minLength={6}
                value={bootstrapPassword}
                onChange={(e) => setBootstrapPassword(e.target.value)}
                placeholder="Minimal 6 karakter (disarankan 12+ kombinasi kuat)"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-300 bg-rose-950/60 border border-rose-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              {submitting ? 'Mengaktifkan...' : 'Aktifkan Akun Owner'}
            </button>
          </form>
        ) : (
          /* STATE C: Standard Admin Login Form */
          <form onSubmit={handleLogin} className="space-y-4">
            {remainingLockSeconds > 0 && (
              <div
                data-testid="lockout-banner"
                className="rounded-lg border border-rose-500/35 bg-rose-950/40 p-3.5 flex items-start gap-2.5 text-xs text-rose-200"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-rose-300">Login Terkunci Sementara</p>
                  <p className="mt-0.5 font-mono tabular-nums">
                    Sisa waktu kunci: {Math.floor(remainingLockSeconds / 60)}m{' '}
                    {String(remainingLockSeconds % 60).padStart(2, '0')}d
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="block text-xs font-medium text-slate-300">
                Email Staf / Owner
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@alstore.id"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="block text-xs font-medium text-slate-300">
                Sandi
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan sandi Anda"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {requiresTotp && (
              <div className="space-y-1.5">
                <label htmlFor="admin-totp" className="block text-xs font-medium text-sky-300">
                  Kode Verifikasi TOTP (6 Digit)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-sky-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-950 border border-sky-500/60 font-mono text-sm tracking-widest text-slate-100 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>
            )}

            {/* CAPTCHA Gate after 3+ failed attempts */}
            {requireCaptcha && (
              <div
                data-testid="captcha-gate"
                className="rounded-lg border border-amber-500/35 bg-amber-950/25 p-3.5 space-y-2.5"
              >
                <p className="text-xs font-semibold text-amber-300">
                  Verifikasi Keamanan Diperlukan (CAPTCHA)
                </p>
                {turnstileSiteKey ? (
                  <div id="alstore-turnstile-container" />
                ) : fallbackChallenge ? (
                  <div className="space-y-1.5">
                    <label htmlFor="captcha-answer" className="block text-xs text-slate-300">
                      {fallbackChallenge.prompt}
                    </label>
                    <input
                      id="captcha-answer"
                      type="text"
                      inputMode="numeric"
                      required
                      value={challengeAnswer}
                      onChange={(e) => setChallengeAnswer(e.target.value)}
                      placeholder="Masukkan angka jawaban"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                ) : null}
              </div>
            )}

            {error && (
              <p
                role="alert"
                data-testid="admin-login-error"
                className="text-xs font-medium text-rose-300 bg-rose-950/60 border border-rose-500/30 rounded-lg px-3.5 py-2.5"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || googleSubmitting || remainingLockSeconds > 0}
              className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
            >
              {submitting
                ? 'Memverifikasi...'
                : requiresTotp
                  ? 'Verifikasi TOTP & Masuk'
                  : 'Masuk ke Panel Admin'}
            </button>
          </form>
        )}

        {!needsTotpEnrollment && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <span className="text-[11px] text-slate-500">atau akses Owner terverifikasi</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>
            <button
              type="button"
              data-testid="admin-google-owner-login"
              disabled={submitting || googleSubmitting}
              onClick={handleGoogleOwnerLogin}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800/80 disabled:opacity-50 text-slate-100 font-medium text-xs transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                {googleSubmitting ? 'Memverifikasi akun Google...' : 'Masuk Langsung Owner via Google'}
              </span>
            </button>
          </div>
        )}

        <p className="text-[11px] text-slate-500 text-center leading-relaxed border-t border-slate-800 pt-4">
          Seluruh percobaan masuk dicatat (waktu, IP, perangkat). Sesi berakhir otomatis setelah 15 menit tidak aktif.
        </p>
      </div>
    </div>
  );
};
