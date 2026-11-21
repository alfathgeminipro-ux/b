import React from 'react';
import { ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-950 text-slate-100">
      <main className="max-w-md w-full text-center space-y-5">
        <p className="font-mono text-6xl font-bold tracking-tight text-slate-500 tabular-nums">404</p>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-slate-100">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Alamat yang Anda buka tidak tersedia atau sudah dipindahkan. Kembali ke beranda ALSTORE untuk melanjutkan top-up game.
          </p>
        </div>
        <div className="pt-2">
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Beranda
          </a>
        </div>
      </main>
    </div>
  );
};
