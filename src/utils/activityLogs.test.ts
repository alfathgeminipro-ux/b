import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuditLogRecord } from '../types/admin';
import {
  DEFAULT_ACTIVITY_FILTER,
  buildActivityLogsCsv,
  escapeCsvCell,
  extractDistinctActions,
  extractDistinctActors,
  filterActivityLogs,
  getActivityActionMeta,
  paginateActivityLogs
} from './activityLogs';

const SAMPLE_LOGS: AuditLogRecord[] = [
  {
    id: 'aud_01',
    createdAtMs: new Date(2026, 10, 21, 9, 15, 0).getTime(),
    actorId: 'adm_owner',
    actorName: 'Owner ALSTORE',
    actorEmail: 'owner@alstore.id',
    actorRole: 'OWNER',
    action: 'LOGIN_SUCCESS',
    targetType: 'session',
    targetId: 'adm_owner',
    details: 'Masuk ke panel admin (OWNER)',
    ipAddress: '103.144.82.10'
  },
  {
    id: 'aud_02',
    createdAtMs: new Date(2026, 10, 21, 10, 0, 0).getTime(),
    actorId: 'adm_raka',
    actorName: 'Raka Pratama',
    actorEmail: 'raka@alstore.id',
    actorRole: 'ADMIN',
    action: 'ORDER_STATUS_UPDATE',
    targetType: 'order',
    targetId: 'ALS-20261121-03',
    details: 'Ubah status pesanan menjadi completed',
    ipAddress: '103.144.82.22'
  },
  {
    id: 'aud_03',
    createdAtMs: new Date(2026, 10, 20, 14, 30, 0).getTime(),
    actorId: 'adm_owner',
    actorName: 'Owner ALSTORE',
    actorEmail: 'owner@alstore.id',
    actorRole: 'OWNER',
    action: 'SETTINGS_UPDATED',
    targetType: 'admin_settings',
    targetId: 'violation_fee_idr',
    details: 'Mengubah nominal biaya pelanggaran akses menjadi Rp 95.000',
    ipAddress: '103.144.82.10'
  },
  {
    id: 'aud_04',
    createdAtMs: new Date(2026, 10, 19, 16, 45, 0).getTime(),
    actorId: 'adm_siti',
    actorName: 'Siti Rahma',
    actorEmail: 'siti@alstore.id',
    actorRole: 'KEUANGAN',
    action: 'PAYROLL_DRAFT_CREATED',
    targetType: 'payroll',
    targetId: 'pay-2026-11-01',
    details: 'Menyiapkan draf gaji Raka Pratama sebesar Rp 3.800.000',
    ipAddress: '103.144.82.31'
  }
];

test('getActivityActionMeta maps known and fallback action codes to categories', () => {
  assert.equal(getActivityActionMeta('LOGIN_SUCCESS').category, 'auth');
  assert.equal(getActivityActionMeta('ORDER_STATUS_UPDATE').category, 'orders');
  assert.equal(getActivityActionMeta('SETTINGS_UPDATED').category, 'settings');
  assert.equal(getActivityActionMeta('PAYROLL_DISBURSED').category, 'finance');
  assert.equal(getActivityActionMeta('BANNER_SAVED').category, 'content');
  assert.equal(getActivityActionMeta('VIOLATION_APPROVED_BILLING').category, 'security');
  assert.equal(getActivityActionMeta('CUSTOM_FEE_OVERRIDE').category, 'settings');
});

test('filterActivityLogs searches across actor, action, target, details, and IP', () => {
  const byActor = filterActivityLogs(SAMPLE_LOGS, {
    ...DEFAULT_ACTIVITY_FILTER,
    search: 'raka@alstore.id'
  });
  assert.equal(byActor.length, 1);
  assert.equal(byActor[0].id, 'aud_02');

  const byFeeDetails = filterActivityLogs(SAMPLE_LOGS, {
    ...DEFAULT_ACTIVITY_FILTER,
    search: 'biaya pelanggaran'
  });
  assert.equal(byFeeDetails.length, 1);
  assert.equal(byFeeDetails[0].action, 'SETTINGS_UPDATED');

  const byIp = filterActivityLogs(SAMPLE_LOGS, {
    ...DEFAULT_ACTIVITY_FILTER,
    search: '103.144.82.31'
  });
  assert.equal(byIp.length, 1);
  assert.equal(byIp[0].actorRole, 'KEUANGAN');
});

test('filterActivityLogs filters by category, role, actorId, date range, and sort order', () => {
  const byCategory = filterActivityLogs(SAMPLE_LOGS, {
    ...DEFAULT_ACTIVITY_FILTER,
    category: 'orders'
  });
  assert.deepEqual(
    byCategory.map((r) => r.id),
    ['aud_02']
  );

  const byRole = filterActivityLogs(SAMPLE_LOGS, {
    ...DEFAULT_ACTIVITY_FILTER,
    role: 'OWNER'
  });
  assert.deepEqual(
    byRole.map((r) => r.id),
    ['aud_01', 'aud_03']
  );

  const byDateRangeOldest = filterActivityLogs(SAMPLE_LOGS, {
    ...DEFAULT_ACTIVITY_FILTER,
    dateFrom: '2026-11-20',
    dateTo: '2026-11-21',
    sortOrder: 'oldest'
  });
  assert.deepEqual(
    byDateRangeOldest.map((r) => r.id),
    ['aud_03', 'aud_01', 'aud_02']
  );
});

test('extractDistinctActors and extractDistinctActions deduplicate cleanly', () => {
  const actors = extractDistinctActors(SAMPLE_LOGS);
  assert.equal(actors.length, 3);
  const actions = extractDistinctActions(SAMPLE_LOGS);
  assert.equal(actions.length, 4);
});

test('paginateActivityLogs computes bounds and clamps out-of-range pages', () => {
  const page1 = paginateActivityLogs(SAMPLE_LOGS, 1, 2);
  assert.equal(page1.items.length, 2);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.startIndex, 1);
  assert.equal(page1.endIndex, 2);

  const clamped = paginateActivityLogs(SAMPLE_LOGS, 99, 2);
  assert.equal(clamped.page, 2);
  assert.equal(clamped.startIndex, 3);
  assert.equal(clamped.endIndex, 4);

  const empty = paginateActivityLogs([], 1, 10);
  assert.equal(empty.startIndex, 0);
  assert.equal(empty.endIndex, 0);
  assert.equal(empty.totalPages, 1);
});

test('escapeCsvCell neutralizes spreadsheet formula prefixes and quotes commas', () => {
  assert.equal(escapeCsvCell('=CMD()'), "'=CMD()");
  assert.equal(escapeCsvCell('+1234'), "'+1234");
  assert.equal(escapeCsvCell('a, "b"'), '"a, ""b"""');

  const csv = buildActivityLogsCsv([SAMPLE_LOGS[2]]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('Nama Aktor'));
  assert.ok(lines[1].includes('SETTINGS_UPDATED'));
});
