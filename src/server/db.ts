import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PROMO_BANNERS } from '../data/games';
import type {
  AdminBannerRecord,
  AdminRole,
  AdminUserPublic,
  AuditLogRecord,
  IpDeviceBlockRecord,
  LoginAttemptRecord,
  OwnerAlertRecord,
  PayoutAccountRecord,
  PayrollItemRecord,
  ViolationCaseRecord,
  ViolationCaseStatus
} from '../types/admin';
import type { OrderStatus, TopUpOrder } from '../types/store';
import { assessPasswordStrength, generateSecureTokenHex, hashPasswordArgon2id } from './password';
import { DEFAULT_VIOLATION_FEE_IDR } from './securityPolicy';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.resolve(DATA_DIR, 'alstore-admin.db');

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  dbInstance = db;
  initSchema(db);
  seedDefaultOperationalData(db);
  return db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('OWNER', 'ADMIN', 'KEUANGAN')),
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_weak_password INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      totp_secret TEXT,
      totp_pending_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      totp_opted_out INTEGER NOT NULL DEFAULT 0,
      totp_last_step INTEGER,
      created_at_ms INTEGER NOT NULL,
      last_login_at_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      device_hash TEXT NOT NULL,
      auth_method TEXT NOT NULL DEFAULT 'password',
      created_at_ms INTEGER NOT NULL,
      last_activity_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      created_at_ms INTEGER NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      device_hash TEXT NOT NULL,
      target_account TEXT NOT NULL,
      customer_uid TEXT,
      customer_email TEXT,
      attempt_type TEXT NOT NULL CHECK(attempt_type IN ('login_fail', 'login_success', 'blocked_path', 'step_up_fail')),
      outcome TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, created_at_ms);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_dev_time ON login_attempts(device_hash, created_at_ms);

    CREATE TABLE IF NOT EXISTS login_lockouts (
      scope_key TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      device_hash TEXT NOT NULL,
      locked_until_ms INTEGER NOT NULL,
      require_captcha INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ip_device_blocks (
      id TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      device_hash TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      reason TEXT NOT NULL,
      customer_uid TEXT,
      customer_email TEXT,
      blocked_at_ms INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      unblocked_by TEXT,
      unblocked_at_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS violation_cases (
      id TEXT PRIMARY KEY,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      is_registered_customer INTEGER NOT NULL,
      billable INTEGER NOT NULL,
      customer_uid TEXT,
      customer_email TEXT,
      customer_provider TEXT,
      ip_address TEXT NOT NULL,
      device_hash TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      trigger_reason TEXT NOT NULL,
      evidence_summary TEXT NOT NULL,
      fee_amount_idr INTEGER NOT NULL,
      status TEXT NOT NULL,
      invoice_id TEXT,
      reviewed_by_name TEXT,
      reviewed_at_ms INTEGER,
      review_note TEXT
    );

    CREATE TABLE IF NOT EXISTS customer_suspensions (
      customer_uid TEXT PRIMARY KEY,
      customer_email TEXT NOT NULL,
      case_id TEXT NOT NULL,
      status TEXT NOT NULL,
      fee_amount_idr INTEGER NOT NULL,
      invoice_id TEXT,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      invoice_id TEXT PRIMARY KEY,
      invoice_type TEXT NOT NULL DEFAULT 'topup',
      owner_uid TEXT,
      customer_email TEXT,
      game_id TEXT NOT NULL,
      game_name TEXT NOT NULL,
      item_name TEXT NOT NULL,
      account_id TEXT NOT NULL,
      zone_id TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      payment_method_id TEXT NOT NULL,
      payment_method_name TEXT NOT NULL,
      base_price INTEGER NOT NULL,
      admin_fee INTEGER NOT NULL,
      unique_code INTEGER NOT NULL,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'waiting_verification', 'completed', 'expired')),
      proof_file_name TEXT NOT NULL DEFAULT '',
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      confirmed_by_name TEXT,
      confirmed_at_ms INTEGER,
      violation_case_id TEXT
    );

    CREATE TABLE IF NOT EXISTS payout_accounts (
      id TEXT PRIMARY KEY,
      provider_type TEXT NOT NULL CHECK(provider_type IN ('BANK', 'EWALLET', 'QRIS')),
      provider_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      updated_at_ms INTEGER NOT NULL,
      updated_by_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_items (
      id TEXT PRIMARY KEY,
      period_label TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      employee_role TEXT NOT NULL CHECK(employee_role IN ('OWNER', 'ADMIN', 'KEUANGAN')),
      bank_label TEXT NOT NULL,
      account_number TEXT NOT NULL,
      amount_idr INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'DISBURSED')),
      prepared_by_id TEXT NOT NULL,
      prepared_by_name TEXT NOT NULL,
      prepared_at_ms INTEGER NOT NULL,
      disbursed_by_id TEXT,
      disbursed_by_name TEXT,
      disbursed_at_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      kicker TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      cta_label TEXT NOT NULL,
      target_game_id TEXT NOT NULL,
      image TEXT NOT NULL,
      image_position TEXT NOT NULL DEFAULT 'center center',
      highlight_note TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      created_at_ms INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_role ON audit_logs(action, actor_role);

    CREATE TABLE IF NOT EXISTS owner_alerts (
      id TEXT PRIMARY KEY,
      created_at_ms INTEGER NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('warning', 'critical')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      channel TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS captcha_challenges (
      challenge_id TEXT PRIMARY KEY,
      answer_hash TEXT NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      ip_address TEXT NOT NULL
    );
  `);

  // Safe migration for existing SQLite databases created prior to auth_method / TOTP modal columns
  const sessionCols = db.prepare('PRAGMA table_info(admin_sessions)').all() as Array<{ name: string }>;
  if (!sessionCols.some((c) => c.name === 'auth_method')) {
    db.exec("ALTER TABLE admin_sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'password';");
  }

  const userCols = db.prepare('PRAGMA table_info(admin_users)').all() as Array<{ name: string }>;
  if (!userCols.some((c) => c.name === 'totp_pending_secret')) {
    db.exec('ALTER TABLE admin_users ADD COLUMN totp_pending_secret TEXT;');
  }
  if (!userCols.some((c) => c.name === 'totp_opted_out')) {
    db.exec('ALTER TABLE admin_users ADD COLUMN totp_opted_out INTEGER NOT NULL DEFAULT 0;');
  }
}

function seedDefaultOperationalData(db: DatabaseSync): void {
  const now = Date.now();

  // Default settings
  const feeRow = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get('violation_fee_idr') as
    | { value: string }
    | undefined;
  if (!feeRow) {
    db.prepare('INSERT INTO admin_settings (key, value, updated_at_ms) VALUES (?, ?, ?)').run(
      'violation_fee_idr',
      String(DEFAULT_VIOLATION_FEE_IDR),
      now
    );
  }

  // Default banners from existing storefront data
  const bannerCount = db.prepare('SELECT COUNT(*) as cnt FROM banners').get() as { cnt: number };
  if (bannerCount.cnt === 0) {
    const insertBanner = db.prepare(`
      INSERT INTO banners (id, kicker, title, subtitle, cta_label, target_game_id, image, image_position, highlight_note, is_active, sort_order, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    PROMO_BANNERS.forEach((b, idx) => {
      insertBanner.run(
        b.id,
        b.kicker,
        b.title,
        b.subtitle,
        b.ctaLabel,
        b.targetGameId,
        b.image,
        b.imagePosition || 'center center',
        b.highlightNote,
        idx,
        now
      );
    });
  }

  // Default payout settlement accounts
  const payoutCount = db.prepare('SELECT COUNT(*) as cnt FROM payout_accounts').get() as { cnt: number };
  if (payoutCount.cnt === 0) {
    const insertPayout = db.prepare(`
      INSERT INTO payout_accounts (id, provider_type, provider_name, account_number, account_holder, is_primary, updated_at_ms, updated_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPayout.run(
      'payout-qris-main',
      'QRIS',
      'QRIS DANA Merchant (A01)',
      'NMID: ID1024360748064',
      'TOKO SEMBAKO EPEP',
      1,
      now,
      'Sistem Awal'
    );
    insertPayout.run(
      'payout-bca-main',
      'BANK',
      'Bank BCA',
      '8490-2214-89',
      'ALSTORE DIGITAL INDONESIA',
      0,
      now,
      'Sistem Awal'
    );
  }

  // Seed deterministic operational orders so admin transactions & bulk confirmation are immediately demonstrable
  const orderCount = db.prepare('SELECT COUNT(*) as cnt FROM orders').get() as { cnt: number };
  if (orderCount.cnt === 0) {
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        invoice_id, invoice_type, owner_uid, customer_email, game_id, game_name, item_name,
        account_id, zone_id, whatsapp, payment_method_id, payment_method_name,
        base_price, admin_fee, unique_code, total_amount, status, proof_file_name,
        created_at_ms, expires_at_ms, confirmed_by_name, confirmed_at_ms, violation_case_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertOrder.run(
      'ALS-20261121-01',
      'topup',
      'cust-seed-001',
      'bagas.pr@gmail.com',
      'mlbb',
      'Mobile Legends: Bang Bang',
      'Weekly Diamond Pass',
      '192837465',
      '2091',
      '081234567890',
      'qris',
      'QRIS (Semua E-Wallet & M-Banking)',
      26800,
      0,
      142,
      26942,
      'waiting_verification',
      'bukti-qris-wdp.jpg',
      now - 8 * 60 * 1000,
      now + 7 * 60 * 1000,
      null,
      null,
      null
    );

    insertOrder.run(
      'ALS-20261121-02',
      'topup',
      'cust-seed-002',
      'nadia.val@gmail.com',
      'valorant',
      'Valorant',
      '1.125 Valorant Points',
      'NadiaGG#ID1',
      'Indonesia',
      '085611223344',
      'qris',
      'QRIS (Semua E-Wallet & M-Banking)',
      115000,
      0,
      308,
      115308,
      'waiting_verification',
      'struk-dana-vp.png',
      now - 14 * 60 * 1000,
      now + 10 * 60 * 1000,
      null,
      null,
      null
    );

    insertOrder.run(
      'ALS-20261121-03',
      'topup',
      'cust-seed-003',
      'dimas.ff@gmail.com',
      'ff',
      'Free Fire',
      '720 Diamonds',
      '881920341',
      '',
      '087899887766',
      'dana',
      'DANA',
      91500,
      1000,
      211,
      92711,
      'completed',
      'transfer-dana-ff.jpg',
      now - 45 * 60 * 1000,
      now - 30 * 60 * 1000,
      'Owner ALSTORE',
      now - 41 * 60 * 1000,
      null
    );

    insertOrder.run(
      'ALS-20261121-04',
      'topup',
      null,
      null,
      'pb',
      'Point Blank',
      '2.400 PB Cash',
      'PB_Trooper99',
      '',
      '089612341234',
      'qris',
      'QRIS (Semua E-Wallet & M-Banking)',
      19500,
      0,
      119,
      19619,
      'pending',
      '',
      now - 3 * 60 * 1000,
      now + 12 * 60 * 1000,
      null,
      null,
      null
    );
  }

  // Seed payroll drafts prepared by Finance so Owner disbursement with Step-Up 2FA can be tested
  const payrollCount = db.prepare('SELECT COUNT(*) as cnt FROM payroll_items').get() as { cnt: number };
  if (payrollCount.cnt === 0) {
    const insertPayroll = db.prepare(`
      INSERT INTO payroll_items (
        id, period_label, employee_name, employee_role, bank_label, account_number,
        amount_idr, note, status, prepared_by_id, prepared_by_name, prepared_at_ms,
        disbursed_by_id, disbursed_by_name, disbursed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPayroll.run(
      'pay-2026-11-01',
      'November 2026',
      'Raka Pratama',
      'ADMIN',
      'BCA',
      '5210-8834-12',
      3800000,
      'Gaji pokok + shift malam CS top-up',
      'DRAFT',
      'seed-keuangan',
      'Siti Rahma (Keuangan)',
      now - 3 * 60 * 60 * 1000,
      null,
      null,
      null
    );
    insertPayroll.run(
      'pay-2026-11-02',
      'November 2026',
      'Siti Rahma',
      'KEUANGAN',
      'Bank Mandiri',
      '1320-0194-5521',
      4200000,
      'Gaji pokok bagian pembukuan & rekonsiliasi QRIS',
      'DRAFT',
      'seed-keuangan',
      'Siti Rahma (Keuangan)',
      now - 3 * 60 * 60 * 1000,
      null,
      null,
      null
    );
  }

  // Seed 2 realistic access violation cases: 1 registered customer (billable after Owner review) + 1 anonymous (blocked only)
  const caseCount = db.prepare('SELECT COUNT(*) as cnt FROM violation_cases').get() as { cnt: number };
  if (caseCount.cnt === 0) {
    const insertCase = db.prepare(`
      INSERT INTO violation_cases (
        id, created_at_ms, updated_at_ms, is_registered_customer, billable,
        customer_uid, customer_email, customer_provider, ip_address, device_hash,
        user_agent, attempt_count, trigger_reason, evidence_summary, fee_amount_idr,
        status, invoice_id, reviewed_by_name, reviewed_at_ms, review_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertCase.run(
      'CASE-2026-001',
      now - 2 * 60 * 60 * 1000,
      now - 2 * 60 * 60 * 1000,
      1,
      1,
      'cust-violator-01',
      'rizky.gamer88@gmail.com',
      'google.com',
      '103.144.82.19',
      'dev_a94f82c10e4b',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36',
      4,
      '3x+ akses path admin diblokir dalam 24 jam',
      'Terdeteksi 4 percobaan membuka panel admin rahasia saat masuk sebagai pelanggan Google. Akun otomatis ditangguhkan menunggu tinjauan Owner.',
      DEFAULT_VIOLATION_FEE_IDR,
      'pending_review',
      null,
      null,
      null,
      null
    );

    db.prepare(`
      INSERT OR REPLACE INTO customer_suspensions (
        customer_uid, customer_email, case_id, status, fee_amount_idr, invoice_id, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'cust-violator-01',
      'rizky.gamer88@gmail.com',
      'CASE-2026-001',
      'pending_review',
      DEFAULT_VIOLATION_FEE_IDR,
      null,
      now - 2 * 60 * 60 * 1000
    );

    insertCase.run(
      'CASE-2026-002',
      now - 5 * 60 * 60 * 1000,
      now - 5 * 60 * 60 * 1000,
      0,
      0,
      null,
      null,
      null,
      '182.253.194.71',
      'dev_f12c90b77a31',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36',
      10,
      '10x gagal login admin dalam 24 jam',
      'Pengunjung anonim (tanpa akun pelanggan). IP & perangkat diblokir dan dicatat; tidak dapat dikenai tagihan.',
      0,
      'anonymous_blocked',
      null,
      null,
      null,
      null
    );

    db.prepare(`
      INSERT INTO ip_device_blocks (
        id, ip_address, device_hash, user_agent, reason, customer_uid, customer_email, blocked_at_ms, active, unblocked_by, unblocked_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)
    `).run(
      'blk-seed-01',
      '182.253.194.71',
      'dev_f12c90b77a31',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36',
      '10x gagal login admin dalam 24 jam (Anonim)',
      null,
      null,
      now - 5 * 60 * 60 * 1000
    );
  }

  // Seed deterministic administrative activity logs so Activity Logs table is immediately rich & filterable
  const auditCount = db.prepare('SELECT COUNT(*) as cnt FROM audit_logs').get() as { cnt: number };
  if (auditCount.cnt === 0) {
    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (
        id, created_at_ms, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAudit.run(
      'aud_seed_01',
      now - 35 * 60 * 1000,
      'seed-owner',
      'Owner ALSTORE',
      'OWNER',
      'LOGIN_SUCCESS',
      'session',
      'seed-owner',
      'Masuk ke panel admin (OWNER) dengan verifikasi TOTP 2FA',
      '103.144.82.10'
    );
    insertAudit.run(
      'aud_seed_02',
      now - 41 * 60 * 1000,
      'seed-owner',
      'Owner ALSTORE',
      'OWNER',
      'ORDER_STATUS_UPDATE',
      'order',
      'ALS-20261121-03',
      'Ubah status pesanan menjadi completed (Free Fire · 720 Diamonds)',
      '103.144.82.10'
    );
    insertAudit.run(
      'aud_seed_03',
      now - 2 * 60 * 60 * 1000,
      'seed-owner',
      'Owner ALSTORE',
      'OWNER',
      'SETTINGS_UPDATED',
      'admin_settings',
      'violation_fee_idr',
      'Menetapkan nominal biaya pelanggaran akses sebesar Rp 90.000',
      '103.144.82.10'
    );
    insertAudit.run(
      'aud_seed_04',
      now - 3 * 60 * 60 * 1000,
      'seed-keuangan',
      'Siti Rahma',
      'KEUANGAN',
      'PAYROLL_DRAFT_CREATED',
      'payroll',
      'pay-2026-11-01',
      'Menyiapkan draf gaji Raka Pratama (November 2026) sebesar Rp 3.800.000',
      '103.144.82.31'
    );
    insertAudit.run(
      'aud_seed_05',
      now - 4 * 60 * 60 * 1000,
      'seed-admin',
      'Raka Pratama',
      'ADMIN',
      'BANNER_SAVED',
      'banner',
      'banner-mlbb',
      'Memperbarui banner promo utama Mobile Legends: Bang Bang',
      '103.144.82.22'
    );
    insertAudit.run(
      'aud_seed_06',
      now - 6 * 60 * 60 * 1000,
      'seed-owner',
      'Owner ALSTORE',
      'OWNER',
      'PAYOUT_ACCOUNT_SAVED',
      'payout_account',
      'payout-qris-main',
      'Verifikasi rekening utama QRIS DANA Merchant (NMID: ID1024360748064 a.n. TOKO SEMBAKO EPEP)',
      '103.144.82.10'
    );
    insertAudit.run(
      'aud_seed_07',
      now - 26 * 60 * 60 * 1000,
      'seed-owner',
      'Owner ALSTORE',
      'OWNER',
      'STAFF_CREATED',
      'admin_user',
      'seed-admin',
      'Membuat akun staf Raka Pratama (raka@alstore.id) dengan peran ADMIN',
      '103.144.82.10'
    );
  }

  // Seed initial system alerts matching seeded security events so Key Metrics displays recent system alerts immediately
  const alertCount = db.prepare('SELECT COUNT(*) as cnt FROM owner_alerts').get() as { cnt: number };
  if (alertCount.cnt === 0) {
    const insertAlert = db.prepare(`
      INSERT INTO owner_alerts (id, created_at_ms, severity, title, message, channel, acknowledged)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertAlert.run(
      'al_seed_01',
      now - 2 * 60 * 60 * 1000,
      'warning',
      'Kasus Pelanggaran Akses Menunggu Tinjauan',
      'Akun pelanggan rizky.gamer88@gmail.com (CASE-2026-001) ditangguhkan setelah 4x percobaan akses path admin dan menunggu keputusan Owner.',
      'Panel Owner',
      0
    );

    insertAlert.run(
      'al_seed_02',
      now - 5 * 60 * 60 * 1000,
      'critical',
      'Blokir Otomatis IP & Perangkat Aktif',
      'IP 182.253.194.71 (dev_f12c90b77a31) diblokir permanen setelah 10x gagal login admin dalam 24 jam (Pengunjung Anonim).',
      'Panel Owner',
      0
    );
  }
}

/**
 * Seeds the initial Owner account ONLY from process.env.ADMIN_INITIAL_PASSWORD
 * when no Owner exists yet. Never hardcodes or logs any password.
 */
export async function ensureInitialOwnerFromEnv(): Promise<{ seeded: boolean; email?: string }> {
  const db = getDb();
  const existingOwner = db.prepare("SELECT id FROM admin_users WHERE role = 'OWNER' LIMIT 1").get() as
    | { id: string }
    | undefined;
  if (existingOwner) {
    return { seeded: false };
  }

  const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!envPassword || envPassword.length === 0) {
    return { seeded: false };
  }

  const email = (process.env.ADMIN_INITIAL_EMAIL || 'owner@alstore.id').trim().toLowerCase();
  const passwordHash = await hashPasswordArgon2id(envPassword);
  const strength = assessPasswordStrength(envPassword);
  const now = Date.now();
  const ownerId = `adm_${generateSecureTokenHex(8)}`;

  db.prepare(`
    INSERT INTO admin_users (
      id, email, full_name, role, password_hash, is_active,
      is_weak_password, must_change_password, totp_secret, totp_enabled,
      totp_last_step, created_at_ms, last_login_at_ms
    ) VALUES (?, ?, ?, 'OWNER', ?, 1, ?, ?, NULL, 0, NULL, ?, NULL)
  `).run(
    ownerId,
    email,
    'Owner ALSTORE',
    passwordHash,
    strength.isWeak ? 1 : 0,
    strength.isWeak ? 1 : 0,
    now
  );

  return { seeded: true, email };
}

export function getViolationFeeSetting(): number {
  const db = getDb();
  const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get('violation_fee_idr') as
    | { value: string }
    | undefined;
  const parsed = row ? Number(row.value) : DEFAULT_VIOLATION_FEE_IDR;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : DEFAULT_VIOLATION_FEE_IDR;
}

export function setViolationFeeSetting(amountIdr: number): number {
  const db = getDb();
  const sanitized = Math.max(0, Math.min(100_000_000, Math.round(amountIdr)));
  db.prepare('INSERT OR REPLACE INTO admin_settings (key, value, updated_at_ms) VALUES (?, ?, ?)').run(
    'violation_fee_idr',
    String(sanitized),
    Date.now()
  );
  return sanitized;
}

export function toPublicAdminUser(row: Record<string, unknown>): AdminUserPublic {
  const role = String(row.role) as AdminRole;
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    role,
    isActive: Number(row.is_active) === 1,
    isWeakPassword: Number(row.is_weak_password) === 1,
    mustChangePassword: Number(row.must_change_password) === 1,
    totpEnabled: Number(row.totp_enabled) === 1,
    totpRequired: role === 'OWNER',
    createdAtMs: Number(row.created_at_ms),
    lastLoginAtMs: row.last_login_at_ms ? Number(row.last_login_at_ms) : null
  };
}

export function writeAuditLog(params: {
  actorId: string;
  actorName: string;
  actorRole: AdminRole;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  ipAddress: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_logs (
      id, created_at_ms, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `aud_${generateSecureTokenHex(8)}`,
    Date.now(),
    params.actorId,
    params.actorName,
    params.actorRole,
    params.action,
    params.targetType,
    params.targetId,
    params.details,
    params.ipAddress
  );
}

export function mapOrderRow(row: Record<string, unknown>): TopUpOrder & {
  invoiceType?: string;
  customerEmail?: string | null;
  confirmedByName?: string | null;
  confirmedAtMs?: number | null;
  violationCaseId?: string | null;
} {
  return {
    invoiceId: String(row.invoice_id),
    invoiceType: String(row.invoice_type || 'topup'),
    ownerUid: row.owner_uid ? String(row.owner_uid) : undefined,
    customerEmail: row.customer_email ? String(row.customer_email) : null,
    gameId: String(row.game_id),
    gameName: String(row.game_name),
    itemName: String(row.item_name),
    accountId: String(row.account_id),
    zoneId: String(row.zone_id || ''),
    whatsapp: String(row.whatsapp || ''),
    paymentMethodId: String(row.payment_method_id),
    paymentMethodName: String(row.payment_method_name),
    basePrice: Number(row.base_price),
    adminFee: Number(row.admin_fee),
    uniqueCode: Number(row.unique_code),
    totalAmount: Number(row.total_amount),
    status: String(row.status) as OrderStatus,
    proofFileName: String(row.proof_file_name || ''),
    createdAtMs: Number(row.created_at_ms),
    expiresAtMs: Number(row.expires_at_ms),
    confirmedByName: row.confirmed_by_name ? String(row.confirmed_by_name) : null,
    confirmedAtMs: row.confirmed_at_ms ? Number(row.confirmed_at_ms) : null,
    violationCaseId: row.violation_case_id ? String(row.violation_case_id) : null
  };
}

export function mapViolationCaseRow(row: Record<string, unknown>): ViolationCaseRecord {
  return {
    id: String(row.id),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    isRegisteredCustomer: Number(row.is_registered_customer) === 1,
    billable: Number(row.billable) === 1,
    customerUid: row.customer_uid ? String(row.customer_uid) : null,
    customerEmail: row.customer_email ? String(row.customer_email) : null,
    customerProvider: row.customer_provider ? String(row.customer_provider) : null,
    ipAddress: String(row.ip_address),
    deviceHash: String(row.device_hash),
    userAgent: String(row.user_agent),
    attemptCount: Number(row.attempt_count),
    triggerReason: String(row.trigger_reason),
    evidenceSummary: String(row.evidence_summary),
    feeAmountIdr: Number(row.fee_amount_idr),
    status: String(row.status) as ViolationCaseStatus,
    invoiceId: row.invoice_id ? String(row.invoice_id) : null,
    reviewedByName: row.reviewed_by_name ? String(row.reviewed_by_name) : null,
    reviewedAtMs: row.reviewed_at_ms ? Number(row.reviewed_at_ms) : null,
    reviewNote: row.review_note ? String(row.review_note) : null
  };
}

export function mapAttemptRow(row: Record<string, unknown>): LoginAttemptRecord {
  return {
    id: String(row.id),
    createdAtMs: Number(row.created_at_ms),
    ipAddress: String(row.ip_address),
    userAgent: String(row.user_agent),
    deviceHash: String(row.device_hash),
    targetAccount: String(row.target_account),
    customerUid: row.customer_uid ? String(row.customer_uid) : null,
    customerEmail: row.customer_email ? String(row.customer_email) : null,
    attemptType: String(row.attempt_type) as LoginAttemptRecord['attemptType'],
    outcome: String(row.outcome)
  };
}

export function mapBlockRow(row: Record<string, unknown>): IpDeviceBlockRecord {
  return {
    id: String(row.id),
    ipAddress: String(row.ip_address),
    deviceHash: String(row.device_hash),
    userAgent: String(row.user_agent),
    reason: String(row.reason),
    customerUid: row.customer_uid ? String(row.customer_uid) : null,
    customerEmail: row.customer_email ? String(row.customer_email) : null,
    blockedAtMs: Number(row.blocked_at_ms),
    active: Number(row.active) === 1,
    unblockedBy: row.unblocked_by ? String(row.unblocked_by) : null,
    unblockedAtMs: row.unblocked_at_ms ? Number(row.unblocked_at_ms) : null
  };
}

export function mapPayoutAccountRow(row: Record<string, unknown>): PayoutAccountRecord {
  return {
    id: String(row.id),
    providerType: String(row.provider_type) as PayoutAccountRecord['providerType'],
    providerName: String(row.provider_name),
    accountNumber: String(row.account_number),
    accountHolder: String(row.account_holder),
    isPrimary: Number(row.is_primary) === 1,
    updatedAtMs: Number(row.updated_at_ms),
    updatedByName: String(row.updated_by_name)
  };
}

export function mapPayrollRow(row: Record<string, unknown>): PayrollItemRecord {
  return {
    id: String(row.id),
    periodLabel: String(row.period_label),
    employeeName: String(row.employee_name),
    employeeRole: String(row.employee_role) as AdminRole,
    bankLabel: String(row.bank_label),
    accountNumber: String(row.account_number),
    amountIdr: Number(row.amount_idr),
    note: String(row.note || ''),
    status: String(row.status) as PayrollItemRecord['status'],
    preparedById: String(row.prepared_by_id),
    preparedByName: String(row.prepared_by_name),
    preparedAtMs: Number(row.prepared_at_ms),
    disbursedById: row.disbursed_by_id ? String(row.disbursed_by_id) : null,
    disbursedByName: row.disbursed_by_name ? String(row.disbursed_by_name) : null,
    disbursedAtMs: row.disbursed_at_ms ? Number(row.disbursed_at_ms) : null
  };
}

export function mapAuditLogRow(row: Record<string, unknown>): AuditLogRecord {
  return {
    id: String(row.id),
    createdAtMs: Number(row.created_at_ms),
    actorId: String(row.actor_id),
    actorName: String(row.actor_name),
    actorEmail: row.actor_email ? String(row.actor_email) : null,
    actorRole: String(row.actor_role) as AdminRole,
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    details: String(row.details),
    ipAddress: String(row.ip_address)
  };
}

export function mapOwnerAlertRow(row: Record<string, unknown>): OwnerAlertRecord {
  return {
    id: String(row.id),
    createdAtMs: Number(row.created_at_ms),
    severity: String(row.severity) as OwnerAlertRecord['severity'],
    title: String(row.title),
    message: String(row.message),
    channel: String(row.channel),
    acknowledged: Number(row.acknowledged) === 1
  };
}

export function mapBannerRow(row: Record<string, unknown>): AdminBannerRecord {
  return {
    id: String(row.id),
    kicker: String(row.kicker),
    title: String(row.title),
    subtitle: String(row.subtitle),
    ctaLabel: String(row.cta_label),
    targetGameId: String(row.target_game_id),
    image: String(row.image),
    imagePosition: String(row.image_position || 'center center'),
    highlightNote: String(row.highlight_note || ''),
    isActive: Number(row.is_active) === 1,
    sortOrder: Number(row.sort_order),
    updatedAtMs: Number(row.updated_at_ms)
  };
}
