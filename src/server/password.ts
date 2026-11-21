import crypto from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

const ARGON2_MEMORY_KB = 19456; // 19 MiB (OWASP recommended minimum for Argon2id)
const ARGON2_ITERATIONS = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;

let cachedDummyHash: string | null = null;

export interface PasswordStrengthResult {
  isWeak: boolean;
  reasons: string[];
}

/**
 * Evaluates password strength without storing or logging the raw value.
 * Flags short/simple/numeric-only passwords (e.g. initial 6-digit numeric passwords) as weak.
 */
export function assessPasswordStrength(password: string): PasswordStrengthResult {
  const reasons: string[] = [];

  if (password.length < 12) {
    reasons.push('Minimal 12 karakter');
  }
  if (!/[a-z]/.test(password)) {
    reasons.push('Harus mengandung huruf kecil');
  }
  if (!/[A-Z]/.test(password)) {
    reasons.push('Harus mengandung huruf besar');
  }
  if (!/[0-9]/.test(password)) {
    reasons.push('Harus mengandung angka');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    reasons.push('Harus mengandung simbol khusus');
  }

  return {
    isWeak: reasons.length > 0,
    reasons
  };
}

/**
 * Hashes a password with genuine RFC 9106 Argon2id and a CSPRNG 16-byte salt.
 * Returns a standard PHC encoded string ($argon2id$v=19$...).
 */
export async function hashPasswordArgon2id(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KB,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'encoded'
  });
}

async function getDummyHash(): Promise<string> {
  if (!cachedDummyHash) {
    cachedDummyHash = await hashPasswordArgon2id(crypto.randomBytes(24).toString('hex'));
  }
  return cachedDummyHash;
}

/**
 * Constant-time Argon2id password verification.
 * Even when no stored hash exists (unknown account), runs a full Argon2id verification
 * against a precomputed dummy hash so timing cannot leak whether an account exists.
 */
export async function verifyPasswordConstantTime(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  const targetHash = storedHash && storedHash.startsWith('$argon2id$') ? storedHash : await getDummyHash();
  try {
    const valid = await argon2Verify({
      password,
      hash: targetHash
    });
    return Boolean(storedHash && valid);
  } catch {
    return false;
  }
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function generateSecureTokenHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
