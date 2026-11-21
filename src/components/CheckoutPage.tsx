import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookmarkCheck,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  HelpCircle,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
  Zap
} from 'lucide-react';
import type { GameConfig, TopUpNominal } from '../data/games';
import { PAYMENT_METHODS, type PaymentMethod } from '../data/payments';
import type { SavedGameAccount, TopUpOrder, UserPreferences } from '../types/store';
import {
  calculateDiscountPercent,
  calculatePaymentTotal,
  formatIDR,
  generateBankUniqueCode,
  generateInvoiceId,
  validateWhatsAppNumber
} from '../utils/pricing';
import { MERCHANT_QRIS_INFO } from '../utils/qris';

interface CheckoutPageProps {
  game: GameConfig;
  initialNominalId?: string | null;
  prefs: UserPreferences;
  isSignedIn: boolean;
  onBack: () => void;
  onCreateOrder: (order: TopUpOrder, savedAccount: SavedGameAccount) => Promise<void>;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  game,
  initialNominalId,
  prefs,
  isSignedIn,
  onBack,
  onCreateOrder
}) => {
  const savedForGame = prefs.savedAccounts[game.id];

  const [accountId, setAccountId] = useState(savedForGame?.accountId || '');
  const [zoneId, setZoneId] = useState(
    savedForGame?.zoneId || game.accountFields.serverOptions?.[0] || ''
  );
  const [selectedNominalId, setSelectedNominalId] = useState<string>(() => {
    if (initialNominalId && game.nominals.some((n) => n.id === initialNominalId)) {
      return initialNominalId;
    }
    return game.nominals[0].id;
  });
  const [nominalFilter, setNominalFilter] = useState<'all' | 'pass' | 'currency'>('all');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('qris');
  const [whatsapp, setWhatsapp] = useState<string>(prefs.whatsapp || '');
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{
    accountId?: string;
    zoneId?: string;
    whatsapp?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  // Stable session unique code (101..499) for Bank Transfer preview & invoice
  const [bankUniqueCode] = useState<number>(() => generateBankUniqueCode());

  useEffect(() => {
    const saved = prefs.savedAccounts[game.id];
    setAccountId(saved?.accountId || '');
    setZoneId(saved?.zoneId || game.accountFields.serverOptions?.[0] || '');
    setNominalFilter('all');
    if (initialNominalId && game.nominals.some((n) => n.id === initialNominalId)) {
      setSelectedNominalId(initialNominalId);
    } else {
      setSelectedNominalId(game.nominals[0].id);
    }
    setFormErrors({});
  }, [game, initialNominalId, prefs.savedAccounts]);

  useEffect(() => {
    if (prefs.whatsapp && !whatsapp) {
      setWhatsapp(prefs.whatsapp);
    }
  }, [prefs.whatsapp, whatsapp]);

  const hasPassGroup = useMemo(
    () => game.nominals.some((n) => n.group === 'pass'),
    [game.nominals]
  );

  const visibleNominals = useMemo(() => {
    if (!hasPassGroup || nominalFilter === 'all') return game.nominals;
    return game.nominals.filter((n) => n.group === nominalFilter);
  }, [game.nominals, hasPassGroup, nominalFilter]);

  const selectedNominal: TopUpNominal =
    game.nominals.find((n) => n.id === selectedNominalId) || game.nominals[0];

  const selectedPayment: PaymentMethod =
    PAYMENT_METHODS.find((p) => p.id === selectedPaymentId) || PAYMENT_METHODS[0];

  const priceBreakdown = useMemo(
    () => calculatePaymentTotal(selectedNominal.price, selectedPayment, bankUniqueCode),
    [selectedNominal.price, selectedPayment, bankUniqueCode]
  );

  const qrisMethods = PAYMENT_METHODS.filter((m) => m.group === 'qris');
  const ewalletMethods = PAYMENT_METHODS.filter((m) => m.group === 'ewallet');
  const bankMethods = PAYMENT_METHODS.filter((m) => m.group === 'bank');

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // fallback ignored
    }
  };

  const handleAutofillSaved = () => {
    if (!savedForGame) return;
    setAccountId(savedForGame.accountId);
    if (savedForGame.zoneId) {
      setZoneId(savedForGame.zoneId);
    }
    if (prefs.whatsapp) {
      setWhatsapp(prefs.whatsapp);
    }
    setFormErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { accountId?: string; zoneId?: string; whatsapp?: string } = {};

    if (!accountId.trim() || accountId.trim().length < 3) {
      errors.accountId = `${game.accountFields.userIdLabel} wajib diisi minimal 3 karakter.`;
    }
    if (game.accountFields.requiresZone && !zoneId.trim()) {
      errors.zoneId = `${game.accountFields.zoneLabel || 'Zone ID'} wajib diisi.`;
    }
    const waCheck = validateWhatsAppNumber(whatsapp);
    if (!waCheck.valid) {
      errors.whatsapp = waCheck.error;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setSubmitting(true);

    try {
      const now = Date.now();
      const order: TopUpOrder = {
        invoiceId: generateInvoiceId(new Date(now)),
        gameId: game.id,
        gameName: game.name,
        itemName: selectedNominal.label,
        accountId: accountId.trim(),
        zoneId: game.accountFields.requiresZone ? zoneId.trim() : '',
        whatsapp: whatsapp.trim(),
        paymentMethodId: selectedPayment.id,
        paymentMethodName: selectedPayment.name,
        basePrice: priceBreakdown.basePrice,
        adminFee: priceBreakdown.adminFee,
        uniqueCode: priceBreakdown.uniqueCode,
        totalAmount: priceBreakdown.totalAmount,
        status: 'pending',
        proofFileName: '',
        createdAtMs: now,
        expiresAtMs: now + 15 * 60 * 1000
      };

      const savedAccount: SavedGameAccount = {
        gameId: game.id,
        gameName: game.name,
        accountId: accountId.trim(),
        zoneId: game.accountFields.requiresZone ? zoneId.trim() : '',
        updatedAtMs: now
      };

      await onCreateOrder(order, savedAccount);
    } finally {
      setSubmitting(false);
    }
  };

  const renderPaymentRow = (method: PaymentMethod) => {
    const active = selectedPaymentId === method.id;
    const calc = calculatePaymentTotal(selectedNominal.price, method, bankUniqueCode);

    return (
      <div
        key={method.id}
        className="rounded-xl transition-all"
        style={{
          background: active ? 'var(--accent-soft)' : 'var(--glass-bg)',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--glass-border)'}`
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedPaymentId(method.id)}
          aria-pressed={active}
          className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-11 h-9 rounded-lg flex items-center justify-center text-[11px] font-extrabold text-white shrink-0"
              style={{ backgroundColor: method.brandAccent }}
            >
              {method.shortCode}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                  {method.name}
                </span>
                {method.recommended && (
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
                    · Rekomendasi
                  </span>
                )}
              </div>
              <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {method.subtitle}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono-num text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {formatIDR(calc.totalAmount)}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {method.usesUniqueCode
                ? `+kode ${calc.uniqueCode}`
                : calc.adminFee > 0
                  ? `+biaya ${formatIDR(calc.adminFee)}`
                  : 'Bebas biaya'}
            </div>
          </div>
        </button>

        {/* Inline Expanded Payment Preview when Active */}
        {active && method.group === 'qris' && (
          <div
            className="px-4 pb-4 pt-2 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            style={{ borderColor: 'var(--divider)', color: 'var(--text-secondary)' }}
          >
            <div>
              <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Merchant Resmi: {MERCHANT_QRIS_INFO.merchantName}
              </div>
              <div className="font-mono-num mt-0.5" style={{ color: 'var(--text-muted)' }}>
                NMID: {MERCHANT_QRIS_INFO.nmid} · Siap scan di halaman Invoice
              </div>
            </div>
            <span className="font-semibold shrink-0" style={{ color: 'var(--success)' }}>
              Verifikasi Cepat 24/7
            </span>
          </div>
        )}

        {active && method.destinationNumber && (
          <div
            className="px-4 pb-4 pt-2.5 border-t flex flex-wrap items-center justify-between gap-3 text-xs"
            style={{ borderColor: 'var(--divider)' }}
          >
            <div className="space-y-0.5">
              <div style={{ color: 'var(--text-muted)' }}>
                {method.group === 'bank' ? 'No. Rekening Tujuan' : 'Nomor Tujuan E-Wallet'} · a.n.{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{method.accountHolder}</strong>
              </div>
              <div
                className="font-mono-num text-sm font-bold tracking-wide"
                style={{ color: 'var(--text-primary)' }}
              >
                {method.destinationNumber}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(method.id, method.destinationNumber!.replace(/\s+/g, ''))}
              className="liquid-glass px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              {copiedKey === method.id ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Nomor</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section aria-label={`Top-Up ${game.name}`} className="pt-22 sm:pt-26 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Back Breadcrumb */}
        <div className="mb-5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80 cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Katalog Game</span>
          </button>
        </div>

        {/* Game Hero Summary Header */}
        <div className="liquid-glass rounded-3xl p-5 sm:p-6 mb-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-[22%] overflow-hidden shrink-0 border border-white/15 shadow-lg"
              style={{ backgroundColor: game.logoBg || '#0f172a' }}
            >
              <img
                src={game.coverImage}
                alt={game.name}
                referrerPolicy="no-referrer"
                className={
                  game.logoFit === 'contain'
                    ? 'w-full h-full object-contain p-1'
                    : 'w-full h-full object-cover scale-[1.04]'
                }
              />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                {game.publisher} · {game.categoryLabel}
              </div>
              <h1
                className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mt-0.5"
                style={{ color: 'var(--text-primary)' }}
              >
                {game.name}
              </h1>
              <div
                className="flex flex-wrap items-center gap-3 mt-1.5 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span className="inline-flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  Estimasi {game.deliveryEstimate}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
                  Resmi 100% Legal & Buka 24 Jam
                </span>
              </div>
            </div>
          </div>

          {savedForGame && (
            <button
              type="button"
              onClick={handleAutofillSaved}
              className="liquid-glass liquid-glass-interactive rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2 shrink-0"
              style={{ color: 'var(--accent)' }}
            >
              <BookmarkCheck className="w-4 h-4" />
              <span>
                Isi ID Tersimpan ({savedForGame.accountId}
                {savedForGame.zoneId ? ` / ${savedForGame.zoneId}` : ''})
              </span>
            </button>
          )}
        </div>

        {/* Main 1-Page Checkout Grid */}
        <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Steps 1 - 4 */}
          <div className="lg:col-span-8 space-y-6">
            {/* STEP 1: DATA AKUN */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center font-mono-num text-sm font-bold shrink-0"
                    style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
                  >
                    1
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      Masukkan Data Akun
                    </h2>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Pastikan ID akun sudah benar agar {game.currencyUnit} langsung masuk.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-opacity hover:opacity-80"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Panduan Cek ID</span>
                </button>
              </div>

              <div
                className={`grid grid-cols-1 ${
                  game.accountFields.requiresZone ? 'sm:grid-cols-2' : ''
                } gap-4`}
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="checkout-user-id"
                    className="block text-xs font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {game.accountFields.userIdLabel}
                  </label>
                  <input
                    id="checkout-user-id"
                    type="text"
                    value={accountId}
                    onChange={(e) => {
                      setAccountId(e.target.value);
                      if (formErrors.accountId) setFormErrors((prev) => ({ ...prev, accountId: undefined }));
                    }}
                    placeholder={game.accountFields.userIdPlaceholder}
                    className="liquid-input w-full h-12 px-4 rounded-xl text-sm font-mono-num"
                    aria-invalid={Boolean(formErrors.accountId)}
                  />
                  {formErrors.accountId && (
                    <p role="alert" className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                      {formErrors.accountId}
                    </p>
                  )}
                </div>

                {game.accountFields.requiresZone && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="checkout-zone-id"
                      className="block text-xs font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {game.accountFields.zoneLabel || 'Zone ID'}
                    </label>
                    {game.accountFields.serverOptions ? (
                      <select
                        id="checkout-zone-id"
                        value={zoneId}
                        onChange={(e) => setZoneId(e.target.value)}
                        className="liquid-input w-full h-12 px-4 rounded-xl text-sm"
                      >
                        {game.accountFields.serverOptions.map((srv) => (
                          <option key={srv} value={srv} className="text-slate-900">
                            {srv}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="checkout-zone-id"
                        type="text"
                        value={zoneId}
                        onChange={(e) => {
                          setZoneId(e.target.value);
                          if (formErrors.zoneId) setFormErrors((prev) => ({ ...prev, zoneId: undefined }));
                        }}
                        placeholder={game.accountFields.zonePlaceholder || 'Zone ID'}
                        className="liquid-input w-full h-12 px-4 rounded-xl text-sm font-mono-num"
                        aria-invalid={Boolean(formErrors.zoneId)}
                      />
                    )}
                    {formErrors.zoneId && (
                      <p role="alert" className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                        {formErrors.zoneId}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* STEP 2: PILIH NOMINAL */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center font-mono-num text-sm font-bold shrink-0"
                    style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
                  >
                    2
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      Pilih Nominal Top-Up
                    </h2>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Harga promo langsung aktif tanpa perlu kode voucher.
                    </p>
                  </div>
                </div>

                {hasPassGroup && (
                  <div className="liquid-glass rounded-xl p-1 flex items-center gap-1">
                    {(
                      [
                        { id: 'all', label: 'Semua' },
                        { id: 'pass', label: 'Pass & Membership' },
                        { id: 'currency', label: game.currencyUnit }
                      ] as const
                    ).map((tab) => {
                      const active = nominalFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setNominalFilter(tab.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer"
                          style={{
                            background: active ? 'var(--accent)' : 'transparent',
                            color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)'
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {visibleNominals.map((item) => {
                  const selected = item.id === selectedNominal.id;
                  const disc = calculateDiscountPercent(item.originalPrice, item.price);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedNominalId(item.id)}
                      aria-pressed={selected}
                      className="liquid-glass liquid-glass-interactive rounded-2xl p-3.5 text-left flex flex-col justify-between gap-2.5"
                      style={{
                        background: selected ? 'var(--accent-soft)' : 'var(--glass-bg)',
                        borderColor: selected ? 'var(--accent)' : 'var(--glass-border)',
                        boxShadow: selected
                          ? '0 0 0 1px var(--accent), var(--glass-shadow)'
                          : undefined
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className="font-display text-sm font-bold leading-snug"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {item.label}
                          </div>
                          {item.sublabel && (
                            <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                              {item.sublabel}
                            </div>
                          )}
                        </div>
                        {selected && (
                          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                        )}
                      </div>

                      <div className="pt-1.5 border-t space-y-0.5" style={{ borderColor: 'var(--divider)' }}>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono-num line-through" style={{ color: 'var(--text-muted)' }}>
                            {formatIDR(item.originalPrice)}
                          </span>
                          <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                            {item.tag ? `${item.tag} · -${disc}%` : `Hemat ${disc}%`}
                          </span>
                        </div>
                        <div
                          className="font-mono-num text-base font-bold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {formatIDR(item.price)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 3: PILIH METODE PEMBAYARAN */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center font-mono-num text-sm font-bold shrink-0"
                  style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
                >
                  3
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    Pilih Metode Pembayaran
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Total harga diperbarui otomatis secara real-time di setiap metode.
                  </p>
                </div>
              </div>

              {/* Group 1: QRIS */}
              <div className="space-y-2.5">
                <div
                  className="flex items-center gap-2 text-xs font-bold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <QrCode className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <span>QRIS Instan (Rekomendasi)</span>
                </div>
                <div className="space-y-2.5">{qrisMethods.map(renderPaymentRow)}</div>
              </div>

              {/* Group 2: E-Wallet */}
              <div className="space-y-2.5">
                <div
                  className="flex items-center gap-2 text-xs font-bold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Wallet className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <span>E-Wallet (GoPay, DANA, OVO, ShopeePay, LinkAja)</span>
                </div>
                <div className="space-y-2.5">{ewalletMethods.map(renderPaymentRow)}</div>
              </div>

              {/* Group 3: Transfer Bank */}
              <div className="space-y-2.5">
                <div
                  className="flex items-center gap-2 text-xs font-bold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Building2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <span>Transfer Bank (BCA, Mandiri, BNI, BRI, SeaBank)</span>
                </div>
                <div className="space-y-2.5">{bankMethods.map(renderPaymentRow)}</div>
              </div>
            </div>

            {/* STEP 4: WHATSAPP */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center font-mono-num text-sm font-bold shrink-0"
                  style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
                >
                  4
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    Nomor WhatsApp Pembeli
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Untuk pengiriman nomor invoice & notifikasi status pesanan secara instan.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="checkout-whatsapp"
                  className="block text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Nomor WhatsApp Aktif
                </label>
                <div className="relative">
                  <Smartphone
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    id="checkout-whatsapp"
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => {
                      setWhatsapp(e.target.value);
                      if (formErrors.whatsapp) setFormErrors((prev) => ({ ...prev, whatsapp: undefined }));
                    }}
                    placeholder="Contoh: 081234567890"
                    className="liquid-input w-full h-12 pl-10 pr-4 rounded-xl text-sm font-mono-num"
                    aria-invalid={Boolean(formErrors.whatsapp)}
                  />
                </div>
                {formErrors.whatsapp && (
                  <p role="alert" className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                    {formErrors.whatsapp}
                  </p>
                )}
                {isSignedIn && (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Nomor WhatsApp & ID game ini otomatis tersimpan ke akun Anda untuk transaksi berikutnya.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Order Summary */}
          <aside className="lg:col-span-4 lg:sticky lg:top-24">
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <h3 className="font-display text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Ringkasan Pesanan
              </h3>

              <div className="space-y-2.5 text-sm pb-4 border-b" style={{ borderColor: 'var(--divider)' }}>
                <div className="flex items-start justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>Game</span>
                  <span className="font-semibold text-right" style={{ color: 'var(--text-primary)' }}>
                    {game.shortName}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>Item</span>
                  <span className="font-semibold text-right" style={{ color: 'var(--text-primary)' }}>
                    {selectedNominal.label}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>Data Akun</span>
                  <span className="font-mono-num font-semibold text-right" style={{ color: 'var(--text-primary)' }}>
                    {accountId.trim()
                      ? game.accountFields.requiresZone && zoneId.trim()
                        ? `${accountId.trim()} (${zoneId.trim()})`
                        : accountId.trim()
                      : 'Belum diisi'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>Pembayaran</span>
                  <span className="font-semibold text-right" style={{ color: 'var(--text-primary)' }}>
                    {selectedPayment.name}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Harga Item</span>
                  <span className="font-mono-num" style={{ color: 'var(--text-primary)' }}>
                    {formatIDR(priceBreakdown.basePrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Biaya Layanan</span>
                  <span className="font-mono-num" style={{ color: 'var(--text-primary)' }}>
                    {priceBreakdown.adminFee > 0 ? formatIDR(priceBreakdown.adminFee) : 'Rp 0'}
                  </span>
                </div>
                {priceBreakdown.uniqueCode > 0 && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Kode Unik Bank</span>
                    <span className="font-mono-num" style={{ color: 'var(--accent)' }}>
                      +{priceBreakdown.uniqueCode}
                    </span>
                  </div>
                )}
                <div
                  className="pt-3 mt-2 border-t flex items-baseline justify-between"
                  style={{ borderColor: 'var(--divider)' }}
                >
                  <span className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>
                    Total Bayar
                  </span>
                  <span
                    className="font-mono-num text-xl font-extrabold"
                    style={{ color: 'var(--accent)' }}
                  >
                    {formatIDR(priceBreakdown.totalAmount)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="liquid-btn-primary w-full h-12 rounded-xl text-sm cursor-pointer"
              >
                <span>{submitting ? 'Membuat Invoice...' : 'Bayar Sekarang'}</span>
              </button>

              <p className="text-[11px] leading-relaxed text-center" style={{ color: 'var(--text-muted)' }}>
                Dengan melanjutkan, invoice otomatis dibuat dengan batas pembayaran 15 menit.
              </p>
            </div>
          </aside>
        </form>
      </div>

      {/* ID Guide Modal */}
      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="id-guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
        >
          <div className="liquid-glass-strong rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h3
                id="id-guide-title"
                className="font-display text-lg font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {game.accountFields.guideTitle}
              </h3>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Tutup Panduan ID"
                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-2.5 text-sm list-decimal list-inside" style={{ color: 'var(--text-secondary)' }}>
              {game.accountFields.guideSteps.map((step, idx) => (
                <li key={idx} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="liquid-btn-primary w-full h-11 rounded-xl text-sm cursor-pointer"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
