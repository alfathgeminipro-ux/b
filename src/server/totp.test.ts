import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOtpAuthUri,
  generateTotpCode,
  generateTotpSecret,
  getTotpTimeStep,
  verifyTotpCode
} from './totp';

test('TOTP generates valid 6-digit codes, verifies with ±1 drift, and rejects replays', () => {
  const secret = generateTotpSecret();
  const nowMs = 1_763_750_000_000;
  const currentStep = getTotpTimeStep(nowMs);
  const code = generateTotpCode(secret, nowMs);

  assert.match(code, /^\d{6}$/);

  const ok = verifyTotpCode(secret, code, { nowMs });
  assert.equal(ok.valid, true);
  assert.equal(ok.matchedStep, currentStep);

  // Reject replayed code for the exact same time step
  const replay = verifyTotpCode(secret, code, { nowMs, lastUsedStep: currentStep });
  assert.equal(replay.valid, false);

  // Accept ±1 step drift
  const prevStepCode = generateTotpCode(secret, nowMs - 30_000);
  const driftOk = verifyTotpCode(secret, prevStepCode, { nowMs });
  assert.equal(driftOk.valid, true);

  // Reject wrong code
  const wrong = verifyTotpCode(secret, code === '000000' ? '111111' : '000000', { nowMs });
  assert.equal(wrong.valid, false);
});

test('buildOtpAuthUri constructs standard otpauth URI for authenticator apps', () => {
  const uri = buildOtpAuthUri({
    issuer: 'ALSTORE Admin',
    accountEmail: 'owner@alstore.id',
    secretBase32: 'JBSWY3DPEHPK3PXP'
  });
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP'));
  assert.ok(uri.includes('digits=6'));
  assert.ok(uri.includes('period=30'));
});
