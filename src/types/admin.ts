export type AdminRole = 'OWNER' | 'ADMIN' | 'KEUANGAN';

export type AdminPermission =
  | 'dashboard:view'
  | 'orders:view'
  | 'orders:confirm'
  | 'orders:bulk_confirm'
  | 'banners:manage'
  | 'payout_accounts:view'
  | 'payout_accounts:manage'
  | 'finance:view'
  | 'payroll:view'
  | 'payroll:prepare'
  | 'payroll:disburse'
  | 'staff:manage'
  | 'violations:manage'
  | 'security_logs:view'
  | 'activity_logs:view'
  | 'settings:manage';

export interface AdminUserPublic {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  isActive: boolean;
  isWeakPassword: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  totpRequired: boolean;
  createdAtMs: number;
  lastLoginAtMs: number | null;
}

export interface AdminSessionState {
  authenticated: boolean;
  needsOwnerBootstrap?: boolean;
  needsTotpEnrollment?: boolean;
  authMethod?: 'password' | 'firebase_sso';
  sessionToken?: string;
  admin?: AdminUserPublic;
  idleTimeoutMs: number;
  lastActivityAtMs?: number;
  expiresAtMs?: number;
  turnstileSiteKey?: string;
}

export interface LoginAttemptRecord {
  id: string;
  createdAtMs: number;
  ipAddress: string;
  userAgent: string;
  deviceHash: string;
  targetAccount: string;
  customerUid: string | null;
  customerEmail: string | null;
  attemptType: 'login_fail' | 'login_success' | 'blocked_path' | 'step_up_fail';
  outcome: string;
}

export interface IpDeviceBlockRecord {
  id: string;
  ipAddress: string;
  deviceHash: string;
  userAgent: string;
  reason: string;
  customerUid: string | null;
  customerEmail: string | null;
  blockedAtMs: number;
  active: boolean;
  unblockedBy: string | null;
  unblockedAtMs: number | null;
}

export type ViolationCaseStatus =
  | 'pending_review'
  | 'approved_unpaid'
  | 'resolved_paid'
  | 'pardoned'
  | 'cancelled'
  | 'anonymous_blocked';

export interface ViolationCaseRecord {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  isRegisteredCustomer: boolean;
  billable: boolean;
  customerUid: string | null;
  customerEmail: string | null;
  customerProvider: string | null;
  ipAddress: string;
  deviceHash: string;
  userAgent: string;
  attemptCount: number;
  triggerReason: string;
  evidenceSummary: string;
  feeAmountIdr: number;
  status: ViolationCaseStatus;
  invoiceId: string | null;
  reviewedByName: string | null;
  reviewedAtMs: number | null;
  reviewNote: string | null;
}

export interface PayoutAccountRecord {
  id: string;
  providerType: 'BANK' | 'EWALLET' | 'QRIS';
  providerName: string;
  accountNumber: string;
  accountHolder: string;
  isPrimary: boolean;
  updatedAtMs: number;
  updatedByName: string;
}

export interface PayrollItemRecord {
  id: string;
  periodLabel: string;
  employeeName: string;
  employeeRole: AdminRole;
  bankLabel: string;
  accountNumber: string;
  amountIdr: number;
  note: string;
  status: 'DRAFT' | 'DISBURSED';
  preparedById: string;
  preparedByName: string;
  preparedAtMs: number;
  disbursedById: string | null;
  disbursedByName: string | null;
  disbursedAtMs: number | null;
}

export interface AuditLogRecord {
  id: string;
  createdAtMs: number;
  actorId: string;
  actorName: string;
  actorEmail?: string | null;
  actorRole: AdminRole;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  ipAddress: string;
}

export interface OwnerAlertRecord {
  id: string;
  createdAtMs: number;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  channel: string;
  acknowledged: boolean;
}

export interface AdminSettingsRecord {
  violationFeeIdr: number;
  ownerAlertEmail: string;
  telegramConfigured: boolean;
  turnstileConfigured: boolean;
  adminPathHint: string;
  updatedAtMs: number;
}

export interface AdminBannerRecord {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetGameId: string;
  image: string;
  imagePosition: string;
  highlightNote: string;
  isActive: boolean;
  sortOrder: number;
  updatedAtMs: number;
}

export interface CustomerSuspensionInfo {
  suspended: boolean;
  caseId?: string;
  status?: ViolationCaseStatus;
  feeAmountIdr?: number;
  invoiceId?: string | null;
  reason?: string;
  message?: string;
}

export interface AdminKeyMetricsData {
  successfulTransactionsToday: number;
  revenueTodayIdr: number;
  confirmedRevenueIdr: number;
  confirmedOrdersCount: number;
  waitingVerificationCount: number;
  pendingPaymentCount: number;
  activeViolationCasesCount: number;
  activeBlockedDevicesCount: number;
  unacknowledgedAlertsCount: number;
  criticalAlertsCount: number;
}

