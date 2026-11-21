export const TOTP_CODE_LENGTH = 6;
export const TOTP_STEP_SECONDS = 30;

/**
 * Formats a Base32 TOTP secret key into readable 4-character blocks
 * (e.g., "JBSWY3DPEHPK3PXP" -> "JBSW Y3DP EHPK 3PXP") for manual entry
 * into authenticator apps like Google Authenticator, Authy, or 1Password.
 */
export function formatBase32SecretGroups(secret: string): string {
  const cleaned = secret.replace(/[^A-Za-z2-7]/g, '').toUpperCase();
  if (!cleaned) return '';
  return cleaned.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Normalizes user-typed TOTP input to at most 6 ASCII digits.
 */
export function normalizeTotpCodeInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, TOTP_CODE_LENGTH);
}

/**
 * Checks whether a normalized or raw TOTP input contains exactly 6 digits.
 */
export function isCompleteTotpCode(raw: string): boolean {
  return normalizeTotpCodeInput(raw).length === TOTP_CODE_LENGTH;
}

/**
 * Computes remaining seconds in the current 30-second RFC 6238 TOTP window.
 */
export function getTotpSecondsRemaining(nowMs = Date.now(), periodSeconds = TOTP_STEP_SECONDS): number {
  const epochSeconds = Math.floor(nowMs / 1000);
  const elapsed = ((epochSeconds % periodSeconds) + periodSeconds) % periodSeconds;
  return periodSeconds - elapsed;
}
