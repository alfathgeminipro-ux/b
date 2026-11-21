import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Gavel,
  Image as ImageIcon,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Users,
  X
} from 'lucide-react';
import type {
  AdminBannerRecord,
  AdminKeyMetricsData,
  AdminSessionState,
  AdminSettingsRecord,
  AdminUserPublic,
  AuditLogRecord,
  IpDeviceBlockRecord,
  LoginAttemptRecord,
  OwnerAlertRecord,
  PayoutAccountRecord,
  PayrollItemRecord,
  ViolationCaseRecord
} from '../../types/admin';
import type { OrderStatus, TopUpOrder } from '../../types/store';
import { AdminApiError, adminFetch, formatDateTimeId, formatIdr } from '../../utils/adminApi';
import {
  buildCsvFilename,
  buildTransactionsCsv,
  downloadCsvFile
} from '../../utils/csvExport';
import { AdminActivityLogsSection } from './AdminActivityLogsSection';
import { AdminFinanceSection, AdminPayrollSection } from './AdminFinancePayrollSection';
import { AdminKeyMetricsWidget } from './AdminKeyMetricsWidget';
import { AdminSecuritySettingsModal } from './AdminSecuritySettingsModal';
import {
  AdminSecurityLogsSection,
  AdminSecuritySettingsSection,
  AdminStaffSection
} from './AdminSecuritySettingsSection';
import { AdminViolationsSection } from './AdminViolationsSection';
import { StepUpModal } from './StepUpModal';

type AdminTab =
  | 'overview'
  | 'orders'
  | 'banners'
  | 'finance'
  | 'payroll'
  | 'violations'
  | 'staff'
  | 'activity_logs'
  | 'security_logs'
  | 'settings';

interface AdminOrderRow extends TopUpOrder {
  invoiceType?: string;
  customerEmail?: string | null;
  confirmedByName?: string | null;
}

