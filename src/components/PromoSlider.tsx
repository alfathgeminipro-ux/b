import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, ShieldCheck, Zap } from 'lucide-react';
import { PROMO_BANNERS, type PromoBanner } from '../data/games';

interface PromoSliderProps {
  onSelectGame: (gameId: string) => void;
}

export const PromoSlider: React.FC<PromoSliderProps> = ({ onSelectGame }) => {
  const [banners, setBanners] = useState<PromoBanner[]>(PROMO_BANNERS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/public/banners')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { banners?: PromoBanner[] } | null) => {
        if (active && data?.banners && data.banners.length > 0) {
          setBanners(data.banners);
          setActiveIndex(0);
        }
      })
      .catch(() => {
        // Keep static PROMO_BANNERS fallback
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % banners.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  const goPrev = () => {
    setActiveIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const goNext = () => {
    setActiveIndex((prev) => (prev + 1) % banners.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 42) {
      if (delta > 0) goPrev();
      else goNext();
    }
  };

  const activeBanner = banners[activeIndex] || banners[0];

  return (
    <section aria-label="Promo Unggulan ALSTORE" className="pt-22 sm:pt-26 pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Main Swipeable Hero Slider */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="liquid-glass rounded-3xl overflow-hidden relative min-h-[300px] sm:min-h-[380px] lg:min-h-[420px] flex items-end sm:items-center"
        >
          {/* Background Image Layer */}
          {banners.map((banner, idx) => (
            <div
              key={banner.id}
              aria-hidden={idx !== activeIndex}
              className="absolute inset-0 transition-opacity duration-500"
              style={{
                opacity: idx === activeIndex ? 1 : 0,
                pointerEvents: idx === activeIndex ? 'auto' : 'none'
              }}
            >
              {!imageErrors[banner.id] ? (
                <img
                  src={banner.image}
                  alt={banner.title}
                  referrerPolicy="no-referrer"
                  onError={() => setImageErrors((prev) => ({ ...prev, [banner.id]: true }))}
                  style={{ objectPosition: banner.imagePosition || 'center center' }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--bg-canvas-elevated), var(--accent-soft))'
                  }}
                />
              )}
              {/* Measured Contrast Scrim for Guaranteed Legibility Across All 4 Themes */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(4, 8, 18, 0.9) 0%, rgba(4, 8, 18, 0.72) 52%, rgba(4, 8, 18, 0.28) 100%)'
                }}
              />
            </div>
          ))}

          {/* Foreground Editorial Content */}
          <div className="relative z-10 w-full p-6 sm:p-10 lg:p-14 flex flex-col justify-between gap-6">
            <div className="max-w-2xl space-y-3.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-sky-200/90">
                <span>ALSTORE</span>
                <span aria-hidden="true">·</span>
                <span>Top-Up Cepat, Harga Bersahabat, 24/7</span>
                <span aria-hidden="true">·</span>
                <span>{activeBanner.kicker}</span>
              </div>

              <h1
                className="font-display font-extrabold text-white tracking-tight leading-[1.08]"
                style={{
                  fontSize: 'clamp(1.75rem, 3.8vw, 3.25rem)',
                  textWrap: 'balance'
                }}
              >
                {activeBanner.title}
              </h1>

              <p className="text-sm sm:text-base text-slate-200/90 max-w-xl leading-relaxed">
                {activeBanner.subtitle}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onSelectGame(activeBanner.targetGameId)}
                  className="liquid-btn-primary rounded-xl px-6 py-3 text-sm whitespace-nowrap cursor-pointer"
                >
                  <span>{activeBanner.ctaLabel}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-slate-300">
                  {activeBanner.highlightNote}
                </span>
              </div>
            </div>

            {/* Bottom Controls Row: Trust Strip + Slider Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-5 text-xs text-slate-200/85">
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-sky-300" />
                  Instan 1–5 Detik
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  QRIS Resmi & 100% Legal
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 mr-2" role="tablist" aria-label="Pilih Slide Promo">
                  {banners.map((banner, idx) => (
                    <button
                      key={banner.id}
                      type="button"
                      role="tab"
                      aria-selected={idx === activeIndex}
                      aria-label={`Slide ${idx + 1}: ${banner.title}`}
                      onClick={() => setActiveIndex(idx)}
                      className="h-2 rounded-full transition-all cursor-pointer"
                      style={{
                        width: idx === activeIndex ? '26px' : '8px',
                        backgroundColor: idx === activeIndex ? 'var(--accent)' : 'rgba(255,255,255,0.35)'
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Banner Sebelumnya"
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Banner Berikutnya"
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
