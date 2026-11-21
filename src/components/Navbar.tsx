import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  LogIn,
  LogOut,
  Menu,
  Palette,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  X
} from 'lucide-react';
import type { AuthUserSummary, ThemeId } from '../types/store';

export type AppView = 'home' | 'checkout' | 'invoice' | 'track';

interface NavbarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  theme: ThemeId;
  onChangeTheme: (theme: ThemeId) => void;
  user: AuthUserSummary | null;
  isVerifiedOwner?: boolean;
  onOpenAdminPortal?: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  ordersCount: number;
}

const THEME_OPTIONS: { id: ThemeId; label: string; swatch: string; desc: string }[] = [
  { id: 'obsidian', label: 'Obsidian Dark', swatch: '#38bdf8', desc: 'Gelap kaca cyan' },
  { id: 'pearl', label: 'Pearl Light', swatch: '#0284c7', desc: 'Terang frosted bersih' },
  { id: 'cyber', label: 'Cyber Neon', swatch: '#818cf8', desc: 'Ungu-biru futuristik' },
  { id: 'emerald', label: 'Emerald Luxury', swatch: '#e5c158', desc: 'Zamrud & aksen emas' }
];

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  theme,
  onChangeTheme,
  user,
  isVerifiedOwner = false,
  onOpenAdminPortal,
  onOpenAuth,
  onSignOut,
  ordersCount
}) => {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const navItems: { id: AppView; label: string }[] = [
    { id: 'home', label: 'Beranda' },
    { id: 'checkout', label: 'Top-Up' },
    { id: 'track', label: 'Cek Transaksi' }
  ];

  const handleNavClick = (view: AppView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 inset-x-0 z-40 px-3 sm:px-6 pt-3 pointer-events-none">
      <div className="max-w-7xl mx-auto pointer-events-auto">
        <div className="liquid-glass rounded-2xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark (single element, no attached tagline/pill) */}
          <button
            type="button"
            onClick={() => handleNavClick('home')}
            className="font-display text-lg sm:text-xl font-extrabold tracking-tight whitespace-nowrap shrink-0 flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 rounded-lg cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-[22%] overflow-hidden shrink-0 ring-1 ring-white/20 shadow-sm bg-[#0b1020]">
              <img
                src="/assets/aistudio/Gemini_Generated_Image_6thn0x6thn0x6thn_dd57a2b3.jpeg"
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover scale-[1.15]"
              />
            </span>
            <span>ALSTORE</span>
          </button>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav
            aria-label="Navigasi Utama"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => {
              const isActive =
                currentView === item.id || (item.id === 'track' && currentView === 'invoice');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className="relative py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  style={{
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                >
                  {item.label}
                  {isActive && (
                    <span
                      className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme Switcher + Primary Account Action */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Theme Switcher Dropdown */}
            <div className="relative" ref={themeRef}>
              <button
                type="button"
                onClick={() => {
                  setThemeMenuOpen((prev) => !prev);
                  setUserMenuOpen(false);
                }}
                aria-label="Ganti Tema Tampilan"
                aria-expanded={themeMenuOpen}
                className="liquid-glass liquid-glass-interactive h-10 px-3 rounded-xl flex items-center gap-2 text-xs font-semibold whitespace-nowrap shrink-0"
                style={{ color: 'var(--text-primary)' }}
              >
                <Palette className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                <span className="hidden lg:inline">
                  {THEME_OPTIONS.find((t) => t.id === theme)?.label}
                </span>
              </button>

              {themeMenuOpen && (
                <div
                  role="menu"
                  aria-label="Pilih Tema"
                  className="liquid-glass-strong absolute right-0 mt-2 w-56 rounded-2xl p-2 z-50"
                >
                  <div
                    className="px-2.5 py-1.5 text-xs font-semibold"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Tema Liquid Glass
                  </div>
                  <div className="space-y-1 mt-1">
                    {THEME_OPTIONS.map((opt) => {
                      const active = opt.id === theme;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            onChangeTheme(opt.id);
                            setThemeMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer"
                          style={{
                            background: active ? 'var(--accent-soft)' : 'transparent',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                              style={{ backgroundColor: opt.swatch }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{opt.label}</div>
                              <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                                {opt.desc}
                              </div>
                            </div>
                          </div>
                          {active && <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Direct Admin Portal shortcut — rendered ONLY after server verifies allowlisted Owner */}
            {user && isVerifiedOwner && onOpenAdminPortal && (
              <button
                type="button"
                data-testid="navbar-owner-admin-btn"
                onClick={onOpenAdminPortal}
                className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-xs font-semibold text-sky-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-sky-300 shrink-0" />
                <span>Panel Admin</span>
              </button>
            )}

            {/* Auth Button / User Profile Menu */}
            {user ? (
              <div className="relative" ref={userRef}>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen((prev) => !prev);
                    setThemeMenuOpen(false);
                  }}
                  aria-label="Menu Akun Pengguna"
                  aria-expanded={userMenuOpen}
                  className="liquid-glass liquid-glass-interactive h-10 pl-1.5 pr-3 rounded-xl flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <UserIcon className="w-4 h-4" />
                    </span>
                  )}
                  <span
                    className="hidden sm:inline text-xs font-semibold max-w-[110px] truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {user.displayName}
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="liquid-glass-strong absolute right-0 mt-2 w-64 rounded-2xl p-3 z-50 space-y-2.5">
                    <div className="pb-2.5 border-b" style={{ borderColor: 'var(--divider)' }}>
                      <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {user.displayName}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {user.email}
                      </div>
                    </div>
                    {isVerifiedOwner && onOpenAdminPortal && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onOpenAdminPortal();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-200"
                      >
                        <span className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-sky-300" />
                          Masuk Panel Admin
                        </span>
                        <span className="text-[10px] font-mono text-sky-300">OWNER</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleNavClick('track');
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer hover:opacity-90"
                      style={{ background: 'var(--accent-soft)', color: 'var(--text-primary)' }}
                    >
                      <span className="flex items-center gap-2">
                        <ReceiptText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                        Riwayat Transaksi
                      </span>
                      <span className="font-mono-num" style={{ color: 'var(--accent)' }}>
                        {ordersCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onSignOut();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                      style={{ color: 'var(--danger)' }}
                    >
                      <LogOut className="w-4 h-4" />
                      Keluar Akun
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="liquid-btn-primary h-10 px-4 rounded-xl text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>Masuk</span>
              </button>
            )}

            {/* Mobile Nav Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Tutup Menu Navigasi' : 'Buka Menu Navigasi'}
              className="md:hidden liquid-glass h-10 w-10 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <nav
            aria-label="Navigasi Mobile"
            className="md:hidden liquid-glass-strong rounded-2xl mt-2 p-2.5 space-y-1"
          >
            {navItems.map((item) => {
              const isActive =
                currentView === item.id || (item.id === 'track' && currentView === 'invoice');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold text-left cursor-pointer"
                  style={{
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-primary)'
                  }}
                >
                  <span>{item.label}</span>
                  {item.id === 'track' && ordersCount > 0 && (
                    <span className="font-mono-num text-xs" style={{ color: 'var(--text-muted)' }}>
                      {ordersCount} pesanan
                    </span>
                  )}
                </button>
              );
            })}
            {user && isVerifiedOwner && onOpenAdminPortal && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAdminPortal();
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold text-left bg-sky-500/15 border border-sky-400/30 text-sky-200 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-300" />
                  Masuk Panel Admin
                </span>
                <span className="text-[11px] font-mono text-sky-300">OWNER</span>
              </button>
            )}
            <div
              className="pt-2 mt-1 border-t px-3.5 py-1.5 flex items-center gap-2 text-xs"
              style={{ borderColor: 'var(--divider)', color: 'var(--text-muted)' }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span>Top-Up Cepat, Harga Bersahabat, 24/7</span>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};
