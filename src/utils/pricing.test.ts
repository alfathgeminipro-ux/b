import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_METHODS } from '../data/payments';
import {
  buildAdminWhatsAppUrl,
  calculateDiscountPercent,
  calculatePaymentTotal,
  generateBankUniqueCode,
  generateInvoiceId,
  validateWhatsAppNumber
} from './pricing';

test('calculatePaymentTotal handles QRIS, E-Wallet flat fees, and Bank unique codes', () => {
  const qris = PAYMENT_METHODS.find((m) => m.id === 'qris')!;
  const ovo = PAYMENT_METHODS.find((m) => m.id === 'ovo')!;
  const bca = PAYMENT_METHODS.find((m) => m.id === 'bca')!;

  const qrisTotal = calculatePaymentTotal(26800, qris, 245);
  assert.equal(qrisTotal.totalAmount, 26800);
  assert.equal(qrisTotal.uniqueCode, 0);

  const ovoTotal = calculatePaymentTotal(26800, ovo, 245);
  assert.equal(ovoTotal.adminFee, 500);
  assert.equal(ovoTotal.totalAmount, 27300);

  const bcaTotal = calculatePaymentTotal(26800, bca, 245);
  assert.equal(bcaTotal.uniqueCode, 245);
  assert.equal(bcaTotal.totalAmount, 27045);
});

test('generateInvoiceId produces valid ALSTORE format', () => {
  const id = generateInvoiceId(new Date('2026-11-21T10:15:30Z'), 12345);
  assert.match(id, /^ALS-2026\d{4}[A-Z]{2}$/);
});

test('generateBankUniqueCode stays within 101..499', () => {
  for (let i = 0; i < 20; i++) {
    const code = generateBankUniqueCode(i * 97);
    assert.ok(code >= 101 && code <= 499);
  }
});

test('validateWhatsAppNumber normalizes Indonesian numbers and rejects invalid ones', () => {
  assert.equal(validateWhatsAppNumber('0812-3456-7890').normalized, '6281234567890');
  assert.equal(validateWhatsAppNumber('6281234567890').valid, true);
  assert.equal(validateWhatsAppNumber('123').valid, false);
  assert.equal(validateWhatsAppNumber('').valid, false);
});

test('calculateDiscountPercent and buildAdminWhatsAppUrl format accurately', () => {
  assert.equal(calculateDiscountPercent(32000, 26800), 16);
  const url = buildAdminWhatsAppUrl({
    invoiceId: 'ALS-20261234AB',
    gameName: 'Mobile Legends: Bang Bang',
    itemName: 'Weekly Diamond Pass',
    accountId: '123456789',
    zoneId: '2345',
    paymentMethodName: 'QRIS',
    totalAmount: 26800,
    whatsapp: '081234567890'
  });
  assert.ok(url.startsWith('https://wa.me/6285935617640?text='));
  assert.ok(decodeURIComponent(url).includes('ALS-20261234AB'));
  assert.ok(decodeURIComponent(url).includes('123456789 (2345)'));
});
