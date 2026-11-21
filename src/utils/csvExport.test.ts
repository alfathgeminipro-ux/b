import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsvFilename,
  buildTransactionsCsv,
  escapeCsvCell,
  formatOrderStatusCsvLabel,
  type TransactionCsvRow
} from './csvExport';

test('escapeCsvCell neutralizes spreadsheet formula prefixes and quotes commas/quotes', () => {
  assert.equal(escapeCsvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(escapeCsvCell('+628123456789'), "'+628123456789");
  assert.equal(escapeCsvCell('-100'), "'-100");
  assert.equal(escapeCsvCell('@admin'), "'@admin");
  assert.equal(escapeCsvCell('Mobile Legends, "Mythic"'), '"Mobile Legends, ""Mythic"""');
  assert.equal(escapeCsvCell('Baris 1\nBaris 2'), 'Baris 1 Baris 2');
});

test('buildTransactionsCsv outputs header and properly formatted financial reporting rows', () => {
  const sample: TransactionCsvRow[] = [
    {
      invoiceId: 'ALS-20261121-01',
      invoiceType: 'topup',
      gameId: 'mlbb',
      gameName: 'Mobile Legends: Bang Bang',
      itemName: 'Weekly Diamond Pass',
      accountId: '982341029',
      zoneId: '2411',
      whatsapp: '+6281234567890',
      customerEmail: 'player@example.com',
      paymentMethodId: 'qris',
      paymentMethodName: 'QRIS (TOKO SEMBAKO EPEP)',
      basePrice: 26750,
      adminFee: 192,
      uniqueCode: 0,
      totalAmount: 26942,
      status: 'waiting_verification',
      proofFileName: 'bukti-qris.png',
      createdAtMs: Date.UTC(2026, 10, 21, 10, 0, 0),
      expiresAtMs: Date.UTC(2026, 10, 21, 10, 15, 0),
      confirmedByName: null
    },
    {
      invoiceId: 'ALS-20261121-02',
      invoiceType: 'topup',
      gameId: 'valorant',
      gameName: 'Valorant',
      itemName: '=1000 VP, Bonus',
      accountId: 'Riot#ID',
      zoneId: '',
      whatsapp: '081299990000',
      customerEmail: null,
      paymentMethodId: 'bca',
      paymentMethodName: 'BCA Virtual Account',
      basePrice: 90000,
      adminFee: 2500,
      uniqueCode: 211,
      totalAmount: 92711,
      status: 'completed',
      proofFileName: '',
      createdAtMs: Date.UTC(2026, 10, 21, 11, 0, 0),
      expiresAtMs: Date.UTC(2026, 10, 21, 11, 15, 0),
      confirmedByName: 'Owner ALSTORE'
    }
  ];

  const csv = buildTransactionsCsv(sample);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('Nomor Invoice,Tipe Invoice,Waktu Dibuat (ISO),'));
  assert.ok(lines[1].includes('ALS-20261121-01'));
  assert.ok(lines[1].includes("'+6281234567890"));
  assert.ok(lines[1].includes(',26750,192,0,26942,Menunggu Verifikasi,bukti-qris.png,'));
  assert.ok(lines[2].includes('"\'=1000 VP, Bonus"'));
  assert.ok(lines[2].includes(',90000,2500,211,92711,Selesai,,Owner ALSTORE'));
});

test('formatOrderStatusCsvLabel and buildCsvFilename format predictably', () => {
  assert.equal(formatOrderStatusCsvLabel('completed'), 'Selesai');
  assert.equal(formatOrderStatusCsvLabel('waiting_verification'), 'Menunggu Verifikasi');
  assert.equal(formatOrderStatusCsvLabel('pending'), 'Menunggu Bayar');
  assert.equal(formatOrderStatusCsvLabel('expired'), 'Kedaluwarsa');

  assert.equal(
    buildCsvFilename('alstore-transaksi', Date.UTC(2026, 10, 21, 12, 0, 0)),
    'alstore-transaksi-2026-11-21.csv'
  );
});
