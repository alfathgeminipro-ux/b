import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { AdminSessionState, AdminUserPublic } from '../../types/admin';
import { AdminApiError, adminFetch, setAdminSessionToken } from '../../utils/adminApi';
import { AccessDeniedPage } from './AccessDeniedPage';
import { AdminDashboard } from './AdminDashboard';
import { AdminLoginView } from './AdminLoginView';

interface AuthGateStatus {
  blocked: boolean;
  message?: string;
  needsOwnerBootstrap: boolean;
  lockedUntilMs: number | null;
  requireCaptcha: boolean;
  turnstileSiteKey: string;
  fallbackChallenge: { challengeId: string; prompt: string } | null;
  session?: AdminSessionState;
}

interface AdminPortalProps {
  firebaseUser?: User | null;
  initialSession?: AdminSessionState | null;
  onBackToStorefront?: () => void;
  onSessionCleared?: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  firebaseUser = null,
  initialSession = null,
  onBackToStorefront,
  onSessionCleared
}) => {
  const [loading, setLoading] = useState(!initialSession?.authenticated);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [gateStatus, setGateStatus] = useState<AuthGateStatus | null>(null);
  const [session, setSession] = useState<AdminSessionState | null>(() => {
    if (initialSession?.authenticated) {
      // Hydrate in-memory token synchronously BEFORE AdminDashboard mounts so its initial
      // useEffect data fetch never races ahead of parent useEffect
      if (initialSession.sessionToken) {
        setAdminSessionToken(initialSession.sessionToken);
      }
      return initialSession;
    }
    return null;
  });

  // Dynamically enforce noindex on the closed admin portal
  useEffect(() => {
    document.title = 'Panel Admin Tertutup · ALSTORE';
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.setAttribute('content', 'noindex, nofollow, noarchive');
  }, []);

  const loadPortalState = useCallback(async () => {
    setLoading(true);
    setBlockedMessage(null);
    try {
      const status = await adminFetch<AuthGateStatus>('/api/admin/auth/status');
      setGateStatus(status);
      if (status.session?.authenticated) {
        setAdminSessionToken(status.session.sessionToken);
        setSession(status.session);
        return;
      }

      // If signed into Firebase on the web, check if server grants direct Owner SSO access
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const ssoSession = await adminFetch<AdminSessionState>('/api/admin/auth/firebase-sso', {
            method: 'POST',
            body: {},
            bearerToken: idToken
          });
          if (ssoSession.authenticated) {
            setAdminSessionToken(ssoSession.sessionToken);
            setSession(ssoSession);
            return;
          }
        } catch {
          // Not an allowlisted Owner or token expired — fall back to standard login gate
        }
      }

      setSession(null);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403 && err.payload.blocked === true) {
        setBlockedMessage(err.message);
      } else {
        setGateStatus({
          blocked: false,
          needsOwnerBootstrap: false,
          lockedUntilMs: null,
          requireCaptcha: false,
          turnstileSiteKey: '',
          fallbackChallenge: null
        });
      }
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (initialSession?.authenticated) {
      if (initialSession.sessionToken) {
        setAdminSessionToken(initialSession.sessionToken);
      }
      setSession(initialSession);
      setLoading(false);
      return;
    }
    loadPortalState();
  }, [initialSession, loadPortalState]);

  const handleAdminUpdated = (updated: AdminUserPublic) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            admin: updated,
            needsTotpEnrollment: Boolean(prev.needsTotpEnrollment) && !updated.totpEnabled
          }
        : prev
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
        Memuat panel keamanan ALSTORE...
      </div>
    );
  }

  if (blockedMessage) {
    return <AccessDeniedPage message={blockedMessage} />;
  }

  if (session?.authenticated && !session.needsTotpEnrollment && session.admin) {
    return (
      <AdminDashboard
        session={session}
        onSessionExpired={() => {
          setAdminSessionToken(null);
          setSession(null);
          onSessionCleared?.();
          if (onBackToStorefront && window.location.pathname === '/') {
            onBackToStorefront();
          } else {
            loadPortalState();
          }
        }}
        onAdminUpdated={handleAdminUpdated}
        onBackToStorefront={onBackToStorefront}
      />
    );
  }

  return (
    <AdminLoginView
      needsOwnerBootstrap={Boolean(gateStatus?.needsOwnerBootstrap)}
      needsTotpEnrollment={Boolean(session?.authenticated && session.needsTotpEnrollment)}
      sessionAdminEmail={session?.admin?.email}
      initialLockedUntilMs={gateStatus?.lockedUntilMs ?? null}
      initialRequireCaptcha={Boolean(gateStatus?.requireCaptcha)}
      initialTurnstileSiteKey={gateStatus?.turnstileSiteKey ?? ''}
      initialFallbackChallenge={gateStatus?.fallbackChallenge ?? null}
      onAuthenticated={(nextSession) => {
        if (nextSession.sessionToken) {
          setAdminSessionToken(nextSession.sessionToken);
        }
        setSession(nextSession);
      }}
      onBlocked={(msg) => setBlockedMessage(msg)}
    />
  );
};
