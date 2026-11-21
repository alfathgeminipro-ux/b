import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessPasswordStrength,
  hashPasswordArgon2id,
  verifyPasswordConstantTime
} from './password';

test('assessPasswordStrength flags short numeric passwords as weak and accepts strong passphrases', () => {
  const weak = assessPasswordStrength('456789');
  assert.equal(weak.isWeak, true);
  assert.ok(weak.reasons.length >= 3);

  const strong = assessPasswordStrength('Alstore!2026#Vault');
  assert.equal(strong.isWeak, false);
  assert.equal(strong.reasons.length, 0);
});

test('hashPasswordArgon2id produces encoded PHC Argon2id hash and verifies in constant time', async () => {
  const hash = await hashPasswordArgon2id('Alstore!2026#Vault');
  assert.ok(hash.startsWith('$argon2id$'), 'Hash should use Argon2id PHC format');

  assert.equal(await verifyPasswordConstantTime('Alstore!2026#Vault', hash), true);
  assert.equal(await verifyPasswordConstantTime('wrong-password', hash), false);
  assert.equal(await verifyPasswordConstantTime('anything', null), false);
});