interface AdminDashboardProps {
  session: AdminSessionState;
  onSessionExpired: () => void;
  onAdminUpdated: (admin: AdminUserPublic) => void;
  onBackToStorefront?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  session,
  onSessionExpired,
  onAdminUpdated,
  onBackToStorefront
}) => {
  const admin = session.admin!;
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Idle session countdown (15 min)
  const [expiresAtMs, setExpiresAtMs] = useState(
    session.expiresAtMs || Date.now() + session.idleTimeoutMs
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Loaded data states
  const [overview, setOverview] = useState<{
    metrics: AdminKeyMetricsData;
    recentOrders: AdminOrderRow[];
    ownerAlerts: OwnerAlertRecord[];
    generatedAtMs?: number;
  } | null>(null);
  const [autoRefreshOverview, setAutoRefreshOverview] = useState(true);
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const [lastOverviewSyncMs, setLastOverviewSyncMs] = useState<number | null>(null);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState<string | null>(null);

  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<'all' | OrderStatus>('all');
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);

  const [banners, setBanners] = useState<AdminBannerRecord[]>([]);
  const [newBannerTitle, setNewBannerTitle] = useState('');
  const [newBannerKicker, setNewBannerKicker] = useState('Promo ALSTORE');
  const [newBannerSubtitle, setNewBannerSubtitle] = useState('');
  const [newBannerImage, setNewBannerImage] = useState(
    '/assets/aistudio/100__Nama_Tim_Mobile_Legend_Keren_Beserta_Artinya_56956b99.jpeg'
  );
  const [newBannerGameId, setNewBannerGameId] = useState('mlbb');

  const [payoutAccounts, setPayoutAccounts] = useState<PayoutAccountRecord[]>([]);
  const [methodBreakdown, setMethodBreakdown] = useState<
    Array<{ methodName: string; ordersCount: number; totalIdr: number }>
  >([]);
  const [payrollItems, setPayrollItems] = useState<PayrollItemRecord[]>([]);
  const [violationCases, setViolationCases] = useState<ViolationCaseRecord[]>([]);
  const [defaultViolationFeeIdr, setDefaultViolationFeeIdr] = useState(90000);
  const [staffList, setStaffList] = useState<AdminUserPublic[]>([]);
  const [attempts, setAttempts] = useState<LoginAttemptRecord[]>([]);
  const [blocks, setBlocks] = useState<IpDeviceBlockRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<AuditLogRecord[]>([]);
  const [activityLogsTotal, setActivityLogsTotal] = useState(0);
  const [activityLogsError, setActivityLogsError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettingsRecord | null>(null);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);

  // Step-Up Modal state
  const [stepUpState, setStepUpState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    submitting: boolean;
    error: string | null;
    executor: ((creds: { stepUpPassword: string; stepUpTotpCode: string }) => Promise<void>) | null;
  }>({
    isOpen: false,
    title: '',
    description: '',
    submitting: false,
    error: null,
    executor: null
  });

  useEffect(() => {
    const t = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (current >= expiresAtMs) {
        onSessionExpired();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [expiresAtMs, onSessionExpired]);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof AdminApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Terjadi kesalahan sistem.'
      });
    },
    [onSessionExpired]
  );

  const refreshSlidingExpiry = useCallback(() => {
    setExpiresAtMs(Date.now() + session.idleTimeoutMs);
  }, [session.idleTimeoutMs]);

  const loadActiveTab = useCallback(
    async (tab: AdminTab) => {
      setLoading(true);
      try {
        if (tab === 'overview') {
          const data = await adminFetch<NonNullable<typeof overview>>('/api/admin/overview');
          setOverview(data);
          setLastOverviewSyncMs(data.generatedAtMs || Date.now());
        } else if (tab === 'orders') {
          const data = await adminFetch<{ orders: AdminOrderRow[] }>('/api/admin/orders');
          setOrders(data.orders);
        } else if (tab === 'banners') {
          const data = await adminFetch<{ banners: AdminBannerRecord[] }>('/api/admin/banners');
          setBanners(data.banners);
        } else if (tab === 'finance') {
          const data = await adminFetch<{
            accounts: PayoutAccountRecord[];
            methodBreakdown: Array<{ methodName: string; ordersCount: number; totalIdr: number }>;
          }>('/api/admin/payout-accounts');
          setPayoutAccounts(data.accounts);
          setMethodBreakdown(data.methodBreakdown);
        } else if (tab === 'payroll') {
          const data = await adminFetch<{ items: PayrollItemRecord[] }>('/api/admin/payroll');
          setPayrollItems(data.items);
        } else if (tab === 'violations') {
          const data = await adminFetch<{
            cases: ViolationCaseRecord[];
            defaultViolationFeeIdr: number;
          }>('/api/admin/violations');
          setViolationCases(data.cases);
          setDefaultViolationFeeIdr(data.defaultViolationFeeIdr);
        } else if (tab === 'staff') {
          const data = await adminFetch<{ staff: AdminUserPublic[] }>('/api/admin/staff');
          setStaffList(data.staff);
        } else if (tab === 'activity_logs') {
          setActivityLogsError(null);
          const data = await adminFetch<{
            logs: AuditLogRecord[];
            totalCount: number;
          }>('/api/admin/activity-logs?limit=300');
          setActivityLogs(data.logs);
          setActivityLogsTotal(data.totalCount);
        } else if (tab === 'security_logs') {
          const data = await adminFetch<{
            attempts: LoginAttemptRecord[];
            blocks: IpDeviceBlockRecord[];
            auditLogs: AuditLogRecord[];
          }>('/api/admin/security-logs');
          setAttempts(data.attempts);
          setBlocks(data.blocks);
          setAuditLogs(data.auditLogs);
        } else if (tab === 'settings' && admin.role === 'OWNER') {
          const data = await adminFetch<{ settings: AdminSettingsRecord }>('/api/admin/settings');
          setSettings(data.settings);
        }
        refreshSlidingExpiry();
      } catch (err) {
        if (tab === 'activity_logs') {
          setActivityLogsError(
            err instanceof Error ? err.message : 'Gagal memuat log aktivitas admin.'
          );
        }
        handleApiError(err);
      } finally {
        setLoading(false);
      }
    },
    [admin.role, handleApiError, refreshSlidingExpiry]
  );

  useEffect(() => {
    loadActiveTab(activeTab);
  }, [activeTab, loadActiveTab]);

  const refreshOverviewQuietly = useCallback(async () => {
    setOverviewRefreshing(true);
    try {
      const data = await adminFetch<NonNullable<typeof overview>>('/api/admin/overview');
      setOverview(data);
      setLastOverviewSyncMs(data.generatedAtMs || Date.now());
      refreshSlidingExpiry();
    } catch (err) {
      handleApiError(err);
    } finally {
      setOverviewRefreshing(false);
    }
  }, [handleApiError, refreshSlidingExpiry]);

  useEffect(() => {
    if (activeTab !== 'overview' || !autoRefreshOverview) return;
    const intervalId = window.setInterval(() => {
      void refreshOverviewQuietly();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [activeTab, autoRefreshOverview, refreshOverviewQuietly]);

  const handleAcknowledgeAlert = useCallback(
    async (alertId: string) => {
      setAcknowledgingAlertId(alertId);
      setToast(null);
      try {
        await adminFetch(`/api/admin/alerts/${encodeURIComponent(alertId)}/ack`, {
          method: 'POST',
          body: {}
        });
        await refreshOverviewQuietly();
        setToast({ type: 'ok', text: 'Peringatan sistem telah ditandai dibaca.' });
      } catch (err) {
        handleApiError(err);
      } finally {
        setAcknowledgingAlertId(null);
      }
    },
    [handleApiError, refreshOverviewQuietly]
  );

  const handleOpenPendingVerification = useCallback(() => {
    setOrderFilter('waiting_verification');
    setOrderSearch('');
    setActiveTab('orders');
  }, []);

  const navItems = useMemo(() => {
    const items: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
      { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
      { id: 'orders', label: 'Transaksi', icon: ShoppingBag }
    ];
    if (admin.role === 'OWNER' || admin.role === 'ADMIN') {
      items.push({ id: 'banners', label: 'Banner Promo', icon: ImageIcon });
    }
    if (admin.role === 'OWNER' || admin.role === 'KEUANGAN') {
      items.push({ id: 'finance', label: 'Rekening & Keuangan', icon: Building2 });
      items.push({ id: 'payroll', label: 'Gaji Karyawan', icon: Banknote });
      items.push({ id: 'activity_logs', label: 'Log Aktivitas', icon: Activity });
    }
    if (admin.role === 'OWNER') {
      items.push({ id: 'violations', label: 'Kasus Pelanggaran', icon: Gavel });
      items.push({ id: 'staff', label: 'Staf Admin', icon: Users });
      items.push({ id: 'security_logs', label: 'Log Keamanan', icon: FileText });
    }
    items.push({ id: 'settings', label: 'Keamanan & Akun', icon: Settings });
    return items;
  }, [admin.role]);

  const requestStepUp = (
    title: string,
    description: string,
    executor: (creds: { stepUpPassword: string; stepUpTotpCode: string }) => Promise<void>
  ) => {
    setStepUpState({
      isOpen: true,
      title,
      description,
      submitting: false,
      error: null,
      executor
    });
  };

  const executeStepUp = async (creds: { stepUpPassword: string; stepUpTotpCode: string }) => {
    if (!stepUpState.executor) return;
    setStepUpState((prev) => ({ ...prev, submitting: true, error: null }));
    try {
      await stepUpState.executor(creds);
      setStepUpState({
        isOpen: false,
        title: '',
        description: '',
        submitting: false,
        error: null,
        executor: null
      });
      setToast({ type: 'ok', text: 'Verifikasi ulang berhasil dan aksi telah dijalankan.' });
      refreshSlidingExpiry();
    } catch (err) {
      setStepUpState((prev) => ({
        ...prev,
        submitting: false,
        error: err instanceof Error ? err.message : 'Verifikasi ulang gagal.'
      }));
    }
  };

  const handleSingleOrderStatus = async (invoiceId: string, status: OrderStatus) => {
    setToast(null);
    try {
      await adminFetch(`/api/admin/orders/${encodeURIComponent(invoiceId)}/status`, {
        method: 'POST',
        body: { status }
      });
      setToast({ type: 'ok', text: `Status invoice ${invoiceId} diubah menjadi ${status}.` });
      loadActiveTab('orders');
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleBulkConfirm = () => {
    if (selectedInvoices.length === 0) return;
    requestStepUp(
      `Konfirmasi Massal (${selectedInvoices.length} Transaksi)`,
      `Anda akan mengonfirmasi sekaligus ${selectedInvoices.length} transaksi terpilih menjadi Selesai. Aksi ini wajib diverifikasi ulang dengan sandi + TOTP.`,
      async (creds) => {
        await adminFetch('/api/admin/orders/bulk-confirm', {
          method: 'POST',
          body: {
            invoiceIds: selectedInvoices,
            ...creds
          }
        });
        setSelectedInvoices([]);
        await loadActiveTab('orders');
      }
    );
  };

  const handleCreateBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);
    try {
      await adminFetch('/api/admin/banners', {
        method: 'POST',
        body: {
          kicker: newBannerKicker,
          title: newBannerTitle,
          subtitle: newBannerSubtitle,
          ctaLabel: 'Top-Up Sekarang',
          targetGameId: newBannerGameId,
          image: newBannerImage,
          isActive: true
        }
      });
      setNewBannerTitle('');
      setNewBannerSubtitle('');
      setToast({ type: 'ok', text: 'Banner promo berhasil disimpan dan aktif di halaman utama.' });
      loadActiveTab('banners');
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleDeleteBanner = async (id: string) => {
    try {
      await adminFetch(`/api/admin/banners/${encodeURIComponent(id)}`, { method: 'DELETE' });
      loadActiveTab('banners');
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleLogout = async () => {
    try {
      await adminFetch('/api/admin/auth/logout', { method: 'POST', body: {} });
    } finally {
      onSessionExpired();
    }
  };

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (orderFilter !== 'all' && o.status !== orderFilter) return false;
      if (!q) return true;
      return (
        o.invoiceId.toLowerCase().includes(q) ||
        o.gameName.toLowerCase().includes(q) ||
        o.accountId.toLowerCase().includes(q)
      );
    });
  }, [orders, orderSearch, orderFilter]);

  const handleExportTransactionsCsv = useCallback(() => {
    if (filteredOrders.length === 0) return;
    const csv = buildTransactionsCsv(filteredOrders);
    downloadCsvFile(buildCsvFilename('alstore-transaksi'), csv);
    setToast({
      type: 'ok',
      text: `Berhasil mengunduh ${filteredOrders.length} catatan transaksi ke file CSV.`
    });
  }, [filteredOrders]);

  const idleRemainingSec = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
  const idleMm = String(Math.floor(idleRemainingSec / 60)).padStart(2, '0');
  const idleSs = String(idleRemainingSec % 60).padStart(2, '0');
  const currentTabLabel = navItems.find((n) => n.id === activeTab)?.label || 'Ringkasan';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/70">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shrink-0">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_6thn0x6thn0x6thn_dd57a2b3.jpeg"
              alt="ALSTORE"
              className="w-full h-full object-cover scale-[1.15]"
            />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-sm text-slate-50 truncate">ALSTORE Admin</p>
            <p className="font-mono text-[11px] text-sky-400">{admin.role}</p>
          </div>
        </div>

        <nav aria-label="Navigasi Panel Admin" className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2.5">
          <div className="text-xs">
            <p className="font-medium text-slate-100 truncate">{admin.fullName}</p>
            <p className="text-[11px] text-slate-400 truncate">{admin.email}</p>
          </div>
          {onBackToStorefront && (
            <button
              type="button"
              onClick={onBackToStorefront}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-sky-500/35 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-medium text-sky-300 cursor-pointer"
            >
              <Store className="w-3.5 h-3.5" />
              Lihat Web Toko
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar Sesi
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
            <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <span className="font-display font-bold text-sm text-slate-50">ALSTORE Admin</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Tutup menu"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      activeTab === item.id ? 'bg-sky-500/15 text-sky-300' : 'text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-800 space-y-2">
              {onBackToStorefront && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    onBackToStorefront();
                  }}
                  className="w-full py-2 rounded-lg border border-sky-500/35 bg-sky-500/10 text-xs font-medium text-sky-300"
                >
                  Lihat Web Toko
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 rounded-lg border border-slate-700 text-xs text-slate-200"
              >
                Keluar Sesi
              </button>
            </div>
          </div>
          <div className="flex-1 bg-slate-950/70" onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb Left — Session Timer & Refresh Right */}
        <header className="h-14 px-4 sm:px-6 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-1.5 rounded-lg border border-slate-800 text-slate-300"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
              <span className="font-semibold text-slate-100 whitespace-nowrap">Panel Admin</span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-200 whitespace-nowrap truncate">{currentTabLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span
              data-testid="session-idle-timer"
              className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-300"
              title="Sesi otomatis habis setelah 15 menit tidak aktif"
            >
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              Sesi {idleMm}:{idleSs}
            </span>
            {admin.role === 'OWNER' && (
              <button
                type="button"
                data-testid="open-security-settings-modal-btn"
                onClick={() => setSecurityModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-500/35 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-medium text-sky-300 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Pengaturan Keamanan
              </button>
            )}
            <button
              type="button"
              onClick={() => loadActiveTab(activeTab)}
              aria-label="Muat ulang data"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 text-xs text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* Mandatory Weak Password Warning Banner */}
          {admin.isWeakPassword && (
            <div
              role="alert"
              data-testid="weak-password-banner"
              className="rounded-xl border border-amber-500/45 bg-amber-950/40 px-5 py-4 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-200">
                    Sandi lemah, segera ganti
                  </p>
                  <p className="text-xs text-amber-200/80 mt-0.5">
                    Akun Anda masih memakai sandi awal atau sandi lemah. Ganti dengan sandi minimal 12 karakter (huruf besar, huruf kecil, angka, simbol) untuk melindungi dana ALSTORE.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
              >
                Ganti Sandi Sekarang
              </button>
            </div>
          )}

          {toast && (
            <div
              role="status"
              className={`rounded-lg border px-4 py-3 text-xs flex items-center justify-between gap-3 ${
                toast.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-950/35 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-950/35 text-rose-200'
              }`}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Tutup notifikasi"
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-50">
                  Ringkasan Operasional &amp; Keamanan
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Masuk sebagai {admin.fullName} ({admin.role}) · Seluruh perubahan dicatat permanen.
                </p>
              </div>

              {overview ? (
                <>
                  <AdminKeyMetricsWidget
                    role={admin.role}
                    metrics={overview.metrics}
                    alerts={overview.ownerAlerts}
                    lastUpdatedMs={lastOverviewSyncMs}
                    nowMs={nowMs}
                    refreshing={loading || overviewRefreshing}
                    autoRefreshEnabled={autoRefreshOverview}
                    acknowledgingId={acknowledgingAlertId}
                    onToggleAutoRefresh={() => setAutoRefreshOverview((prev) => !prev)}
                    onManualRefresh={() => void refreshOverviewQuietly()}
                    onOpenPendingVerification={handleOpenPendingVerification}
                    onOpenViolations={
                      admin.role === 'OWNER' ? () => setActiveTab('violations') : undefined
                    }
                    onAcknowledgeAlert={
                      admin.role === 'OWNER' ? handleAcknowledgeAlert : undefined
                    }
                  />

                  {/* Recent Orders Snapshot */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-100">Transaksi Terbaru</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('orders')}
                        className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
                      >
                        Kelola Semua Transaksi
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                          <tr>
                            <th className="py-3 px-4 font-medium">Invoice</th>
                            <th className="py-3 px-4 font-medium">Produk &amp; Target</th>
                            <th className="py-3 px-4 font-medium text-right">Total</th>
                            <th className="py-3 px-4 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {overview.recentOrders.map((ord) => (
                            <tr key={ord.invoiceId} className="hover:bg-slate-800/30">
                              <td className="py-3 px-4 font-mono text-slate-100">{ord.invoiceId}</td>
                              <td className="py-3 px-4 text-slate-300">
                                {ord.gameName} · {ord.itemName}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-100">
                                {formatIdr(ord.totalAmount)}
                              </td>
                              <td className="py-3 px-4 font-medium">
                                <span
                                  className={
                                    ord.status === 'completed'
                                      ? 'text-emerald-300'
                                      : ord.status === 'waiting_verification'
                                        ? 'text-sky-300'
                                        : ord.status === 'pending'
                                          ? 'text-amber-300'
                                          : 'text-rose-300'
                                  }
                                >
                                  {ord.status === 'completed'
                                    ? 'Selesai'
                                    : ord.status === 'waiting_verification'
                                      ? 'Menunggu Verifikasi'
                                      : ord.status === 'pending'
                                        ? 'Menunggu Bayar'
                                        : 'Kedaluwarsa'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-xs text-slate-400">
                  Memuat ringkasan metrik operasional...
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ORDERS & BULK CONFIRMATION */}
          {activeTab === 'orders' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-bold text-slate-50">
                    Riwayat &amp; Manajemen Transaksi
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Konfirmasi massal wajib verifikasi ulang Sandi + TOTP. Tim Keuangan &amp; Owner dapat mengekspor data transaksi terfilter ke CSV untuk pelaporan eksternal.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    {filteredOrders.length} / {orders.length} transaksi
                  </span>

                  <button
                    type="button"
                    data-testid="download-transactions-csv-btn"
                    onClick={handleExportTransactionsCsv}
                    disabled={filteredOrders.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40 text-xs font-medium text-slate-100 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh CSV
                  </button>

                  {(admin.role === 'OWNER' || admin.role === 'ADMIN') && selectedInvoices.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBulkConfirm}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Konfirmasi Massal ({selectedInvoices.length}) · TOTP
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Cari nomor invoice, game, atau ID akun..."
                  className="flex-1 min-w-[220px] px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
                  {(['all', 'waiting_verification', 'pending', 'completed', 'expired'] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setOrderFilter(st)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                          orderFilter === st ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {st === 'all'
                          ? 'Semua'
                          : st === 'waiting_verification'
                            ? 'Verifikasi'
                            : st === 'pending'
                              ? 'Pending'
                              : st === 'completed'
                                ? 'Selesai'
                                : 'Kedaluwarsa'}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                      <tr>
                        {(admin.role === 'OWNER' || admin.role === 'ADMIN') && (
                          <th className="py-3 px-4 w-10">Pilih</th>
                        )}
                        <th className="py-3 px-4 font-medium">Invoice &amp; Waktu</th>
                        <th className="py-3 px-4 font-medium">Produk &amp; Target</th>
                        <th className="py-3 px-4 font-medium text-right">Total</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        {(admin.role === 'OWNER' || admin.role === 'ADMIN') && (
                          <th className="py-3 px-4 font-medium text-right">Aksi</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredOrders.map((ord) => {
                        const checked = selectedInvoices.includes(ord.invoiceId);
                        const canConfirm = ord.status !== 'completed';
                        return (
                          <tr key={ord.invoiceId} className="hover:bg-slate-800/30">
                            {(admin.role === 'OWNER' || admin.role === 'ADMIN') && (
                              <td className="py-3.5 px-4">
                                <input
                                  type="checkbox"
                                  aria-label={`Pilih invoice ${ord.invoiceId}`}
                                  disabled={!canConfirm}
                                  checked={checked}
                                  onChange={(e) => {
                                    setSelectedInvoices((prev) =>
                                      e.target.checked
                                        ? [...prev, ord.invoiceId]
                                        : prev.filter((id) => id !== ord.invoiceId)
                                    );
                                  }}
                                />
                              </td>
                            )}
                            <td className="py-3.5 px-4">
                              <p className="font-mono font-semibold text-slate-100">{ord.invoiceId}</p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                {formatDateTimeId(ord.createdAtMs)}
                              </p>
                            </td>
                            <td className="py-3.5 px-4">
                              <p className="text-slate-100 font-medium">
                                {ord.gameName} · {ord.itemName}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                Target: {ord.accountId}
                                {ord.zoneId ? ` (${ord.zoneId})` : ''}
                                {ord.proofFileName ? ` · Bukti: ${ord.proofFileName}` : ''}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-100">
                              {formatIdr(ord.totalAmount)}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={
                                  ord.status === 'completed'
                                    ? 'text-emerald-300 font-medium'
                                    : ord.status === 'waiting_verification'
                                      ? 'text-sky-300 font-medium'
                                      : ord.status === 'pending'
                                        ? 'text-amber-300 font-medium'
                                        : 'text-rose-300 font-medium'
                                }
                              >
                                {ord.status === 'completed'
                                  ? 'Selesai'
                                  : ord.status === 'waiting_verification'
                                    ? 'Menunggu Verifikasi'
                                    : ord.status === 'pending'
                                      ? 'Menunggu Bayar'
                                      : 'Kedaluwarsa'}
                              </span>
                            </td>
                            {(admin.role === 'OWNER' || admin.role === 'ADMIN') && (
                              <td className="py-3.5 px-4 text-right">
                                {ord.status !== 'completed' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSingleOrderStatus(ord.invoiceId, 'completed')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/35 hover:bg-emerald-500/25 text-emerald-300 font-medium text-xs whitespace-nowrap cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Konfirmasi
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-500">
                                    {ord.confirmedByName || 'Terkonfirmasi'}
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BANNERS */}
          {activeTab === 'banners' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-50">Kelola Banner Promo</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Perubahan banner langsung tersinkron ke slider halaman utama ALSTORE.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 space-y-3">
                  {banners.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex items-center gap-4"
                    >
                      <img
                        src={b.image}
                        alt={b.title}
                        className="w-24 h-16 rounded-lg object-cover border border-slate-800 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-sky-400">{b.kicker}</p>
                        <p className="text-sm font-semibold text-slate-100 truncate">{b.title}</p>
                        <p className="text-xs text-slate-400 truncate">{b.subtitle}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteBanner(b.id)}
                        aria-label={`Hapus banner ${b.title}`}
                        className="p-2 rounded-lg border border-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleCreateBanner}
                  className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3"
                >
                  <h3 className="text-sm font-semibold text-slate-100">Tambah Banner Baru</h3>
                  <div className="space-y-1">
                    <label htmlFor="bn-kicker" className="block text-xs text-slate-300">Label Kicker</label>
                    <input
                      id="bn-kicker"
                      type="text"
                      required
                      value={newBannerKicker}
                      onChange={(e) => setNewBannerKicker(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="bn-title" className="block text-xs text-slate-300">Judul Promo</label>
                    <input
                      id="bn-title"
                      type="text"
                      required
                      value={newBannerTitle}
                      onChange={(e) => setNewBannerTitle(e.target.value)}
                      placeholder="Contoh: Diskon Akhir Pekan 15% MLBB"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="bn-sub" className="block text-xs text-slate-300">Subjudul</label>
                    <input
                      id="bn-sub"
                      type="text"
                      required
                      value={newBannerSubtitle}
                      onChange={(e) => setNewBannerSubtitle(e.target.value)}
                      placeholder="Proses instan via QRIS resmi"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="bn-game" className="block text-xs text-slate-300">Target Game</label>
                    <select
                      id="bn-game"
                      value={newBannerGameId}
                      onChange={(e) => setNewBannerGameId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
                    >
                      <option value="mlbb">Mobile Legends</option>
                      <option value="ff">Free Fire</option>
                      <option value="valorant">Valorant</option>
                      <option value="pb">Point Blank</option>
                      <option value="pubg">PUBG Mobile</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="bn-img" className="block text-xs text-slate-300">Path / URL Gambar</label>
                    <input
                      id="bn-img"
                      type="text"
                      required
                      value={newBannerImage}
                      onChange={(e) => setNewBannerImage(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 font-mono text-xs text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer"
                  >
                    Simpan Banner Promo
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: FINANCE & PAYOUT ACCOUNTS */}
          {activeTab === 'finance' && (
            <AdminFinanceSection
              role={admin.role}
              accounts={payoutAccounts}
              methodBreakdown={methodBreakdown}
              onRequestStepUp={requestStepUp}
              onRefresh={() => loadActiveTab('finance')}
            />
          )}

          {/* TAB 5: PAYROLL */}
          {activeTab === 'payroll' && (
            <AdminPayrollSection
              role={admin.role}
              items={payrollItems}
              onRequestStepUp={requestStepUp}
              onRefresh={() => loadActiveTab('payroll')}
            />
          )}

          {/* TAB 6: ACCESS VIOLATIONS (Rp90.000) */}
          {activeTab === 'violations' && (
            <AdminViolationsSection
              cases={violationCases}
              defaultViolationFeeIdr={defaultViolationFeeIdr}
              onRefresh={() => loadActiveTab('violations')}
            />
          )}

          {/* TAB 7: STAFF MANAGEMENT */}
          {activeTab === 'staff' && (
            <AdminStaffSection
              staff={staffList}
              currentAdminId={admin.id}
              onRefresh={() => loadActiveTab('staff')}
            />
          )}

          {/* TAB 8: ACTIVITY LOGS */}
          {activeTab === 'activity_logs' && (
            <AdminActivityLogsSection
              logs={activityLogs}
              totalCount={activityLogsTotal}
              loading={loading}
              error={activityLogsError}
              onRefresh={() => loadActiveTab('activity_logs')}
              onExportSuccess={(count) =>
                setToast({
                  type: 'ok',
                  text: `Berhasil mengunduh ${count} catatan log aktivitas ke file CSV.`
                })
              }
            />
          )}

          {/* TAB 9: SECURITY & AUDIT LOGS */}
          {activeTab === 'security_logs' && (
            <AdminSecurityLogsSection
              attempts={attempts}
              blocks={blocks}
              auditLogs={auditLogs}
              onRefresh={() => loadActiveTab('security_logs')}
            />
          )}

          {/* TAB 9: SECURITY & SETTINGS */}
          {activeTab === 'settings' && (
            <AdminSecuritySettingsSection
              admin={admin}
              settings={settings}
              onAdminUpdated={onAdminUpdated}
              onRefreshSettings={() => loadActiveTab('settings')}
              onOpenSecurityModal={
                admin.role === 'OWNER' ? () => setSecurityModalOpen(true) : undefined
              }
            />
          )}
        </main>
      </div>

      {/* Owner Security Settings Modal (Enable / Disable / QR Code Generator for TOTP 2FA) */}
      {admin.role === 'OWNER' && (
        <AdminSecuritySettingsModal
          isOpen={securityModalOpen}
          admin={admin}
          authMethod={session.authMethod}
          onClose={() => setSecurityModalOpen(false)}
          onAdminUpdated={onAdminUpdated}
          onStatusToast={(text) => setToast({ type: 'ok', text })}
        />
      )}

      {/* Step-Up Password + TOTP Modal for Sensitive Actions */}
      <StepUpModal
        isOpen={stepUpState.isOpen}
        actionTitle={stepUpState.title}
        actionDescription={stepUpState.description}
        submitting={stepUpState.submitting}
        error={stepUpState.error}
        onCancel={() =>
          setStepUpState({
            isOpen: false,
            title: '',
            description: '',
            submitting: false,
            error: null,
            executor: null
          })
        }
        onConfirm={executeStepUp}
      />
    </div>
  );
};
