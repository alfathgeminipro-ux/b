import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBase32SecretGroups,
  getTotpSecondsRemaining,
  isCompleteTotpCode,
  normalizeTotpCodeInput
} from './totpFormat';

test('formatBase32SecretGroups splits valid Base32 secret into 4-char readable blocks', () => {
  assert.equal(formatBase32SecretGroups('jbswy3dpehpk3pxp'), 'JBSW Y3DP EHPK 3PXP');
  assert.equal(formatBase32SecretGroups('ABCD-EF23 4567'), 'ABCD EF23 4567');
  assert.equal(formatBase32SecretGroups('   '), '');
});

test('normalizeTotpCodeInput strips non-digits and clamps to 6 digits', () => {
  assert.equal(normalizeTotpCodeInput('123 456'), '123456');
  assert.equal(normalizeTotpCodeInput('ab12-34cd5678'), '123456');
  assert.equal(isCompleteTotpCode('123456'), true);
  assert.equal(isCompleteTotpCode('12345'), false);
});

test('getTotpSecondsRemaining aligns cleanly within 1..30 second windows', () => {
  assert.equal(getTotpSecondsRemaining(0, 30), 30);
  assert.equal(getTotpSecondsRemaining(10_000, 30), 20);
  assert.equal(getTotpSecondsRemaining(29_500, 30), 1);
  assert.equal(getTotpSecondsRemaining(30_000, 30), 30);
});
