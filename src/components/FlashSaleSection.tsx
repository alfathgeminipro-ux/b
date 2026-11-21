import React, { useEffect, useState } from 'react';
import { Flame, ArrowUpRight } from 'lucide-react';
import { FLASH_SALE_ITEMS } from '../data/games';
import { calculateDiscountPercent, formatIDR } from '../utils/pricing';

interface FlashSaleSectionProps {
  onQuickSelect: (gameId: string, nominalId: string) => void;
}

function getSecondsUntilMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const diff = Math.floor((next.getTime() - now.getTime()) / 1000);
  return diff > 0 ? diff : 3600 * 4;
}

export const FlashSaleSection: React.FC<FlashSaleSectionProps> = ({ onQuickSelect }) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => getSecondsUntilMidnight());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 1 ? prev - 1 : getSecondsUntilMidnight()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hours = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <section aria-label="Flash Sale Hari Ini" className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <div
              className="text-xs font-semibold flex items-center gap-1.5 mb-1"
              style={{ color: 'var(--accent)' }}
            >
              <Flame className="w-4 h-4" />
              <span>Penawaran Terbatas Harian</span>
            </div>
            <h2
              className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Flash Sale ALSTORE
            </h2>
          </div>

          {/* Countdown Timer */}
          <div className="liquid-glass rounded-xl px-4 py-2 flex items-center gap-3">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Berakhir dalam
            </span>
            <div
              className="font-mono-num text-sm sm:text-base font-semibold tracking-wider"
              style={{ color: 'var(--accent)' }}
              aria-live="off"
            >
              {hours}:{minutes}:{seconds}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FLASH_SALE_ITEMS.map((item) => {
            const discount = calculateDiscountPercent(item.originalPrice, item.price);
            return (
              <button
                key={item.nominalId}
                type="button"
                onClick={() => onQuickSelect(item.gameId, item.nominalId)}
                className="liquid-glass liquid-glass-interactive rounded-2xl p-4 text-left flex flex-col justify-between gap-4 group"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className="w-14 h-14 rounded-[22%] overflow-hidden shrink-0 border border-white/15"
                    style={{ backgroundColor: item.logoBg || '#0f172a' }}
                  >
                    <img
                      src={item.coverImage}
                      alt={item.gameName}
                      referrerPolicy="no-referrer"
                      className={
                        item.logoFit === 'contain'
                          ? 'w-full h-full object-contain p-0.5 group-hover:scale-105 transition-transform duration-300'
                          : 'w-full h-full object-cover scale-[1.04] group-hover:scale-110 transition-transform duration-300'
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                      {item.gameName} · Hemat {discount}%
                    </div>
                    <div
                      className="font-display text-base font-bold leading-snug mt-0.5 truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.label}
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <div
                        className="font-mono-num text-xs line-through"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {formatIDR(item.originalPrice)}
                      </div>
                      <div
                        className="font-mono-num text-lg font-bold"
                        style={{ color: 'var(--accent)' }}
                      >
                        {formatIDR(item.price)}
                      </div>
                    </div>
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      aria-hidden="true"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </span>
                  </div>

                  {/* Subtle Stock Progress */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <span>Kuota promo tersisa</span>
                      <span className="font-mono-num font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        {item.stockLeft} paket
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(18, item.stockLeft * 3))}%`,
                          background: 'linear-gradient(90deg, var(--accent), var(--accent-strong))'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
