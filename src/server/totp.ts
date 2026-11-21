import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(byteLength = 20): string {
  return encodeBase32(crypto.randomBytes(byteLength));
}

export function getTotpTimeStep(nowMs = Date.now(), periodSeconds = TOTP_PERIOD_SECONDS): number {
  return Math.floor(nowMs / 1000 / periodSeconds);
}

export function generateTotpCodeForStep(secretBase32: string, step: number): string {
  const key = decodeBase32(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  const high = Math.floor(step / 0x100000000);
  const low = step >>> 0;
  counterBuffer.writeUInt32BE(high, 0);
  counterBuffer.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binaryCode % 10 ** TOTP_DIGITS;
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

export function generateTotpCode(secretBase32: string, nowMs = Date.now()): string {
  return generateTotpCodeForStep(secretBase32, getTotpTimeStep(nowMs));
}

export interface TotpVerifyResult {
  valid: boolean;
  matchedStep: number | null;
}

/**
 * Constant-time RFC 6238 TOTP verification with ±1 step drift tolerance
 * and optional anti-replay check against lastUsedStep.
 */
export function verifyTotpCode(
  secretBase32: string,
  submittedCode: string,
  options?: {
    nowMs?: number;
    windowSteps?: number;
    lastUsedStep?: number | null;
  }
): TotpVerifyResult {
  const normalized = submittedCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, matchedStep: null };
  }

  const nowMs = options?.nowMs ?? Date.now();
  const windowSteps = options?.windowSteps ?? 1;
  const lastUsedStep = options?.lastUsedStep ?? null;
  const currentStep = getTotpTimeStep(nowMs);
  const submittedBuf = Buffer.from(normalized, 'utf8');

  let matchedStep: number | null = null;
  for (let delta = -windowSteps; delta <= windowSteps; delta += 1) {
    const candidateStep = currentStep + delta;
    const expected = generateTotpCodeForStep(secretBase32, candidateStep);
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (
      submittedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(submittedBuf, expectedBuf)
    ) {
      matchedStep = candidateStep;
    }
  }

  if (matchedStep === null) {
    return { valid: false, matchedStep: null };
  }

  // Prevent reusing the exact same 30-second OTP step (replay protection)
  if (lastUsedStep !== null && matchedStep <= lastUsedStep) {
    return { valid: false, matchedStep: null };
  }

  return { valid: true, matchedStep };
}

export function buildOtpAuthUri(params: {
  issuer: string;
  accountEmail: string;
  secretBase32: string;
}): string {
  const issuer = encodeURIComponent(params.issuer);
  const label = encodeURIComponent(`${params.issuer}:${params.accountEmail}`);
  return `otpauth://totp/${label}?secret=${params.secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}
