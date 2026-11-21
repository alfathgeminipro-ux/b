import React from 'react';
import { Clock, MessageCircle, ShieldCheck } from 'lucide-react';
import { ADMIN_WHATSAPP_DISPLAY, ADMIN_WHATSAPP_NUMBER } from '../data/payments';
import type { AppView } from './Navbar';

interface FooterProps {
  onNavigate: (view: AppView) => void;
  onSelectGame: (gameId: string) => void;
}

const PAYMENT_LOGOS = [
  'QRIS',
  'GoPay',
  'DANA',
  'OVO',
  'ShopeePay',
  'LinkAja',
  'BCA',
  'Mandiri',
  'BNI',
  'BRI',
  'SeaBank'
];

export const Footer: React.FC<FooterProps> = ({ onNavigate, onSelectGame }) => {
  const csUrl = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    'Halo CS ALSTORE, saya butuh bantuan mengenai top-up game.'
  )}`;

  return (
    <>
      <footer
        className="border-t mt-8"
        style={{
          borderColor: 'var(--divider)',
          background: 'var(--bg-canvas-elevated)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Brand Column */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-[22%] overflow-hidden shrink-0 ring-1 ring-white/20 shadow-sm bg-[#0b1020]">
                <img
                  src="/assets/aistudio/Gemini_Generated_Image_6thn0x6thn0x6thn_dd57a2b3.jpeg"
                  alt="Logo ALSTORE"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover scale-[1.15]"
                />
              </span>
              <span
                className="font-display text-xl font-extrabold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                ALSTORE
              </span>
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              Top-Up Cepat, Harga Bersahabat, 24/7
            </p>
            <p className="text-xs leading-relaxed max-w-sm" style={{ color: 'var(--text-secondary)' }}>
              Platform top-up diamond, UC, PB Cash, dan voucher game resmi terpercaya dengan sistem transaksi instan dan dukungan pembayaran lengkap Indonesia.
            </p>
            <div className="pt-2 space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span>Jam Operasional: Setiap Hari · 24 Jam Nonstop</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
                <span>WhatsApp CS Resmi: {ADMIN_WHATSAPP_DISPLAY}</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3 space-y-3">
            <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              Akses Cepat
            </div>
            <ul className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="hover:underline cursor-pointer"
                >
                  Beranda & Katalog
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectGame('mlbb')}
                  className="hover:underline cursor-pointer"
                >
                  Top-Up Mobile Legends
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectGame('ff')}
                  className="hover:underline cursor-pointer"
                >
                  Top-Up Free Fire
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectGame('pubg')}
                  className="hover:underline cursor-pointer"
                >
                  Top-Up PUBG Mobile
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('track')}
                  className="hover:underline cursor-pointer"
                >
                  Cek Transaksi
                </button>
              </li>
            </ul>
          </div>

          {/* Supported Payments */}
          <div className="md:col-span-4 space-y-3">
            <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              Metode Pembayaran Didukung
            </div>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_LOGOS.map((name) => (
                <span
                  key={name}
                  className="liquid-glass px-2.5 py-1 rounded-lg text-[11px] font-mono-num font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div
          className="border-t py-4 px-4 sm:px-6 text-center text-xs"
          style={{ borderColor: 'var(--divider)', color: 'var(--text-muted)' }}
        >
          © {new Date().getFullYear()} ALSTORE. Seluruh hak cipta dilindungi.
        </div>
      </footer>

      {/* Floating CS WhatsApp Button */}
      <a
        href={csUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Hubungi Customer Service WhatsApp ALSTORE"
        className="fixed bottom-4 right-4 z-30 h-11 px-3.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500/95 backdrop-blur-md text-white shadow-lg border border-emerald-300/35 flex items-center gap-2 text-xs font-bold transition-transform hover:-translate-y-0.5 active:scale-95"
      >
        <MessageCircle className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline whitespace-nowrap">CS WhatsApp</span>
      </a>
    </>
  );
};
