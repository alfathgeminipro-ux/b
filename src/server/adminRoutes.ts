import crypto from 'node:crypto';
import type { NextFunction, Request, Response, Router } from 'express';
import express from 'express';
import QRCode from 'qrcode';
import type { AdminPermission, AdminRole } from '../types/admin';
import type { OrderStatus } from '../types/store';
import {
  getDb,
  getViolationFeeSetting,
  mapAttemptRow,
  mapAuditLogRow,
  mapBannerRow,
  mapBlockRow,
  mapOrderRow,
  mapOwnerAlertRow,
  mapPayoutAccountRow,
  mapPayrollRow,
  mapViolationCaseRow,
  setViolationFeeSetting,
  toPublicAdminUser,
  writeAuditLog
} from './db';
import { verifyCustomerBearerToken } from './firebaseVerify';
import {
  dispatchOwnerSecurityAlert,
  issueFallbackCaptchaChallenge,
  verifyCaptchaResponse
} from './integrations';
import {
  assessPasswordStrength,
  generateSecureTokenHex,
  hashPasswordArgon2id,
  sha256Hex,
  verifyPasswordConstantTime
} from './password';
import {
  ACCESS_DENIED_WARNING_MESSAGE,
  DECOY_ADMIN_PATHS,
  GENERIC_LOGIN_ERROR,
  SESSION_IDLE_TIMEOUT_MS,
  WINDOW_24H_MS,
  type AdminSessionAuthMethod,
  evaluateIntrusionPolicy,
  evaluateViolationEligibility,
  extractSessionTokenCandidates,
  hasRolePermission,
  isAllowedAdminOrigin,
  isAllowlistedOwnerEmail,
  isSafeImageUrl,
  isSessionIdleExpired,
  normalizeAdminPath,
  shouldRequireTotpEnrollment
} from './securityPolicy';
import { buildOtpAuthUri, generateTotpSecret, verifyTotpCode } from './totp';

const ADMIN_COOKIE_NAME = 'alstore_admin_sid';

interface AdminDbRow extends Record<string, unknown> {
  id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  password_hash: string;
  is_active: number;
  is_weak_password: number;
  must_change_password: number;
  totp_secret: string | null;
  totp_pending_secret: string | null;
  totp_enabled: number;
  totp_opted_out: number;
  totp_last_step: number | null;
  created_at_ms: number;
  last_login_at_ms: number | null;
}

interface AdminAuthedRequest extends Request {
  adminUser?: AdminDbRow;
  adminSessionRawToken?: string;
  adminSessionTokenHash?: string;
  adminSessionAuthMethod?: AdminSessionAuthMethod;
  adminSessionLastActivityMs?: number;
  adminSessionExpiresAtMs?: number;
}

export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export function getDeviceHash(req: Request): string {
  const ua = String(req.headers['user-agent'] || 'unknown');
  const lang = String(req.headers['accept-language'] || '');
  const clientDeviceHint = String(req.headers['x-alstore-device'] || '');
  return `dev_${sha256Hex(`${ua}|${lang}|${clientDeviceHint}`).slice(0, 12)}`;
}

interface ResolvedAdminSession {
  rawToken: string;
  tokenHash: string;
  adminRow: AdminDbRow;
  authMethod: AdminSessionAuthMethod;
  lastActivityAtMs: number;
  expiresAtMs: number;
}

function getRequestAdminTokenCandidates(req: Request): string[] {
  return extractSessionTokenCandidates({
    headerToken: typeof req.headers['x-admin-session'] === 'string' ? req.headers['x-admin-session'] : undefined,
    parsedCookieToken:
      req.cookies && typeof req.cookies[ADMIN_COOKIE_NAME] === 'string'
        ? req.cookies[ADMIN_COOKIE_NAME]
        : undefined,
    rawCookieHeader: typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined,
    cookieName: ADMIN_COOKIE_NAME
  });
}

function resolveActiveAdminSessionFromRequest(req: Request): {
  session: ResolvedAdminSession | null;
  hadCandidates: boolean;
  expired: boolean;
} {
  const candidates = getRequestAdminTokenCandidates(req);
  if (candidates.length === 0) {
    return { session: null, hadCandidates: false, expired: false };
  }

  const db = getDb();
  const now = Date.now();
  let sawExpired = false;

  for (const rawToken of candidates) {
    const tokenHash = sha256Hex(rawToken);
    const sessionRow = db
      .prepare(
        'SELECT token_hash, admin_id, auth_method, last_activity_at_ms, expires_at_ms FROM admin_sessions WHERE token_hash = ?'
      )
      .get(tokenHash) as
      | {
          token_hash: string;
          admin_id: string;
          auth_method?: string;
          last_activity_at_ms: number;
          expires_at_ms: number;
        }
      | undefined;

    if (!sessionRow) continue;

    if (
      isSessionIdleExpired(Number(sessionRow.last_activity_at_ms), now, SESSION_IDLE_TIMEOUT_MS) ||
      now > Number(sessionRow.expires_at_ms)
    ) {
      db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
      sawExpired = true;
      continue;
    }

    const adminRow = db
      .prepare('SELECT * FROM admin_users WHERE id = ? AND is_active = 1')
      .get(sessionRow.admin_id) as AdminDbRow | undefined;

    if (!adminRow) {
      db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
      continue;
    }

    const authMethod: AdminSessionAuthMethod =
      sessionRow.auth_method === 'firebase_sso' ? 'firebase_sso' : 'password';

    return {
      session: {
        rawToken,
        tokenHash,
        adminRow,
        authMethod,
        lastActivityAtMs: Number(sessionRow.last_activity_at_ms),
        expiresAtMs: Number(sessionRow.expires_at_ms)
      },
      hadCandidates: true,
      expired: false
    };
  }

  return { session: null, hadCandidates: true, expired: sawExpired };
}

