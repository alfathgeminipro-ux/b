import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCRC16CCITT,
  convertStaticToDynamicQRIS,
  MERCHANT_QRIS_INFO,
  parseEmvTlv,
  STATIC_QRIS_PAYLOAD,
  verifyQrisCRC
} from './qris';

// Sample valid EMVCo Static QRIS payload for deterministic unit testing
const TAG_26_VALUE = '0011ID.DANA.WWW011893600915379567025402097956702540303UMI';
const SAMPLE_STATIC_BASE =
  `00020101021126${String(TAG_26_VALUE.length).padStart(2, '0')}${TAG_26_VALUE}5204594553033605802ID5917TOKO SEMBAKO EPEP6015Kota Jakarta Ti6105133506304`;
const SAMPLE_STATIC_QRIS = `${SAMPLE_STATIC_BASE}${calculateCRC16CCITT(SAMPLE_STATIC_BASE)}`;

test('calculateCRC16CCITT computes standard CCITT-FALSE check vector', () => {
  // Standard ASCII "123456789" CRC-16/CCITT-FALSE check value is 0x29B1
  assert.equal(calculateCRC16CCITT('123456789'), '29B1');
});

test('convertStaticToDynamicQRIS switches initiation method to 12, injects Tag 54, and recalculates valid CRC16', () => {
  assert.equal(verifyQrisCRC(SAMPLE_STATIC_QRIS), true);

  const dynamicPayload = convertStaticToDynamicQRIS(SAMPLE_STATIC_QRIS, 26800);
  assert.equal(verifyQrisCRC(dynamicPayload), true);

  const fields = parseEmvTlv(dynamicPayload);
  const poi = fields.find((f) => f.tag === '01');
  const amount = fields.find((f) => f.tag === '54');
  const countryIdx = fields.findIndex((f) => f.tag === '58');
  const amountIdx = fields.findIndex((f) => f.tag === '54');

  assert.equal(poi?.value, '12');
  assert.equal(amount?.value, '26800');
  assert.ok(amountIdx > -1 && amountIdx < countryIdx, 'Tag 54 must appear before Tag 58');
});

test('configured STATIC_QRIS_PAYLOAD for TOKO SEMBAKO EPEP has valid CRC16 and converts cleanly to Dynamic QRIS', () => {
  assert.equal(verifyQrisCRC(STATIC_QRIS_PAYLOAD), true);
  assert.equal(MERCHANT_QRIS_INFO.merchantName, 'TOKO SEMBAKO EPEP');
  assert.equal(MERCHANT_QRIS_INFO.nmid, 'ID1024360748064');

  const dynamic = convertStaticToDynamicQRIS(STATIC_QRIS_PAYLOAD, 69500);
  assert.equal(verifyQrisCRC(dynamic), true);

  const fields = parseEmvTlv(dynamic);
  assert.equal(fields.find((f) => f.tag === '01')?.value, '12');
  assert.equal(fields.find((f) => f.tag === '54')?.value, '69500');
  assert.equal(fields.find((f) => f.tag === '59')?.value, 'TOKO SEMBAKO EPEP');
  assert.ok(fields.find((f) => f.tag === '51')?.value.includes('ID1024360748064'));
  assert.ok(fields.find((f) => f.tag === '26')?.value.includes('ID.DANA.WWW'));
});

test('convertStaticToDynamicQRIS rejects empty payload or invalid amounts', () => {
  assert.throws(() => convertStaticToDynamicQRIS('', 15000));
  assert.throws(() => convertStaticToDynamicQRIS(SAMPLE_STATIC_QRIS, 0));
  assert.throws(() => convertStaticToDynamicQRIS(SAMPLE_STATIC_QRIS, -500));
});
