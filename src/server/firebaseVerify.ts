import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId
  });
}

const adminAuth = getAuth();

export interface VerifiedCustomerIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  provider: string;
}

/**
 * Verifies a Firebase ID token sent by a signed-in user (Google/Apple).
 * Uses verifyIdToken() which verifies signatures against Google public keys with no IAM needed.
 */
export async function verifyCustomerBearerToken(
  authHeader: string | undefined
): Promise<VerifiedCustomerIdentity | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const decoded: DecodedIdToken = await adminAuth.verifyIdToken(token);
    const provider =
      (decoded.firebase && typeof decoded.firebase.sign_in_provider === 'string'
        ? decoded.firebase.sign_in_provider
        : 'google.com') || 'google.com';
    const rawEmail = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
    const emailVerified = Boolean(rawEmail && decoded.email_verified === true);
    const name =
      typeof decoded.name === 'string' && decoded.name.trim() ? decoded.name.trim().slice(0, 80) : null;
    return {
      uid: decoded.uid,
      email: rawEmail || `${decoded.uid}@customer.alstore.id`,
      emailVerified,
      name,
      provider
    };
  } catch (err) {
    console.warn(
      'Firebase ID token verification failed:',
      err instanceof Error ? err.message : 'unknown error'
    );
    return null;
  }
}