function setAdminSessionCookie(_req: Request, res: Response, rawToken: string): void {
  // Always emit HttpOnly; Secure; SameSite=None; Partitioned so admin sessions work reliably
  // both inside cross-site preview iframes (where same-origin fetch sends Sec-Fetch-Site: same-origin)
  // and on top-level HTTPS/localhost origins.
  const parts = [
    `${ADMIN_COOKIE_NAME}=${rawToken}`,
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
    'Path=/',
    `Max-Age=${Math.floor(SESSION_IDLE_TIMEOUT_MS / 1000)}`
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAdminSessionCookie(_req: Request, res: Response): void {
  // Clear both Partitioned and legacy unpartitioned cookie variants so stale cookies never linger
  res.setHeader('Set-Cookie', [
    `${ADMIN_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0`,
    `${ADMIN_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
  ]);
}

function verifyCsrfAndOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith !== 'ALSTORE-Admin') {
    res.status(403).json({ error: 'Header keamanan permintaan tidak valid.' });
    return;
  }

  const originAllowed = isAllowedAdminOrigin({
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
    host: typeof req.headers.host === 'string' ? req.headers.host : undefined,
    forwardedHost:
      typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'] : undefined,
    secFetchSite:
      typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'] : undefined
  });

  if (!originAllowed) {
    res.status(403).json({ error: 'Origin tidak diizinkan.' });
    return;
  }

  next();
}

function isIpOrDeviceBlocked(ipAddress: string, deviceHash: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT id FROM ip_device_blocks WHERE active = 1 AND (ip_address = ? OR device_hash = ?) LIMIT 1'
    )
    .get(ipAddress, deviceHash);
  return Boolean(row);
}

function getLockoutState(ipAddress: string, deviceHash: string): {
  lockedUntilMs: number | null;
  requireCaptcha: boolean;
  tier: string;
} {
  const db = getDb();
  const now = Date.now();
  const scopeKey = `${ipAddress}|${deviceHash}`;
  const row = db
    .prepare('SELECT locked_until_ms, require_captcha, tier FROM login_lockouts WHERE scope_key = ?')
    .get(scopeKey) as { locked_until_ms: number; require_captcha: number; tier: string } | undefined;

  if (!row) {
    return { lockedUntilMs: null, requireCaptcha: false, tier: 'none' };
  }

  const lockedUntilMs = Number(row.locked_until_ms) > now ? Number(row.locked_until_ms) : null;
  return {
    lockedUntilMs,
    requireCaptcha: Number(row.require_captcha) === 1,
    tier: String(row.tier)
  };
}

function countRecentAttempts(ipAddress: string, deviceHash: string, attemptType: 'login_fail' | 'blocked_path'): number {
  const db = getDb();
  const since = Date.now() - WINDOW_24H_MS;
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM login_attempts
       WHERE created_at_ms >= ? AND attempt_type = ? AND (ip_address = ? OR device_hash = ?)`
    )
    .get(since, attemptType, ipAddress, deviceHash) as { cnt: number };
  return Number(row.cnt);
}

async function recordIntrusionAndEnforce(params: {
  req: Request;
  targetAccount: string;
  attemptType: 'login_fail' | 'blocked_path' | 'step_up_fail';
  outcome: string;
  customerUid?: string | null;
  customerEmail?: string | null;
  customerProvider?: string | null;
}): Promise<{
  blockedNow: boolean;
  lockedUntilMs: number | null;
  requireCaptcha: boolean;
  tier: string;
}> {
  const db = getDb();
  const now = Date.now();
  const ipAddress = getClientIp(params.req);
  const userAgent = String(params.req.headers['user-agent'] || 'unknown').slice(0, 300);
  const deviceHash = getDeviceHash(params.req);

  db.prepare(`
    INSERT INTO login_attempts (
      id, created_at_ms, ip_address, user_agent, device_hash, target_account,
      customer_uid, customer_email, attempt_type, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `att_${generateSecureTokenHex(8)}`,
    now,
    ipAddress,
    userAgent,
    deviceHash,
    params.targetAccount.slice(0, 120),
    params.customerUid || null,
    params.customerEmail || null,
    params.attemptType,
    params.outcome
  );

  const failedLoginCount24h = countRecentAttempts(ipAddress, deviceHash, 'login_fail');
  const blockedPathCount24h = countRecentAttempts(ipAddress, deviceHash, 'blocked_path');
  const evaluation = evaluateIntrusionPolicy({
    failedLoginCount24h,
    blockedPathCount24h,
    nowMs: now
  });

  if (evaluation.tier !== 'none' && evaluation.lockUntilMs) {
    const scopeKey = `${ipAddress}|${deviceHash}`;
    db.prepare(`
      INSERT OR REPLACE INTO login_lockouts (
        scope_key, ip_address, device_hash, locked_until_ms, require_captcha, tier, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      scopeKey,
      ipAddress,
      deviceHash,
      evaluation.lockUntilMs,
      evaluation.requireCaptcha ? 1 : 0,
      evaluation.tier,
      now
    );
  }

  if (evaluation.triggerOwnerAlert && (failedLoginCount24h === 5 || evaluation.blockIpAndDevice)) {
    await dispatchOwnerSecurityAlert({
      severity: evaluation.blockIpAndDevice ? 'critical' : 'warning',
      title: evaluation.blockIpAndDevice
        ? 'Blokir IP/Perangkat & Kasus Pelanggaran Akses Baru'
        : 'Peringatan 5x Gagal Login Panel Admin',
      message: `IP ${ipAddress} (${deviceHash}) mencatat ${failedLoginCount24h}x gagal login dan ${blockedPathCount24h}x akses path admin diblokir dalam 24 jam. Target: ${params.targetAccount}.`
    });
  }

  let blockedNow = false;
  if (evaluation.blockIpAndDevice) {
    blockedNow = true;
    const triggerReason =
      blockedPathCount24h >= 3
        ? '3x+ akses path admin diblokir dalam 24 jam'
        : '10x+ gagal login admin dalam 24 jam';

    const alreadyBlocked = db
      .prepare('SELECT id FROM ip_device_blocks WHERE active = 1 AND ip_address = ? AND device_hash = ? LIMIT 1')
      .get(ipAddress, deviceHash);

    if (!alreadyBlocked) {
      db.prepare(`
        INSERT INTO ip_device_blocks (
          id, ip_address, device_hash, user_agent, reason, customer_uid, customer_email, blocked_at_ms, active, unblocked_by, unblocked_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)
      `).run(
        `blk_${generateSecureTokenHex(8)}`,
        ipAddress,
        deviceHash,
        userAgent,
        triggerReason,
        params.customerUid || null,
        params.customerEmail || null,
        now
      );
    }

    // Open "Kasus Pelanggaran Akses" if no open case exists for this IP/device/customer
    const existingCase = db
      .prepare(
        `SELECT id FROM violation_cases
         WHERE status IN ('pending_review', 'approved_unpaid', 'anonymous_blocked')
           AND (ip_address = ? OR device_hash = ? OR (customer_uid IS NOT NULL AND customer_uid = ?))
         LIMIT 1`
      )
      .get(ipAddress, deviceHash, params.customerUid || '') as { id: string } | undefined;

    if (!existingCase) {
      const eligibility = evaluateViolationEligibility(params.customerUid);
      const feeAmount = eligibility.billable ? getViolationFeeSetting() : 0;
      const caseId = `CASE-${new Date(now).getFullYear()}-${crypto.randomInt(100, 999)}`;
      const totalAttempts = failedLoginCount24h + blockedPathCount24h;
      const evidenceSummary = eligibility.isRegisteredCustomer
        ? `Akun pelanggan terdaftar (${params.customerEmail || params.customerUid}) melakukan ${totalAttempts} percobaan tidak sah (${triggerReason}). Akun ditangguhkan menunggu tinjauan Owner sebelum penagihan Rp ${feeAmount.toLocaleString('id-ID')}.`
        : `Pengunjung anonim tanpa akun pelanggan melakukan ${totalAttempts} percobaan tidak sah (${triggerReason}). Hanya diblokir & dicatat, tidak dapat dikenai tagihan.`;

      db.prepare(`
        INSERT INTO violation_cases (
          id, created_at_ms, updated_at_ms, is_registered_customer, billable,
          customer_uid, customer_email, customer_provider, ip_address, device_hash,
          user_agent, attempt_count, trigger_reason, evidence_summary, fee_amount_idr,
          status, invoice_id, reviewed_by_name, reviewed_at_ms, review_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
      `).run(
        caseId,
        now,
        now,
        eligibility.isRegisteredCustomer ? 1 : 0,
        eligibility.billable ? 1 : 0,
        params.customerUid || null,
        params.customerEmail || null,
        params.customerProvider || null,
        ipAddress,
        deviceHash,
        userAgent,
        totalAttempts,
        triggerReason,
        evidenceSummary,
        feeAmount,
        eligibility.initialStatus
      );

      if (eligibility.suspendAccount && params.customerUid) {
        db.prepare(`
          INSERT OR REPLACE INTO customer_suspensions (
            customer_uid, customer_email, case_id, status, fee_amount_idr, invoice_id, updated_at_ms
          ) VALUES (?, ?, ?, 'pending_review', ?, NULL, ?)
        `).run(
          params.customerUid,
          params.customerEmail || params.customerUid,
          caseId,
          feeAmount,
          now
        );
      }
    }
  }

  return {
    blockedNow,
    lockedUntilMs: evaluation.lockUntilMs,
    requireCaptcha: evaluation.requireCaptcha,
    tier: evaluation.tier
  };
}

function requireAdminAuth(options?: { allowTotpEnrollment?: boolean }) {
  return (req: AdminAuthedRequest, res: Response, next: NextFunction): void => {
    const resolved = resolveActiveAdminSessionFromRequest(req);

    if (!resolved.hadCandidates) {
      res.status(401).json({ error: 'Sesi admin tidak ditemukan. Silakan masuk kembali.' });
      return;
    }

    if (!resolved.session) {
      clearAdminSessionCookie(req, res);
      res.status(401).json({
        error: resolved.expired
          ? 'Sesi berakhir otomatis karena 15 menit tidak aktif.'
          : 'Sesi admin tidak valid atau telah berakhir.'
      });
      return;
    }

    const { rawToken, tokenHash, adminRow, authMethod } = resolved.session;

    // Enforce mandatory initial TOTP 2FA for password-authenticated Owner unless explicitly disabled in Security Settings
    if (
      shouldRequireTotpEnrollment({
        role: adminRow.role,
        totpEnabled: Number(adminRow.totp_enabled) === 1,
        authMethod,
        totpOptedOut: Number(adminRow.totp_opted_out) === 1
      }) &&
      !options?.allowTotpEnrollment
    ) {
      res.status(403).json({
        error: 'Verifikasi dua langkah (TOTP 2FA) wajib diaktifkan untuk akun Owner.',
        needsTotpEnrollment: true
      });
      return;
    }

    // Sliding 15-minute idle timeout renewal
    const db = getDb();
    const now = Date.now();
    const newExpiresAt = now + SESSION_IDLE_TIMEOUT_MS;
    db.prepare('UPDATE admin_sessions SET last_activity_at_ms = ?, expires_at_ms = ? WHERE token_hash = ?').run(
      now,
      newExpiresAt,
      tokenHash
    );
    setAdminSessionCookie(req, res, rawToken);

    req.adminUser = adminRow;
    req.adminSessionRawToken = rawToken;
    req.adminSessionTokenHash = tokenHash;
    req.adminSessionAuthMethod = authMethod;
    req.adminSessionLastActivityMs = now;
    req.adminSessionExpiresAtMs = newExpiresAt;
    next();
  };
}

function requirePermission(permission: AdminPermission) {
  return (req: AdminAuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      res.status(401).json({ error: 'Tidak terautentikasi.' });
      return;
    }
    if (!hasRolePermission(req.adminUser.role, permission)) {
      res.status(403).json({
        error: `Akses ditolak. Peran ${req.adminUser.role} tidak memiliki izin untuk aksi ini.`
      });
      return;
    }
    next();
  };
}

async function verifyStepUpCredentials(
  req: AdminAuthedRequest,
  res: Response,
  stepUpPassword: unknown,
  stepUpTotpCode: unknown,
  actionName: string
): Promise<boolean> {
  const admin = req.adminUser;
  if (!admin) {
    res.status(401).json({ error: 'Sesi tidak valid.' });
    return false;
  }

  const passwordStr = typeof stepUpPassword === 'string' ? stepUpPassword : '';
  const totpStr = typeof stepUpTotpCode === 'string' ? stepUpTotpCode : '';

  if (Number(admin.totp_enabled) !== 1 || !admin.totp_secret) {
    res.status(403).json({
      error: 'Aksi sensitif mewajibkan TOTP 2FA aktif pada akun Anda. Aktifkan TOTP di menu Keamanan terlebih dahulu.'
    });
    return false;
  }

  const pwdValid = await verifyPasswordConstantTime(passwordStr, admin.password_hash);
  const totpResult = verifyTotpCode(admin.totp_secret, totpStr, {
    lastUsedStep: admin.totp_last_step !== null ? Number(admin.totp_last_step) : null
  });

  if (!pwdValid || !totpResult.valid || totpResult.matchedStep === null) {
    await recordIntrusionAndEnforce({
      req,
      targetAccount: admin.email,
      attemptType: 'step_up_fail',
      outcome: `Gagal verifikasi ulang sandi + TOTP untuk ${actionName}`
    });
    res.status(403).json({
      error: 'Verifikasi ulang gagal. Pastikan sandi dan kode TOTP 6 digit terbaru benar.'
    });
    return false;
  }

  const db = getDb();
  db.prepare('UPDATE admin_users SET totp_last_step = ? WHERE id = ?').run(totpResult.matchedStep, admin.id);
  return true;
}

export function createApiRouter(): Router {
  const router = express.Router();

  // Always prevent indexing on all admin API routes
  router.use('/admin', (_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
  });

  // =========================================================================
  // 1. STEALTH PATH GATE (Never leaks ADMIN_PATH to clients)
  // =========================================================================
  router.post('/gate/check', async (req: Request, res: Response) => {
    const pathname = String(req.body?.pathname || '').trim().replace(/\/+$/, '') || '/';
    const secretAdminPath = normalizeAdminPath(process.env.ADMIN_PATH);
    const ipAddress = getClientIp(req);
    const deviceHash = getDeviceHash(req);
    const customer = await verifyCustomerBearerToken(req.headers.authorization);

    const isSecretAdminPath = pathname === secretAdminPath;
    const isDecoyPath = DECOY_ADMIN_PATHS.has(pathname.toLowerCase());
    const isVerifiedAllowlistedOwner = Boolean(
      customer && isAllowlistedOwnerEmail(customer.email, customer.emailVerified)
    );
    const hasActiveAdminSession = Boolean(resolveActiveAdminSessionFromRequest(req).session);

    if (isSecretAdminPath || isDecoyPath) {
      if (isVerifiedAllowlistedOwner || (isSecretAdminPath && hasActiveAdminSession)) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        res.json({ mode: 'admin_portal' });
        return;
      }

      if (isIpOrDeviceBlocked(ipAddress, deviceHash)) {
        res.status(403).json({
          mode: 'access_denied',
          message: ACCESS_DENIED_WARNING_MESSAGE
        });
        return;
      }

      // Customer attempting to open secret admin path OR anyone hitting decoy admin paths
      if ((isSecretAdminPath && customer) || isDecoyPath) {
        const result = await recordIntrusionAndEnforce({
          req,
          targetAccount: pathname,
          attemptType: 'blocked_path',
          outcome: customer
            ? 'Pelanggan terdaftar mencoba membuka path admin'
            : 'Percobaan akses path admin diblokir',
          customerUid: customer?.uid || null,
          customerEmail: customer?.email || null,
          customerProvider: customer?.provider || null
        });

        if (result.blockedNow) {
          res.status(403).json({
            mode: 'access_denied',
            message: ACCESS_DENIED_WARNING_MESSAGE
          });
          return;
        }

        // Plain 404 for customers opening the admin path before reaching block threshold
        res.status(404).json({ mode: 'not_found' });
        return;
      }

      // Exact secret admin path accessed by non-customer -> Admin Login Portal
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.json({ mode: 'admin_portal' });
      return;
    }

    if (pathname === '/') {
      res.json({ mode: 'storefront' });
      return;
    }

    res.status(404).json({ mode: 'not_found' });
  });

  // =========================================================================
  // 2. PUBLIC STOREFRONT BANNERS, ORDER MIRROR & CUSTOMER SUSPENSION CHECK
  // =========================================================================
  router.get('/public/banners', (_req: Request, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, updated_at_ms DESC')
      .all() as Record<string, unknown>[];
    res.json({ banners: rows.map(mapBannerRow) });
  });

  router.post('/public/orders', async (req: Request, res: Response) => {
    const body = req.body || {};
    const invoiceId = String(body.invoiceId || '').trim();
    if (!invoiceId || invoiceId.length > 64) {
      res.status(400).json({ error: 'Invoice ID tidak valid.' });
      return;
    }

    const customer = await verifyCustomerBearerToken(req.headers.authorization);
    const db = getDb();
    db.prepare(`
      INSERT OR IGNORE INTO orders (
        invoice_id, invoice_type, owner_uid, customer_email, game_id, game_name, item_name,
        account_id, zone_id, whatsapp, payment_method_id, payment_method_name,
        base_price, admin_fee, unique_code, total_amount, status, proof_file_name,
        created_at_ms, expires_at_ms, confirmed_by_name, confirmed_at_ms, violation_case_id
      ) VALUES (?, 'topup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    `).run(
      invoiceId,
      customer?.uid || (body.ownerUid ? String(body.ownerUid).slice(0, 128) : null),
      customer?.email || null,
      String(body.gameId || 'unknown').slice(0, 40),
      String(body.gameName || 'Game').slice(0, 120),
      String(body.itemName || 'Top-Up').slice(0, 140),
      String(body.accountId || '').slice(0, 120),
      String(body.zoneId || '').slice(0, 60),
      String(body.whatsapp || '').slice(0, 32),
      String(body.paymentMethodId || 'qris').slice(0, 40),
      String(body.paymentMethodName || 'QRIS').slice(0, 120),
      Math.max(0, Math.round(Number(body.basePrice) || 0)),
      Math.max(0, Math.round(Number(body.adminFee) || 0)),
      Math.max(0, Math.round(Number(body.uniqueCode) || 0)),
      Math.max(0, Math.round(Number(body.totalAmount) || 0)),
      'pending',
      String(body.proofFileName || '').slice(0, 160),
      Number(body.createdAtMs) || Date.now(),
      Number(body.expiresAtMs) || Date.now() + 15 * 60 * 1000
    );

    res.status(201).json({ ok: true });
  });

  router.post('/public/orders/:invoiceId/proof', (req: Request, res: Response) => {
    const invoiceId = String(req.params.invoiceId || '').trim();
    const fileName = String(req.body?.fileName || '').trim().slice(0, 160);
    if (!invoiceId || !fileName) {
      res.status(400).json({ error: 'Nama file bukti wajib diisi.' });
      return;
    }

    const db = getDb();
    db.prepare(
      `UPDATE orders SET status = 'waiting_verification', proof_file_name = ? WHERE invoice_id = ? AND status IN ('pending', 'waiting_verification')`
    ).run(fileName, invoiceId);
    res.json({ ok: true });
  });

  router.get('/customer/suspension', async (req: Request, res: Response) => {
    const customer = await verifyCustomerBearerToken(req.headers.authorization);
    if (!customer) {
      res.json({ suspended: false });
      return;
    }
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM customer_suspensions WHERE customer_uid = ? LIMIT 1')
      .get(customer.uid) as Record<string, unknown> | undefined;

    if (!row) {
      res.json({ suspended: false });
      return;
    }

    let violationInvoice = null;
    if (row.invoice_id) {
      const ordRow = db
        .prepare('SELECT * FROM orders WHERE invoice_id = ? LIMIT 1')
        .get(String(row.invoice_id)) as Record<string, unknown> | undefined;
      if (ordRow) violationInvoice = mapOrderRow(ordRow);
    }

    res.json({
      suspended: true,
      caseId: String(row.case_id),
      status: String(row.status),
      feeAmountIdr: Number(row.fee_amount_idr),
      invoiceId: row.invoice_id ? String(row.invoice_id) : null,
      invoice: violationInvoice,
      message:
        String(row.status) === 'approved_unpaid'
          ? `Akun Anda ditangguhkan akibat pelanggaran akses panel admin. Lunasi tagihan Rp ${Number(row.fee_amount_idr).toLocaleString('id-ID')} melalui checkout ALSTORE untuk memulihkan akun.`
          : 'Akun Anda sedang ditangguhkan karena percobaan akses tidak sah ke panel admin dan menunggu tinjauan Owner.'
    });
  });

  // =========================================================================
  // 3. ADMIN AUTHENTICATION, BOOTSTRAP, LOCKOUTS, CAPTCHA & TOTP 2FA
  // =========================================================================
  router.get('/admin/auth/status', (req: Request, res: Response) => {
    const db = getDb();
    const ipAddress = getClientIp(req);
    const deviceHash = getDeviceHash(req);

    if (isIpOrDeviceBlocked(ipAddress, deviceHash)) {
      res.status(403).json({
        blocked: true,
        message: ACCESS_DENIED_WARNING_MESSAGE
      });
      return;
    }

    const ownerCount = db.prepare("SELECT COUNT(*) as cnt FROM admin_users WHERE role = 'OWNER'").get() as {
      cnt: number;
    };
    const lockout = getLockoutState(ipAddress, deviceHash);
    const turnstileSiteKey = (process.env.TURNSTILE_SITE_KEY || '').trim();
    const fallbackChallenge =
      lockout.requireCaptcha && !turnstileSiteKey ? issueFallbackCaptchaChallenge(ipAddress) : null;

    // Optionally resolve active session without emitting a 401 error on initial login page load
    let session: {
      authenticated: boolean;
      needsTotpEnrollment?: boolean;
      authMethod?: AdminSessionAuthMethod;
      sessionToken?: string;
      admin?: ReturnType<typeof toPublicAdminUser>;
      idleTimeoutMs: number;
      lastActivityAtMs?: number;
      expiresAtMs?: number;
    } = {
      authenticated: false,
      idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS
    };

    const resolvedStatusSession = resolveActiveAdminSessionFromRequest(req);
    if (resolvedStatusSession.session) {
      const { rawToken, adminRow, authMethod, lastActivityAtMs, expiresAtMs } =
        resolvedStatusSession.session;
      session = {
        authenticated: true,
        needsTotpEnrollment: shouldRequireTotpEnrollment({
          role: adminRow.role,
          totpEnabled: Number(adminRow.totp_enabled) === 1,
          authMethod,
          totpOptedOut: Number(adminRow.totp_opted_out) === 1
        }),
        authMethod,
        sessionToken: rawToken,
        admin: toPublicAdminUser(adminRow),
        idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
        lastActivityAtMs,
        expiresAtMs
      };
    }

    res.json({
      blocked: false,
      needsOwnerBootstrap: ownerCount.cnt === 0,
      lockedUntilMs: lockout.lockedUntilMs,
      requireCaptcha: lockout.requireCaptcha,
      turnstileSiteKey,
      fallbackChallenge,
      session
    });
  });

  // Server-side check whether the signed-in Firebase user is an allowlisted Owner (never exposes allowlist or ADMIN_PATH)
  router.get('/admin/auth/firebase-eligibility', async (req: Request, res: Response) => {
    const identity = await verifyCustomerBearerToken(req.headers.authorization);
    const eligibleOwner = Boolean(
      identity && isAllowlistedOwnerEmail(identity.email, identity.emailVerified)
    );
    res.json({ eligibleOwner });
  });

  // Direct verified Owner sign-in via Firebase Google/Email ID token for allowlisted Owner emails
  router.post('/admin/auth/firebase-sso', verifyCsrfAndOrigin, async (req: Request, res: Response) => {
    const identity = await verifyCustomerBearerToken(req.headers.authorization);
    if (!identity) {
      res.status(401).json({
        error: 'Token akun Google/Firebase tidak valid. Silakan masuk ulang terlebih dahulu.'
      });
      return;
    }

    if (!isAllowlistedOwnerEmail(identity.email, identity.emailVerified)) {
      res.status(403).json({
        error: 'Akun email ini tidak terdaftar sebagai Owner ALSTORE.'
      });
      return;
    }

    const db = getDb();
    const now = Date.now();
    const ipAddress = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || 'unknown').slice(0, 300);
    const deviceHash = getDeviceHash(req);
    const normalizedEmail = identity.email.trim().toLowerCase();
    const displayName = identity.name || 'Owner ALSTORE';

    let ownerRow = db
      .prepare('SELECT * FROM admin_users WHERE lower(email) = ? LIMIT 1')
      .get(normalizedEmail) as AdminDbRow | undefined;

    if (!ownerRow) {
      const ownerId = `adm_${generateSecureTokenHex(8)}`;
      // Store an unguessable strong Argon2id hash so password login cannot be guessed
      const randomStrongHash = await hashPasswordArgon2id(generateSecureTokenHex(24));
      db.prepare(`
        INSERT INTO admin_users (
          id, email, full_name, role, password_hash, is_active,
          is_weak_password, must_change_password, totp_secret, totp_enabled,
          totp_last_step, created_at_ms, last_login_at_ms
        ) VALUES (?, ?, ?, 'OWNER', ?, 1, 0, 0, NULL, 0, NULL, ?, ?)
      `).run(ownerId, normalizedEmail, displayName, randomStrongHash, now, now);

      ownerRow = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(ownerId) as AdminDbRow;
    } else {
      db.prepare(`
        UPDATE admin_users
        SET role = 'OWNER', is_active = 1, last_login_at_ms = ?, full_name = CASE WHEN full_name = '' THEN ? ELSE full_name END
        WHERE id = ?
      `).run(now, displayName, ownerRow.id);
      ownerRow = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(ownerRow.id) as AdminDbRow;
    }

    // Clear any accidental lockouts for the verified Owner's IP/device
    db.prepare('DELETE FROM login_lockouts WHERE scope_key = ?').run(`${ipAddress}|${deviceHash}`);

    db.prepare(`
      INSERT INTO login_attempts (
        id, created_at_ms, ip_address, user_agent, device_hash, target_account,
        customer_uid, customer_email, attempt_type, outcome
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'login_success', 'Login langsung Owner via Google/Firebase terverifikasi')
    `).run(
      `att_${generateSecureTokenHex(8)}`,
      now,
      ipAddress,
      userAgent,
      deviceHash,
      normalizedEmail,
      identity.uid,
      normalizedEmail
    );

    const rawToken = generateSecureTokenHex(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAtMs = now + SESSION_IDLE_TIMEOUT_MS;

    db.prepare(`
      INSERT INTO admin_sessions (
        token_hash, admin_id, ip_address, user_agent, device_hash, auth_method,
        created_at_ms, last_activity_at_ms, expires_at_ms
      ) VALUES (?, ?, ?, ?, ?, 'firebase_sso', ?, ?, ?)
    `).run(tokenHash, ownerRow.id, ipAddress, userAgent, deviceHash, now, now, expiresAtMs);

    writeAuditLog({
      actorId: ownerRow.id,
      actorName: ownerRow.full_name,
      actorRole: 'OWNER',
      action: 'OWNER_SSO_LOGIN',
      targetType: 'session',
      targetId: ownerRow.id,
      details: `Masuk langsung ke Panel Admin sebagai Owner melalui akun terverifikasi (${normalizedEmail})`,
      ipAddress
    });

    setAdminSessionCookie(req, res, rawToken);
    res.json({
      authenticated: true,
      needsTotpEnrollment: false,
      authMethod: 'firebase_sso',
      sessionToken: rawToken,
      admin: toPublicAdminUser(ownerRow),
      idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
      lastActivityAtMs: now,
      expiresAtMs
    });
  });

  // One-time Owner Bootstrap ONLY when ADMIN_INITIAL_PASSWORD was unset and no Owner exists yet
  router.post('/admin/auth/bootstrap-owner', verifyCsrfAndOrigin, async (req: Request, res: Response) => {
    const db = getDb();
    const ownerCount = db.prepare("SELECT COUNT(*) as cnt FROM admin_users WHERE role = 'OWNER'").get() as {
      cnt: number;
    };
    if (ownerCount.cnt > 0) {
      res.status(403).json({ error: 'Akun Owner sudah terdaftar. Pendaftaran awal telah dikunci.' });
      return;
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const fullName = String(req.body?.fullName || 'Owner ALSTORE').trim().slice(0, 80);
    const password = String(req.body?.password || '');

    if (!email || !email.includes('@') || password.length < 6) {
      res.status(400).json({ error: 'Email valid dan sandi minimal 6 karakter wajib diisi.' });
      return;
    }

    const passwordHash = await hashPasswordArgon2id(password);
    const strength = assessPasswordStrength(password);
    const now = Date.now();
    const ownerId = `adm_${generateSecureTokenHex(8)}`;

    db.prepare(`
      INSERT INTO admin_users (
        id, email, full_name, role, password_hash, is_active,
        is_weak_password, must_change_password, totp_secret, totp_enabled,
        totp_last_step, created_at_ms, last_login_at_ms
      ) VALUES (?, ?, ?, 'OWNER', ?, 1, ?, ?, NULL, 0, NULL, ?, ?)
    `).run(
      ownerId,
      email,
      fullName || 'Owner ALSTORE',
      passwordHash,
      strength.isWeak ? 1 : 0,
      strength.isWeak ? 1 : 0,
      now,
      now
    );

    // Create initial session immediately (Owner still must enroll TOTP before operational access)
    const rawToken = generateSecureTokenHex(32);
    const tokenHash = sha256Hex(rawToken);
    const ipAddress = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || 'unknown').slice(0, 300);
    const deviceHash = getDeviceHash(req);

    db.prepare(`
      INSERT INTO admin_sessions (
        token_hash, admin_id, ip_address, user_agent, device_hash,
        created_at_ms, last_activity_at_ms, expires_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tokenHash, ownerId, ipAddress, userAgent, deviceHash, now, now, now + SESSION_IDLE_TIMEOUT_MS);

    writeAuditLog({
      actorId: ownerId,
      actorName: fullName || 'Owner ALSTORE',
      actorRole: 'OWNER',
      action: 'OWNER_BOOTSTRAP',
      targetType: 'admin_user',
      targetId: ownerId,
      details: 'Aktivasi akun Owner pertama selesai (hash Argon2id)',
      ipAddress
    });

    setAdminSessionCookie(req, res, rawToken);
    const createdRow = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(ownerId) as AdminDbRow;
    res.status(201).json({
      authenticated: true,
      needsTotpEnrollment: true,
      authMethod: 'password',
      sessionToken: rawToken,
      admin: toPublicAdminUser(createdRow),
      idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
      lastActivityAtMs: now,
      expiresAtMs: now + SESSION_IDLE_TIMEOUT_MS
    });
  });

  // Admin Login (Constant-Time, Generic Error "Sandi salah", Progressive Lockouts + CAPTCHA + TOTP)
  router.post('/admin/auth/login', verifyCsrfAndOrigin, async (req: Request, res: Response) => {
    const db = getDb();
    const ipAddress = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || 'unknown').slice(0, 300);
    const deviceHash = getDeviceHash(req);
    const now = Date.now();

    if (isIpOrDeviceBlocked(ipAddress, deviceHash)) {
      res.status(403).json({
        blocked: true,
        error: ACCESS_DENIED_WARNING_MESSAGE
      });
      return;
    }

    const lockout = getLockoutState(ipAddress, deviceHash);
    if (lockout.lockedUntilMs && lockout.lockedUntilMs > now) {
      const remainingMinutes = Math.max(1, Math.ceil((lockout.lockedUntilMs - now) / 60000));
      res.status(429).json({
        error: `Akses login terkunci sementara. Coba lagi dalam ${remainingMinutes} menit.`,
        lockedUntilMs: lockout.lockedUntilMs,
        requireCaptcha: true
      });
      return;
    }

    if (lockout.requireCaptcha) {
      const captchaValid = await verifyCaptchaResponse({
        turnstileToken: typeof req.body?.turnstileToken === 'string' ? req.body.turnstileToken : undefined,
        challengeId: typeof req.body?.challengeId === 'string' ? req.body.challengeId : undefined,
        challengeAnswer: typeof req.body?.challengeAnswer === 'string' ? req.body.challengeAnswer : undefined,
        ipAddress
      });

      if (!captchaValid) {
        const turnstileSiteKey = (process.env.TURNSTILE_SITE_KEY || '').trim();
        res.status(400).json({
          error: 'Verifikasi CAPTCHA wajib diselesaikan sebelum melanjutkan.',
          requireCaptcha: true,
          turnstileSiteKey,
          fallbackChallenge: !turnstileSiteKey ? issueFallbackCaptchaChallenge(ipAddress) : null
        });
        return;
      }
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const totpCode = String(req.body?.totpCode || '').trim();
    const customer = await verifyCustomerBearerToken(req.headers.authorization);

    const adminRow = email
      ? (db.prepare('SELECT * FROM admin_users WHERE email = ? LIMIT 1').get(email) as AdminDbRow | undefined)
      : undefined;

    // Constant-time Argon2id verification even when account does not exist
    const passwordMatches = await verifyPasswordConstantTime(password, adminRow?.password_hash);
    const accountActive = Boolean(adminRow && Number(adminRow.is_active) === 1);

    let totpOk = true;
    let matchedTotpStep: number | null = null;
    if (adminRow && accountActive && Number(adminRow.totp_enabled) === 1) {
      if (!totpCode) {
        // Still verify password first; if password wrong, always return generic "Sandi salah"
        if (!passwordMatches) {
          totpOk = false;
        } else {
          // Password valid, TOTP required
          res.status(200).json({
            requiresTotp: true,
            message: 'Masukkan kode verifikasi 6 digit dari aplikasi Authenticator Anda.'
          });
          return;
        }
      } else {
        const check = verifyTotpCode(adminRow.totp_secret || '', totpCode, {
          lastUsedStep: adminRow.totp_last_step !== null ? Number(adminRow.totp_last_step) : null
        });
        totpOk = check.valid;
        matchedTotpStep = check.matchedStep;
      }
    }

    if (!adminRow || !accountActive || !passwordMatches || !totpOk) {
      const enforcement = await recordIntrusionAndEnforce({
        req,
        targetAccount: email || '(kosong)',
        attemptType: 'login_fail',
        outcome: 'Kredensial tidak valid',
        customerUid: customer?.uid || null,
        customerEmail: customer?.email || null,
        customerProvider: customer?.provider || null
      });

      if (enforcement.blockedNow) {
        res.status(403).json({
          blocked: true,
          error: ACCESS_DENIED_WARNING_MESSAGE
        });
        return;
      }

      const turnstileSiteKey = (process.env.TURNSTILE_SITE_KEY || '').trim();
      // ALWAYS return identical error message ("Sandi salah") without leaking account existence
      res.status(401).json({
        error: GENERIC_LOGIN_ERROR,
        lockedUntilMs: enforcement.lockedUntilMs,
        requireCaptcha: enforcement.requireCaptcha,
        turnstileSiteKey,
        fallbackChallenge:
          enforcement.requireCaptcha && !turnstileSiteKey ? issueFallbackCaptchaChallenge(ipAddress) : null
      });
      return;
    }

    // Successful login: record attempt (without password), clear lockout, create sliding session
    db.prepare(`
      INSERT INTO login_attempts (
        id, created_at_ms, ip_address, user_agent, device_hash, target_account,
        customer_uid, customer_email, attempt_type, outcome
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'login_success', 'Login berhasil')
    `).run(`att_${generateSecureTokenHex(8)}`, now, ipAddress, userAgent, deviceHash, adminRow.email);

    db.prepare('DELETE FROM login_lockouts WHERE scope_key = ?').run(`${ipAddress}|${deviceHash}`);

    if (matchedTotpStep !== null) {
      db.prepare('UPDATE admin_users SET last_login_at_ms = ?, totp_last_step = ? WHERE id = ?').run(
        now,
        matchedTotpStep,
        adminRow.id
      );
    } else {
      db.prepare('UPDATE admin_users SET last_login_at_ms = ? WHERE id = ?').run(now, adminRow.id);
    }

    const rawToken = generateSecureTokenHex(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAtMs = now + SESSION_IDLE_TIMEOUT_MS;

    db.prepare(`
      INSERT INTO admin_sessions (
        token_hash, admin_id, ip_address, user_agent, device_hash,
        created_at_ms, last_activity_at_ms, expires_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tokenHash, adminRow.id, ipAddress, userAgent, deviceHash, now, now, expiresAtMs);

    writeAuditLog({
      actorId: adminRow.id,
      actorName: adminRow.full_name,
      actorRole: adminRow.role,
      action: 'LOGIN_SUCCESS',
      targetType: 'session',
      targetId: adminRow.id,
      details: `Masuk ke panel admin (${adminRow.role})`,
      ipAddress
    });

    setAdminSessionCookie(req, res, rawToken);
    const updatedAdmin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminRow.id) as AdminDbRow;
    const needsTotpEnrollment = shouldRequireTotpEnrollment({
      role: updatedAdmin.role,
      totpEnabled: Number(updatedAdmin.totp_enabled) === 1,
      authMethod: 'password',
      totpOptedOut: Number(updatedAdmin.totp_opted_out) === 1
    });

    res.json({
      authenticated: true,
      needsTotpEnrollment,
      authMethod: 'password',
      sessionToken: rawToken,
      admin: toPublicAdminUser(updatedAdmin),
      idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
      lastActivityAtMs: now,
      expiresAtMs
    });
  });

  router.get('/admin/auth/session', requireAdminAuth({ allowTotpEnrollment: true }), (req: AdminAuthedRequest, res: Response) => {
    const admin = req.adminUser!;
    const authMethod = req.adminSessionAuthMethod || 'password';
    res.json({
      authenticated: true,
      needsTotpEnrollment: shouldRequireTotpEnrollment({
        role: admin.role,
        totpEnabled: Number(admin.totp_enabled) === 1,
        authMethod,
        totpOptedOut: Number(admin.totp_opted_out) === 1
      }),
      authMethod,
      sessionToken: req.adminSessionRawToken,
      admin: toPublicAdminUser(admin),
      idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
      lastActivityAtMs: req.adminSessionLastActivityMs,
      expiresAtMs: req.adminSessionExpiresAtMs
    });
  });

  router.post(
    '/admin/auth/logout',
    verifyCsrfAndOrigin,
    requireAdminAuth({ allowTotpEnrollment: true }),
    (req: AdminAuthedRequest, res: Response) => {
      const db = getDb();
      if (req.adminSessionTokenHash) {
        db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(req.adminSessionTokenHash);
      }
      if (req.adminUser) {
        writeAuditLog({
          actorId: req.adminUser.id,
          actorName: req.adminUser.full_name,
          actorRole: req.adminUser.role,
          action: 'LOGOUT',
          targetType: 'session',
          targetId: req.adminUser.id,
          details: 'Keluar dari panel admin',
          ipAddress: getClientIp(req)
        });
      }
      clearAdminSessionCookie(req, res);
      res.json({ ok: true });
    }
  );

  // TOTP 2FA Setup, Confirmation & Owner Disable
  router.post(
    '/admin/auth/totp/setup',
    verifyCsrfAndOrigin,
    requireAdminAuth({ allowTotpEnrollment: true }),
    async (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const db = getDb();
      const secret = generateTotpSecret();
      const otpAuthUri = buildOtpAuthUri({
        issuer: 'ALSTORE Admin',
        accountEmail: admin.email,
        secretBase32: secret
      });
      const qrDataUrl = await QRCode.toDataURL(otpAuthUri, {
        width: 240,
        margin: 1
      });

      // Store pending secret separately so any currently active TOTP 2FA stays protected until confirmed
      db.prepare('UPDATE admin_users SET totp_pending_secret = ? WHERE id = ?').run(secret, admin.id);

      res.json({
        secretBase32: secret,
        otpAuthUri,
        qrDataUrl
      });
    }
  );

  router.post(
    '/admin/auth/totp/confirm',
    verifyCsrfAndOrigin,
    requireAdminAuth({ allowTotpEnrollment: true }),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const db = getDb();
      const code = String(req.body?.code || '').trim();
      const freshRow = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(admin.id) as AdminDbRow;
      const candidateSecret = freshRow.totp_pending_secret || freshRow.totp_secret;

      if (!candidateSecret) {
        res.status(400).json({ error: 'Silakan buat kode QR TOTP terlebih dahulu.' });
        return;
      }

      const check = verifyTotpCode(candidateSecret, code);
      if (!check.valid || check.matchedStep === null) {
        res.status(400).json({ error: 'Kode TOTP 6 digit tidak valid atau sudah kedaluwarsa.' });
        return;
      }

      const wasEnabled = Number(freshRow.totp_enabled) === 1;
      db.prepare(`
        UPDATE admin_users
        SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = 1, totp_opted_out = 0, totp_last_step = ?
        WHERE id = ?
      `).run(candidateSecret, check.matchedStep, admin.id);

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'TOTP_ENABLED',
        targetType: 'admin_user',
        targetId: admin.id,
        details: wasEnabled
          ? 'Perangkat autentikator TOTP 2FA diperbarui melalui Pengaturan Keamanan'
          : 'Aktivasi verifikasi dua langkah TOTP 2FA berhasil',
        ipAddress: getClientIp(req)
      });

      const updated = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(admin.id) as AdminDbRow;
      res.json({
        ok: true,
        admin: toPublicAdminUser(updated)
      });
    }
  );

  router.post(
    '/admin/auth/totp/disable',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    async (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      if (admin.role !== 'OWNER') {
        res.status(403).json({
          error: 'Hanya Owner yang dapat menonaktifkan verifikasi dua langkah TOTP 2FA.'
        });
        return;
      }

      const db = getDb();
      const freshRow = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(admin.id) as AdminDbRow;
      if (Number(freshRow.totp_enabled) !== 1 || !freshRow.totp_secret) {
        res.status(400).json({ error: 'Verifikasi dua langkah TOTP 2FA sudah dalam status nonaktif.' });
        return;
      }

      const authMethod = req.adminSessionAuthMethod || 'password';
      const currentPassword = String(req.body?.currentPassword || '');
      const totpCode = String(req.body?.totpCode || '').trim();

      if (authMethod !== 'firebase_sso') {
        const pwdValid = await verifyPasswordConstantTime(currentPassword, freshRow.password_hash);
        if (!pwdValid) {
          await recordIntrusionAndEnforce({
            req,
            targetAccount: freshRow.email,
            attemptType: 'step_up_fail',
            outcome: 'Gagal menonaktifkan TOTP 2FA (sandi salah)'
          });
          res.status(401).json({ error: 'Sandi saat ini atau kode TOTP 6 digit tidak valid.' });
          return;
        }
      }

      const totpCheck = verifyTotpCode(freshRow.totp_secret, totpCode, {
        lastUsedStep: freshRow.totp_last_step !== null ? Number(freshRow.totp_last_step) : null
      });
      if (!totpCheck.valid || totpCheck.matchedStep === null) {
        await recordIntrusionAndEnforce({
          req,
          targetAccount: freshRow.email,
          attemptType: 'step_up_fail',
          outcome: 'Gagal menonaktifkan TOTP 2FA (kode TOTP tidak valid)'
        });
        res.status(401).json({
          error:
            authMethod === 'firebase_sso'
              ? 'Kode TOTP 6 digit tidak valid atau sudah digunakan.'
              : 'Sandi saat ini atau kode TOTP 6 digit tidak valid.'
        });
        return;
      }

      db.prepare(`
        UPDATE admin_users
        SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = 0, totp_opted_out = 1, totp_last_step = ?
        WHERE id = ?
      `).run(totpCheck.matchedStep, admin.id);

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'TOTP_DISABLED',
        targetType: 'admin_user',
        targetId: admin.id,
        details: 'Owner menonaktifkan verifikasi dua langkah TOTP 2FA melalui Pengaturan Keamanan',
        ipAddress: getClientIp(req)
      });

      const updated = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(admin.id) as AdminDbRow;
      res.json({
        ok: true,
        admin: toPublicAdminUser(updated)
      });
    }
  );

  // Change Own Password (clears "Sandi lemah, segera ganti" warning banner once strong)
  router.post(
    '/admin/auth/change-password',
    verifyCsrfAndOrigin,
    requireAdminAuth({ allowTotpEnrollment: true }),
    async (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');

      const currentValid = await verifyPasswordConstantTime(currentPassword, admin.password_hash);
      if (!currentValid) {
        res.status(401).json({ error: 'Sandi saat ini salah.' });
        return;
      }

      const strength = assessPasswordStrength(newPassword);
      if (strength.isWeak) {
        res.status(400).json({
          error: `Sandi baru masih terlalu lemah: ${strength.reasons.join(', ')}.`
        });
        return;
      }

      const newHash = await hashPasswordArgon2id(newPassword);
      const db = getDb();
      db.prepare(
        'UPDATE admin_users SET password_hash = ?, is_weak_password = 0, must_change_password = 0 WHERE id = ?'
      ).run(newHash, admin.id);

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'PASSWORD_CHANGED',
        targetType: 'admin_user',
        targetId: admin.id,
        details: 'Sandi berhasil diperbarui dengan sandi kuat (Argon2id)',
        ipAddress: getClientIp(req)
      });

      const updated = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(admin.id) as AdminDbRow;
      res.json({ ok: true, admin: toPublicAdminUser(updated) });
    }
  );

  // =========================================================================
  // 4. PROTECTED ADMIN DASHBOARD & OVERVIEW
  // =========================================================================
  router.get('/admin/overview', requireAdminAuth(), requirePermission('dashboard:view'), (req: AdminAuthedRequest, res: Response) => {
    const db = getDb();
    const admin = req.adminUser!;
    const nowMs = Date.now();
    const startOfToday = new Date(nowMs);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const revenueRow = db
      .prepare("SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as cnt FROM orders WHERE status = 'completed'")
      .get() as { total: number; cnt: number };
    const todayCompletedRow = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as cnt
         FROM orders
         WHERE status = 'completed' AND COALESCE(confirmed_at_ms, created_at_ms) >= ?`
      )
      .get(startOfTodayMs) as { total: number; cnt: number };
    const waitingRow = db
      .prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'waiting_verification'")
      .get() as { cnt: number };
    const pendingPaymentRow = db
      .prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'pending'")
      .get() as { cnt: number };
    const pendingCasesRow = db
      .prepare("SELECT COUNT(*) as cnt FROM violation_cases WHERE status IN ('pending_review', 'approved_unpaid')")
      .get() as { cnt: number };
    const blockedCountRow = db
      .prepare('SELECT COUNT(*) as cnt FROM ip_device_blocks WHERE active = 1')
      .get() as { cnt: number };

    const recentOrders = (
      db.prepare('SELECT * FROM orders ORDER BY created_at_ms DESC LIMIT 6').all() as Record<string, unknown>[]
    ).map(mapOrderRow);

    const ownerAlerts =
      admin.role === 'OWNER'
        ? (
            db
              .prepare('SELECT * FROM owner_alerts ORDER BY acknowledged ASC, created_at_ms DESC LIMIT 10')
              .all() as Record<string, unknown>[]
          ).map(mapOwnerAlertRow)
        : Number(waitingRow.cnt) > 0
          ? [
              {
                id: 'ops-waiting-verification',
                createdAtMs: nowMs,
                severity: 'warning' as const,
                title: `${Number(waitingRow.cnt)} Pesanan Menunggu Verifikasi`,
                message: 'Periksa bukti pembayaran pada menu Transaksi untuk segera memproses top-up pelanggan.',
                channel: 'Operasional',
                acknowledged: false
              }
            ]
          : [];

    const unacknowledgedAlertsCount = ownerAlerts.filter((al) => !al.acknowledged).length;
    const criticalAlertsCount = ownerAlerts.filter(
      (al) => !al.acknowledged && al.severity === 'critical'
    ).length;

    res.json({
      metrics: {
        successfulTransactionsToday: Number(todayCompletedRow.cnt),
        revenueTodayIdr: Number(todayCompletedRow.total),
        confirmedRevenueIdr: Number(revenueRow.total),
        confirmedOrdersCount: Number(revenueRow.cnt),
        waitingVerificationCount: Number(waitingRow.cnt),
        pendingPaymentCount: Number(pendingPaymentRow.cnt),
        activeViolationCasesCount: Number(pendingCasesRow.cnt),
        activeBlockedDevicesCount: Number(blockedCountRow.cnt),
        unacknowledgedAlertsCount,
        criticalAlertsCount
      },
      recentOrders,
      ownerAlerts,
      generatedAtMs: nowMs
    });
  });

  router.post(
    '/admin/alerts/:id/ack',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('violations:manage'),
    (req: AdminAuthedRequest, res: Response) => {
      const db = getDb();
      db.prepare('UPDATE owner_alerts SET acknowledged = 1 WHERE id = ?').run(String(req.params.id));
      res.json({ ok: true });
    }
  );

  // =========================================================================
  // 5. ORDERS & BULK CONFIRMATION (Bulk Confirm requires Step-Up Password + TOTP)
  // =========================================================================
  router.get('/admin/orders', requireAdminAuth(), requirePermission('orders:view'), (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM orders ORDER BY created_at_ms DESC LIMIT 200').all() as Record<
      string,
      unknown
    >[];
    res.json({ orders: rows.map(mapOrderRow) });
  });

  function resolveViolationCaseIfPaid(invoiceId: string, actorName: string): void {
    const db = getDb();
    const ord = db
      .prepare('SELECT invoice_type, violation_case_id, owner_uid FROM orders WHERE invoice_id = ?')
      .get(invoiceId) as { invoice_type: string; violation_case_id: string | null; owner_uid: string | null } | undefined;

    if (ord && ord.invoice_type === 'violation_fee' && ord.violation_case_id) {
      const now = Date.now();
      db.prepare(
        `UPDATE violation_cases SET status = 'resolved_paid', updated_at_ms = ?, review_note = COALESCE(review_note, '') || ' · Lunas & akun dipulihkan' WHERE id = ?`
      ).run(now, ord.violation_case_id);

      if (ord.owner_uid) {
        db.prepare('DELETE FROM customer_suspensions WHERE customer_uid = ?').run(ord.owner_uid);
        db.prepare(
          'UPDATE ip_device_blocks SET active = 0, unblocked_by = ?, unblocked_at_ms = ? WHERE customer_uid = ? AND active = 1'
        ).run(`${actorName} (Pemulihan Otomatis Lunas)`, now, ord.owner_uid);
      }
    }
  }

  router.post(
    '/admin/orders/:invoiceId/status',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('orders:confirm'),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const invoiceId = String(req.params.invoiceId || '').trim();
      const nextStatus = String(req.body?.status || '') as OrderStatus;
      if (!['pending', 'waiting_verification', 'completed', 'expired'].includes(nextStatus)) {
        res.status(400).json({ error: 'Status pesanan tidak valid.' });
        return;
      }

      const db = getDb();
      const now = Date.now();
      const result = db
        .prepare('UPDATE orders SET status = ?, confirmed_by_name = ?, confirmed_at_ms = ? WHERE invoice_id = ?')
        .run(nextStatus, admin.full_name, now, invoiceId);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Invoice tidak ditemukan.' });
        return;
      }

      if (nextStatus === 'completed') {
        resolveViolationCaseIfPaid(invoiceId, admin.full_name);
      }

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'ORDER_STATUS_UPDATE',
        targetType: 'order',
        targetId: invoiceId,
        details: `Ubah status pesanan menjadi ${nextStatus}`,
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true });
    }
  );

  // Sensitive Action: Bulk Confirm requires Step-Up Password + TOTP
  router.post(
    '/admin/orders/bulk-confirm',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('orders:bulk_confirm'),
    async (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const invoiceIds = Array.isArray(req.body?.invoiceIds)
        ? req.body.invoiceIds.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];

      if (invoiceIds.length === 0) {
        res.status(400).json({ error: 'Pilih minimal satu transaksi untuk konfirmasi massal.' });
        return;
      }

      const verified = await verifyStepUpCredentials(
        req,
        res,
        req.body?.stepUpPassword,
        req.body?.stepUpTotpCode,
        'Konfirmasi Massal Transaksi'
      );
      if (!verified) return;

      const db = getDb();
      const now = Date.now();
      const stmt = db.prepare(
        `UPDATE orders SET status = 'completed', confirmed_by_name = ?, confirmed_at_ms = ? WHERE invoice_id = ? AND status != 'completed'`
      );

      let confirmedCount = 0;
      for (const invId of invoiceIds) {
        const r = stmt.run(admin.full_name, now, invId);
        if (Number(r.changes) > 0) {
          confirmedCount += 1;
          resolveViolationCaseIfPaid(invId, admin.full_name);
        }
      }

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'ORDER_BULK_CONFIRM',
        targetType: 'order_batch',
        targetId: `${confirmedCount}_orders`,
        details: `Konfirmasi massal ${confirmedCount} transaksi (Step-Up Sandi + TOTP): ${invoiceIds.join(', ')}`,
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true, confirmedCount });
    }
  );

  // =========================================================================
  // 6. BANNERS MANAGEMENT (OWNER + ADMIN)
  // =========================================================================
  router.get('/admin/banners', requireAdminAuth(), requirePermission('banners:manage'), (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM banners ORDER BY sort_order ASC, updated_at_ms DESC').all() as Record<
      string,
      unknown
    >[];
    res.json({ banners: rows.map(mapBannerRow) });
  });

  router.post(
    '/admin/banners',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('banners:manage'),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const body = req.body || {};
      const title = String(body.title || '').trim();
      const image = String(body.image || '').trim();
      if (!title || !isSafeImageUrl(image)) {
        res.status(400).json({
          error: 'Judul banner dan URL gambar valid (/assets/... atau https://...) wajib diisi.'
        });
        return;
      }

      const db = getDb();
      const id = body.id ? String(body.id).trim() : `banner_${generateSecureTokenHex(6)}`;
      const now = Date.now();
      db.prepare(`
        INSERT OR REPLACE INTO banners (
          id, kicker, title, subtitle, cta_label, target_game_id, image, image_position,
          highlight_note, is_active, sort_order, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        String(body.kicker || 'Promo ALSTORE').slice(0, 80),
        title.slice(0, 140),
        String(body.subtitle || '').slice(0, 280),
        String(body.ctaLabel || 'Top-Up Sekarang').slice(0, 40),
        String(body.targetGameId || 'mlbb').slice(0, 40),
        image,
        String(body.imagePosition || 'center center').slice(0, 40),
        String(body.highlightNote || 'Proses 24/7').slice(0, 80),
        body.isActive === false ? 0 : 1,
        Math.round(Number(body.sortOrder) || 0),
        now
      );

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'BANNER_SAVED',
        targetType: 'banner',
        targetId: id,
        details: `Menyimpan banner promo "${title}"`,
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true, id });
    }
  );

  router.delete(
    '/admin/banners/:id',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('banners:manage'),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const id = String(req.params.id);
      const db = getDb();
      db.prepare('DELETE FROM banners WHERE id = ?').run(id);
      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'BANNER_DELETED',
        targetType: 'banner',
        targetId: id,
        details: `Menghapus banner promo ${id}`,
        ipAddress: getClientIp(req)
      });
      res.json({ ok: true });
    }
  );

  // =========================================================================
  // 7. PAYOUT ACCOUNTS & FINANCE (Modify requires OWNER + Step-Up Password + TOTP)
  // =========================================================================
  router.get(
    '/admin/payout-accounts',
    requireAdminAuth(),
    requirePermission('payout_accounts:view'),
    (_req, res) => {
      const db = getDb();
      const accounts = (
        db.prepare('SELECT * FROM payout_accounts ORDER BY is_primary DESC, updated_at_ms DESC').all() as Record<
          string,
          unknown
        >[]
      ).map(mapPayoutAccountRow);

      const methodBreakdown = db
        .prepare(
          `SELECT payment_method_name as methodName, COUNT(*) as ordersCount, COALESCE(SUM(total_amount), 0) as totalIdr
           FROM orders WHERE status = 'completed' GROUP BY payment_method_name ORDER BY totalIdr DESC`
        )
        .all();

      res.json({ accounts, methodBreakdown });
    }
  );

  router.post(
    '/admin/payout-accounts',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('payout_accounts:manage'),
    async (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const verified = await verifyStepUpCredentials(
        req,
        res,
        req.body?.stepUpPassword,
        req.body?.stepUpTotpCode,
        'Ubah Rekening Pencairan'
      );
      if (!verified) return;

      const providerType = String(req.body?.providerType || 'BANK').toUpperCase();
      if (!['BANK', 'EWALLET', 'QRIS'].includes(providerType)) {
        res.status(400).json({ error: 'Jenis rekening tidak valid.' });
        return;
      }

      const providerName = String(req.body?.providerName || '').trim();
      const accountNumber = String(req.body?.accountNumber || '').trim();
      const accountHolder = String(req.body?.accountHolder || '').trim();
      const isPrimary = Boolean(req.body?.isPrimary);

      if (!providerName || !accountNumber || !accountHolder) {
        res.status(400).json({ error: 'Nama bank/kanal, nomor rekening, dan atas nama wajib diisi.' });
        return;
      }

      const db = getDb();
      const now = Date.now();
      const id = req.body?.id ? String(req.body.id).trim() : `payacc_${generateSecureTokenHex(6)}`;

      if (isPrimary) {
        db.prepare('UPDATE payout_accounts SET is_primary = 0').run();
      }

      db.prepare(`
        INSERT OR REPLACE INTO payout_accounts (
          id, provider_type, provider_name, account_number, account_holder, is_primary, updated_at_ms, updated_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, providerType, providerName, accountNumber, accountHolder, isPrimary ? 1 : 0, now, admin.full_name);

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'PAYOUT_ACCOUNT_SAVED',
        targetType: 'payout_account',
        targetId: id,
        details: `Menyimpan rekening ${providerName} (${accountNumber} a.n. ${accountHolder}) [Step-Up Sandi + TOTP]`,
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true, id });
    }
  );

  // =========================================================================
  // 8. PAYROLL (KEUANGAN prepares draft; ONLY OWNER disburses with Step-Up Sandi + TOTP)
  // =========================================================================
  router.get('/admin/payroll', requireAdminAuth(), requirePermission('payroll:view'), (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM payroll_items ORDER BY prepared_at_ms DESC').all() as Record<
      string,
      unknown
    >[];
    res.json({ items: rows.map(mapPayrollRow) });
  });

  router.post(
    '/admin/payroll',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('payroll:prepare'),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const periodLabel = String(req.body?.periodLabel || '').trim();
      const employeeName = String(req.body?.employeeName || '').trim();
      const employeeRole = String(req.body?.employeeRole || 'ADMIN').toUpperCase() as AdminRole;
      const bankLabel = String(req.body?.bankLabel || '').trim();
      const accountNumber = String(req.body?.accountNumber || '').trim();
      const amountIdr = Math.round(Number(req.body?.amountIdr) || 0);
      const note = String(req.body?.note || '').trim().slice(0, 240);

      if (!periodLabel || !employeeName || !bankLabel || !accountNumber || amountIdr <= 0) {
        res.status(400).json({ error: 'Lengkapi seluruh data gaji karyawan dengan nominal valid.' });
        return;
      }

      if (!['OWNER', 'ADMIN', 'KEUANGAN'].includes(employeeRole)) {
        res.status(400).json({ error: 'Peran karyawan tidak valid.' });
        return;
      }

      const db = getDb();
      const id = `pay_${generateSecureTokenHex(6)}`;
      const now = Date.now();
      db.prepare(`
        INSERT INTO payroll_items (
          id, period_label, employee_name, employee_role, bank_label, account_number,
          amount_idr, note, status, prepared_by_id, prepared_by_name, prepared_at_ms,
          disbursed_by_id, disbursed_by_name, disbursed_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, NULL, NULL, NULL)
      `).run(
        id,
        periodLabel,
        employeeName,
        employeeRole,
        bankLabel,
        accountNumber,
        amountIdr,
        note,
        admin.id,
        admin.full_name,
        now
      );

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'PAYROLL_DRAFT_CREATED',
        targetType: 'payroll',
        targetId: id,
        details: `Menyiapkan draf gaji ${employeeName} (${periodLabel}) sebesar Rp ${amountIdr.toLocaleString('id-ID')}`,
        ipAddress: getClientIp(req)
      });

      res.status(201).json({ ok: true, id });
    }
  );

  // Sensitive Action: Disburse Payroll — STRICTLY OWNER + Step-Up Password + TOTP
  router.post(
    '/admin/payroll/:id/disburse',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('payroll:disburse'),
    async (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const id = String(req.params.id);

      const verified = await verifyStepUpCredentials(
        req,
        res,
        req.body?.stepUpPassword,
        req.body?.stepUpTotpCode,
        'Pencairan Gaji Karyawan'
      );
      if (!verified) return;

      const db = getDb();
      const item = db.prepare('SELECT * FROM payroll_items WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!item) {
        res.status(404).json({ error: 'Data gaji tidak ditemukan.' });
        return;
      }
      if (String(item.status) === 'DISBURSED') {
        res.status(400).json({ error: 'Gaji ini sudah dicairkan sebelumnya.' });
        return;
      }

      const now = Date.now();
      db.prepare(
        `UPDATE payroll_items SET status = 'DISBURSED', disbursed_by_id = ?, disbursed_by_name = ?, disbursed_at_ms = ? WHERE id = ?`
      ).run(admin.id, admin.full_name, now, id);

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'PAYROLL_DISBURSED',
        targetType: 'payroll',
        targetId: id,
        details: `Mencairkan gaji ${String(item.employee_name)} sebesar Rp ${Number(item.amount_idr).toLocaleString('id-ID')} [Step-Up Sandi + TOTP]`,
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true });
    }
  );

  // =========================================================================
  // 9. ACCESS VIOLATION CASES (Rp90.000 Customer Review — OWNER ONLY)
  // =========================================================================
  router.get(
    '/admin/violations',
    requireAdminAuth(),
    requirePermission('violations:manage'),
    (_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM violation_cases ORDER BY created_at_ms DESC').all() as Record<
        string,
        unknown
      >[];
      res.json({
        cases: rows.map(mapViolationCaseRow),
        defaultViolationFeeIdr: getViolationFeeSetting()
      });
    }
  );

  router.post(
    '/admin/violations/:id/review',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('violations:manage'),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const caseId = String(req.params.id);
      const decision = String(req.body?.decision || '');
      const reviewNote = String(req.body?.reviewNote || '').trim().slice(0, 240);

      if (!['approve', 'pardon', 'cancel'].includes(decision)) {
        res.status(400).json({ error: 'Keputusan tinjauan tidak valid (approve, pardon, cancel).' });
        return;
      }

      const db = getDb();
      const row = db.prepare('SELECT * FROM violation_cases WHERE id = ?').get(caseId) as
        | Record<string, unknown>
        | undefined;

      if (!row) {
        res.status(404).json({ error: 'Kasus pelanggaran tidak ditemukan.' });
        return;
      }

      const violation = mapViolationCaseRow(row);
      const now = Date.now();

      if (decision === 'approve') {
        if (!violation.isRegisteredCustomer || !violation.billable || !violation.customerUid) {
          res.status(400).json({
            error: 'Pengunjung anonim tidak dapat ditagih biaya pelanggaran. Hanya akun pelanggan terdaftar yang dapat ditagih.'
          });
          return;
        }

        const feeAmount = violation.feeAmountIdr > 0 ? violation.feeAmountIdr : getViolationFeeSetting();
        const invoiceId = `ALS-FEE-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomInt(1000, 9999)}`;

        // Generate real invoice routed through regular ALSTORE checkout (QRIS)
        db.prepare(`
          INSERT INTO orders (
            invoice_id, invoice_type, owner_uid, customer_email, game_id, game_name, item_name,
            account_id, zone_id, whatsapp, payment_method_id, payment_method_name,
            base_price, admin_fee, unique_code, total_amount, status, proof_file_name,
            created_at_ms, expires_at_ms, confirmed_by_name, confirmed_at_ms, violation_case_id
          ) VALUES (?, 'violation_fee', ?, ?, 'alstore-security', 'ALSTORE Pemulihan Akun', ?, ?, '', '', 'qris', 'QRIS (Semua E-Wallet & M-Banking)', ?, 0, 0, ?, 'pending', '', ?, ?, NULL, NULL, ?)
        `).run(
          invoiceId,
          violation.customerUid,
          violation.customerEmail,
          `Biaya Pelanggaran Akses (${caseId})`,
          violation.customerEmail || violation.customerUid,
          feeAmount,
          feeAmount,
          now,
          now + 24 * 60 * 60 * 1000,
          caseId
        );

        db.prepare(`
          UPDATE violation_cases
          SET status = 'approved_unpaid', fee_amount_idr = ?, invoice_id = ?, reviewed_by_name = ?, reviewed_at_ms = ?, review_note = ?, updated_at_ms = ?
          WHERE id = ?
        `).run(
          feeAmount,
          invoiceId,
          admin.full_name,
          now,
          reviewNote || `Disetujui Owner. Tagihan ${invoiceId} dibuat.`,
          now,
          caseId
        );

        db.prepare(`
          INSERT OR REPLACE INTO customer_suspensions (
            customer_uid, customer_email, case_id, status, fee_amount_idr, invoice_id, updated_at_ms
          ) VALUES (?, ?, ?, 'approved_unpaid', ?, ?, ?)
        `).run(
          violation.customerUid,
          violation.customerEmail || violation.customerUid,
          caseId,
          feeAmount,
          invoiceId,
          now
        );

        writeAuditLog({
          actorId: admin.id,
          actorName: admin.full_name,
          actorRole: admin.role,
          action: 'VIOLATION_APPROVED_BILLING',
          targetType: 'violation_case',
          targetId: caseId,
          details: `Menyetujui kasus ${caseId} dan membuat tagihan ${invoiceId} sebesar Rp ${feeAmount.toLocaleString('id-ID')} untuk ${violation.customerEmail}`,
          ipAddress: getClientIp(req)
        });

        res.json({ ok: true, status: 'approved_unpaid', invoiceId });
        return;
      }

      // Pardon or Cancel -> Restore customer account & unblock IP/device
      const nextStatus = decision === 'pardon' ? 'pardoned' : 'cancelled';
      db.prepare(`
        UPDATE violation_cases
        SET status = ?, reviewed_by_name = ?, reviewed_at_ms = ?, review_note = ?, updated_at_ms = ?
        WHERE id = ?
      `).run(
        nextStatus,
        admin.full_name,
        now,
        reviewNote || (decision === 'pardon' ? 'Diampuni oleh Owner.' : 'Kasus dibatalkan oleh Owner.'),
        now,
        caseId
      );

      if (violation.customerUid) {
        db.prepare('DELETE FROM customer_suspensions WHERE customer_uid = ?').run(violation.customerUid);
      }
      db.prepare(
        'UPDATE ip_device_blocks SET active = 0, unblocked_by = ?, unblocked_at_ms = ? WHERE (ip_address = ? OR device_hash = ?) AND active = 1'
      ).run(admin.full_name, now, violation.ipAddress, violation.deviceHash);

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: decision === 'pardon' ? 'VIOLATION_PARDONED' : 'VIOLATION_CANCELLED',
        targetType: 'violation_case',
        targetId: caseId,
        details: `${decision === 'pardon' ? 'Mengampuni' : 'Membatalkan'} kasus ${caseId} & memulihkan akses`,
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true, status: nextStatus });
    }
  );

  // =========================================================================
  // 10. STAFF MANAGEMENT (OWNER ONLY — Individual accounts, never shared passwords)
  // =========================================================================
  router.get('/admin/staff', requireAdminAuth(), requirePermission('staff:manage'), (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM admin_users ORDER BY created_at_ms ASC').all() as AdminDbRow[];
    res.json({ staff: rows.map(toPublicAdminUser) });
  });

  router.post(
    '/admin/staff',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('staff:manage'),
    async (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const email = String(req.body?.email || '').trim().toLowerCase();
      const fullName = String(req.body?.fullName || '').trim().slice(0, 80);
      const role = String(req.body?.role || '').toUpperCase() as AdminRole;
      const initialPassword = String(req.body?.password || '');

      if (!email || !email.includes('@') || !fullName) {
        res.status(400).json({ error: 'Nama lengkap dan email karyawan wajib diisi.' });
        return;
      }

      if (!['ADMIN', 'KEUANGAN'].includes(role)) {
        res.status(400).json({ error: 'Peran staf hanya boleh ADMIN atau KEUANGAN.' });
        return;
      }

      const strength = assessPasswordStrength(initialPassword);
      if (strength.isWeak) {
        res.status(400).json({
          error: `Sandi akun staf harus kuat: ${strength.reasons.join(', ')}.`
        });
        return;
      }

      const db = getDb();
      const existing = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email);
      if (existing) {
        res.status(409).json({ error: 'Email tersebut sudah terdaftar sebagai staf admin.' });
        return;
      }

      const hash = await hashPasswordArgon2id(initialPassword);
      const staffId = `adm_${generateSecureTokenHex(8)}`;
      const now = Date.now();

      db.prepare(`
        INSERT INTO admin_users (
          id, email, full_name, role, password_hash, is_active,
          is_weak_password, must_change_password, totp_secret, totp_enabled,
          totp_last_step, created_at_ms, last_login_at_ms
        ) VALUES (?, ?, ?, ?, ?, 1, 0, 0, NULL, 0, NULL, ?, NULL)
      `).run(staffId, email, fullName, role, hash, now);

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'STAFF_CREATED',
        targetType: 'admin_user',
        targetId: staffId,
        details: `Membuat akun staf ${fullName} (${email}) dengan peran ${role}`,
        ipAddress: getClientIp(req)
      });

      const created = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(staffId) as AdminDbRow;
      res.status(201).json({ ok: true, staff: toPublicAdminUser(created) });
    }
  );

  router.patch(
    '/admin/staff/:id/status',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('staff:manage'),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const targetId = String(req.params.id);
      const isActive = Boolean(req.body?.isActive);

      if (targetId === admin.id) {
        res.status(400).json({ error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' });
        return;
      }

      const db = getDb();
      db.prepare('UPDATE admin_users SET is_active = ? WHERE id = ? AND role != \'OWNER\'').run(
        isActive ? 1 : 0,
        targetId
      );
      if (!isActive) {
        db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(targetId);
      }

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
        targetType: 'admin_user',
        targetId,
        details: isActive ? 'Mengaktifkan akun staf' : 'Menonaktifkan akun staf & mencabut sesi aktif',
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true });
    }
  );

  // =========================================================================
  // 11. SECURITY LOGS, IP BLOCKS, AUDIT LOGS & OWNER SETTINGS
  // =========================================================================
  router.get(
    '/admin/security-logs',
    requireAdminAuth(),
    requirePermission('security_logs:view'),
    (_req, res) => {
      const db = getDb();
      const attempts = (
        db.prepare('SELECT * FROM login_attempts ORDER BY created_at_ms DESC LIMIT 120').all() as Record<
          string,
          unknown
        >[]
      ).map(mapAttemptRow);

      const blocks = (
        db.prepare('SELECT * FROM ip_device_blocks ORDER BY blocked_at_ms DESC LIMIT 80').all() as Record<
          string,
          unknown
        >[]
      ).map(mapBlockRow);

      const auditLogs = (
        db
          .prepare(
            `SELECT a.*, u.email AS actor_email
             FROM audit_logs a
             LEFT JOIN admin_users u ON u.id = a.actor_id
             ORDER BY a.created_at_ms DESC
             LIMIT 150`
          )
          .all() as Record<string, unknown>[]
      ).map(mapAuditLogRow);

      res.json({ attempts, blocks, auditLogs });
    }
  );

  // =========================================================================
  // 11B. ACTIVITY LOGS (Searchable, Filterable Audit Trail — OWNER ONLY)
  // =========================================================================
  router.get(
    '/admin/activity-logs',
    requireAdminAuth(),
    requirePermission('activity_logs:view'),
    (req: AdminAuthedRequest, res: Response) => {
      const db = getDb();
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
      const roleParam = typeof req.query.role === 'string' ? req.query.role.trim().toUpperCase() : 'ALL';
      const actionParam = typeof req.query.action === 'string' ? req.query.action.trim().toUpperCase().slice(0, 64) : 'ALL';
      const actorIdParam = typeof req.query.actorId === 'string' ? req.query.actorId.trim().slice(0, 80) : 'ALL';
      const fromMsParam = Number(req.query.fromMs);
      const toMsParam = Number(req.query.toMs);
      const sortParam = req.query.sort === 'oldest' ? 'ASC' : 'DESC';
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(500, Math.round(limitRaw))) : 300;

      const conditions: string[] = [];
      const params: Array<string | number> = [];

      if (roleParam && roleParam !== 'ALL' && ['OWNER', 'ADMIN', 'KEUANGAN'].includes(roleParam)) {
        conditions.push('a.actor_role = ?');
        params.push(roleParam);
      }

      if (actionParam && actionParam !== 'ALL') {
        conditions.push('a.action = ?');
        params.push(actionParam);
      }

      if (actorIdParam && actorIdParam !== 'ALL') {
        conditions.push('a.actor_id = ?');
        params.push(actorIdParam);
      }

      if (Number.isFinite(fromMsParam) && fromMsParam > 0) {
        conditions.push('a.created_at_ms >= ?');
        params.push(Math.round(fromMsParam));
      }

      if (Number.isFinite(toMsParam) && toMsParam > 0) {
        conditions.push('a.created_at_ms <= ?');
        params.push(Math.round(toMsParam));
      }

      if (search) {
        const escaped = search.replace(/[%_\\]/g, '\\$&');
        const likePattern = `%${escaped}%`;
        conditions.push(
          `(a.actor_name LIKE ? ESCAPE '\\' OR COALESCE(u.email, '') LIKE ? ESCAPE '\\' OR a.action LIKE ? ESCAPE '\\' OR a.target_id LIKE ? ESCAPE '\\' OR a.details LIKE ? ESCAPE '\\' OR a.ip_address LIKE ? ESCAPE '\\')`
        );
        params.push(likePattern, likePattern, likePattern, likePattern, likePattern, likePattern);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db
        .prepare(
          `SELECT a.*, u.email AS actor_email
           FROM audit_logs a
           LEFT JOIN admin_users u ON u.id = a.actor_id
           ${whereClause}
           ORDER BY a.created_at_ms ${sortParam}
           LIMIT ?`
        )
        .all(...params, limit) as Record<string, unknown>[];

      const totalRow = db
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM audit_logs a
           LEFT JOIN admin_users u ON u.id = a.actor_id
           ${whereClause}`
        )
        .get(...params) as { cnt: number };

      res.json({
        logs: rows.map(mapAuditLogRow),
        totalCount: Number(totalRow.cnt)
      });
    }
  );

  router.post(
    '/admin/blocks/:id/unblock',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('violations:manage'),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const blockId = String(req.params.id);
      const db = getDb();
      const now = Date.now();
      const blockRow = db.prepare('SELECT ip_address, device_hash FROM ip_device_blocks WHERE id = ?').get(blockId) as
        | { ip_address: string; device_hash: string }
        | undefined;

      if (!blockRow) {
        res.status(404).json({ error: 'Data blokir tidak ditemukan.' });
        return;
      }

      db.prepare('UPDATE ip_device_blocks SET active = 0, unblocked_by = ?, unblocked_at_ms = ? WHERE id = ?').run(
        admin.full_name,
        now,
        blockId
      );
      db.prepare('DELETE FROM login_lockouts WHERE ip_address = ? OR device_hash = ?').run(
        blockRow.ip_address,
        blockRow.device_hash
      );

      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'IP_UNBLOCKED',
        targetType: 'ip_block',
        targetId: blockId,
        details: `Membuka blokir IP ${blockRow.ip_address} (${blockRow.device_hash})`,
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true });
    }
  );

  router.get('/admin/settings', requireAdminAuth(), requirePermission('settings:manage'), (_req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT updated_at_ms FROM admin_settings WHERE key = ?').get('violation_fee_idr') as
      | { updated_at_ms: number }
      | undefined;

    res.json({
      settings: {
        violationFeeIdr: getViolationFeeSetting(),
        ownerAlertEmail: (process.env.OWNER_ALERT_EMAIL || '').trim(),
        telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_OWNER_CHAT_ID),
        turnstileConfigured: Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY),
        adminPathHint: 'Diatur melalui env ADMIN_PATH (noindex, disembunyikan dari publik)',
        updatedAtMs: row ? Number(row.updated_at_ms) : Date.now()
      }
    });
  });

  router.put(
    '/admin/settings',
    verifyCsrfAndOrigin,
    requireAdminAuth(),
    requirePermission('settings:manage'),
    (req: AdminAuthedRequest, res: Response) => {
      const admin = req.adminUser!;
      const rawFee = Number(req.body?.violationFeeIdr);
      if (!Number.isFinite(rawFee) || rawFee < 0 || rawFee > 100_000_000) {
        res.status(400).json({ error: 'Nominal biaya pelanggaran tidak valid.' });
        return;
      }

      const savedFee = setViolationFeeSetting(rawFee);
      writeAuditLog({
        actorId: admin.id,
        actorName: admin.full_name,
        actorRole: admin.role,
        action: 'SETTINGS_UPDATED',
        targetType: 'admin_settings',
        targetId: 'violation_fee_idr',
        details: `Mengubah nominal biaya pelanggaran akses menjadi Rp ${savedFee.toLocaleString('id-ID')}`,
        ipAddress: getClientIp(req)
      });

      res.json({ ok: true, violationFeeIdr: savedFee });
    }
  );

  return router;
}
