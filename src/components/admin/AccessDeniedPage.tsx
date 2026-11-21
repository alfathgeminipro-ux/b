import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface AccessDeniedPageProps {
  message?: string;
}

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({ message }) => {
  const warningText =
    message ||
    'Percobaan akses tidak sah dicatat dan dapat dikenai sanksi sesuai ketentuan ALSTORE.';

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-950 text-slate-100">
      <main
        data-testid="access-denied-page"
        className="max-w-lg w-full rounded-xl border border-rose-500/30 bg-slate-900/90 p-8 space-y-6"
      >
        <div className="w-12 h-12 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-medium text-rose-400">
            Akses Ditolak · Proteksi Keamanan ALSTORE
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-50 leading-snug">
            Akses ke Halaman Ini Dibatasi
          </h1>
          <p
            data-testid="access-denied-message"
            className="text-sm text-slate-200 leading-relaxed bg-rose-950/40 border border-rose-500/25 rounded-lg p-4"
          >
            {warningText}
          </p>
        </div>

        <div className="text-xs text-slate-400 space-y-1.5 border-t border-slate-800 pt-4">
          <p>Informasi waktu, alamat IP, dan perangkat telah direkam dalam sistem audit keamanan.</p>
          <p>
            Jika Anda merasa terjadi kekeliruan, hubungi Customer Service resmi ALSTORE melalui halaman beranda.
          </p>
        </div>

        <div>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Beranda ALSTORE
          </a>
        </div>
      </main>
    </div>
  );
};
