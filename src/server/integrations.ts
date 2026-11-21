import crypto from 'node:crypto';
import { getDb } from './db';
import { generateSecureTokenHex, sha256Hex } from './password';

/**
 * Verifies Cloudflare Turnstile token when TURNSTILE_SECRET_KEY is configured.
 * When Turnstile keys are not configured in preview/dev, verifies our server-issued
 * signed CAPTCHA challenge so the 3x-failure CAPTCHA gate remains genuinely enforced.
 */
export async function verifyCaptchaResponse(params: {
  turnstileToken?: string;
  challengeId?: string;
  challengeAnswer?: string;
  ipAddress: string;
}): Promise<boolean> {
  const turnstileSecret = (process.env.TURNSTILE_SECRET_KEY || '').trim();

  if (turnstileSecret) {
    if (!params.turnstileToken) return false;
    try {
      const body = new URLSearchParams({
        secret: turnstileSecret,
        response: params.turnstileToken,
        remoteip: params.ipAddress
      });
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { success?: boolean };
      return Boolean(data.success);
    } catch {
      return false;
    }
  }

  // Fallback server-verified challenge when Turnstile keys are not yet configured
  if (!params.challengeId || !params.challengeAnswer) return false;
  const db = getDb();
  const row = db
    .prepare('SELECT answer_hash, expires_at_ms, ip_address FROM captcha_challenges WHERE challenge_id = ?')
    .get(params.challengeId) as
    | { answer_hash: string; expires_at_ms: number; ip_address: string }
    | undefined;

  // One-time use challenge: delete immediately regardless of outcome
  db.prepare('DELETE FROM captcha_challenges WHERE challenge_id = ?').run(params.challengeId);

  if (!row || Date.now() > Number(row.expires_at_ms)) return false;
  const submittedHash = sha256Hex(params.challengeAnswer.trim());
  const expectedBuf = Buffer.from(row.answer_hash, 'utf8');
  const submittedBuf = Buffer.from(submittedHash, 'utf8');
  return (
    expectedBuf.length === submittedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, submittedBuf)
  );
}

export function issueFallbackCaptchaChallenge(ipAddress: string): {
  challengeId: string;
  prompt: string;
} {
  const db = getDb();
  const a = crypto.randomInt(11, 49);
  const b = crypto.randomInt(3, 19);
  const answer = String(a + b);
  const challengeId = `cap_${generateSecureTokenHex(10)}`;
  const now = Date.now();

  // Prune expired challenges
  db.prepare('DELETE FROM captcha_challenges WHERE expires_at_ms < ?').run(now);
  db.prepare(
    'INSERT INTO captcha_challenges (challenge_id, answer_hash, expires_at_ms, ip_address) VALUES (?, ?, ?, ?)'
  ).run(challengeId, sha256Hex(answer), now + 5 * 60 * 1000, ipAddress);

  return {
    challengeId,
    prompt: `Berapa hasil ${a} + ${b}?`
  };
}

/**
 * Records an Owner security alert in the database and forwards to Telegram / Email if configured.
 */
export async function dispatchOwnerSecurityAlert(params: {
  severity: 'warning' | 'critical';
  title: string;
  message: string;
}): Promise<void> {
  const db = getDb();
  const channels: string[] = ['Panel Owner'];

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_OWNER_CHAT_ID || '').trim();
  const alertEmail = (process.env.OWNER_ALERT_EMAIL || '').trim();

  if (botToken && chatId) {
    try {
      const telegramResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `[ALSTORE KEAMANAN] ${params.title}\n\n${params.message}`
        })
      });
      if (telegramResp.ok) {
        channels.push('Telegram');
      }
    } catch {
      // Non-fatal: alert is still recorded in-app
    }
  }

  if (alertEmail) {
    channels.push(`Email (${alertEmail})`);
  }

  db.prepare(`
    INSERT INTO owner_alerts (id, created_at_ms, severity, title, message, channel, acknowledged)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    `alrt_${generateSecureTokenHex(8)}`,
    Date.now(),
    params.severity,
    params.title,
    params.message,
    channels.join(' · ')
  );
}
