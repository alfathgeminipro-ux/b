import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { AccessDeniedPage } from './components/admin/AccessDeniedPage';
import { AdminPortal } from './components/admin/AdminPortal';
import { NotFoundPage } from './components/admin/NotFoundPage';
import { AuthModal } from './components/AuthModal';
import { CheckoutPage } from './components/CheckoutPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FlashSaleSection } from './components/FlashSaleSection';
import { Footer } from './components/Footer';
import { GameCatalog } from './components/GameCatalog';
import { InvoicePage } from './components/InvoicePage';
import { Navbar, type AppView } from './components/Navbar';
import { PromoSlider } from './components/PromoSlider';
import { TrackOrderPage } from './components/TrackOrderPage';
import { GAMES_CATALOG } from './data/games';
import { auth, signOutAccount } from './lib/firebase';
import type { AdminSessionState, CustomerSuspensionInfo } from './types/admin';
import type {
  AuthUserSummary,
  SavedGameAccount,
  ThemeId,
  TopUpOrder,
  UserPreferences
} from './types/store';
import {
  AdminApiError,
  adminFetch,
  formatIdr,
  getAdminSessionToken,
  setAdminSessionToken
} from './utils/adminApi';
import {
  normalizePathname,
  resolvePopstateRouteMode,
  shouldRunServerGateCheck,
  type RouteGateMode
} from './utils/adminRouting';
import {
  applyThemeToDocument,
  loadLocalOrders,
  loadLocalPrefs,
  loadSavedTheme,
  saveLocalOrders,
  saveLocalPrefs,
  saveOrderToFirestore,
  saveTheme,
  saveUserAutofillToFirestore,
  syncUserFromFirestore,
  updateOrderProofInFirestore
} from './utils/storage';
import {
  loadRecentGameIds,
  recordRecentGameId,
  removeRecentGameId,
  saveRecentGameIds
} from './utils/recentGames';

const VALID_GAME_IDS = new Set(GAMES_CATALOG.map((g) => g.id));

function mergeOrders(remote: TopUpOrder[], local: TopUpOrder[]): TopUpOrder[] {
  const byId = new Map<string, TopUpOrder>();
  for (const item of local) {
    byId.set(item.invoiceId, item);
  }
  for (const item of remote) {
    const existing = byId.get(item.invoiceId);
    byId.set(item.invoiceId, {
      ...existing,
      ...item,
      proofPreviewDataUrl: existing?.proofPreviewDataUrl
    });
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export default function App() {
  const [currentPathname, setCurrentPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? normalizePathname(window.location.pathname) : '/'
  );
  const [routeMode, setRouteMode] = useState<RouteGateMode>(() =>
    typeof window !== 'undefined' && normalizePathname(window.location.pathname) !== '/'
      ? 'checking'
      : 'storefront'
  );
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | undefined>(undefined);
  const [authReady, setAuthReady] = useState(false);

  const [theme, setTheme] = useState<ThemeId>(() => loadSavedTheme());
  const [view, setView] = useState<AppView>('home');
  const [selectedGameId, setSelectedGameId] = useState<string>('mlbb');
  const [preselectedNominalId, setPreselectedNominalId] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isVerifiedOwner, setIsVerifiedOwner] = useState(false);
  const [ownerAdminSession, setOwnerAdminSession] = useState<AdminSessionState | null>(null);
  const pendingOwnerAutoEnterRef = useRef(false);
  const openingAdminPortalRef = useRef(false);
  const routeModeRef = useRef<RouteGateMode>(routeMode);
  routeModeRef.current = routeMode;
  const [customerSuspension, setCustomerSuspension] = useState<
    (CustomerSuspensionInfo & { invoice?: TopUpOrder | null }) | null
  >(null);

  const [orders, setOrders] = useState<TopUpOrder[]>(() => loadLocalOrders());
  const [prefs, setPrefs] = useState<UserPreferences>(() => loadLocalPrefs());
  const [recentGameIds, setRecentGameIds] = useState<string[]>(() =>
    loadRecentGameIds(VALID_GAME_IDS)
  );

  // Apply and persist theme
  useEffect(() => {
    applyThemeToDocument(theme);
    saveTheme(theme);
  }, [theme]);

  // Listen to real Firebase Authentication state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        let idToken: string | null = null;
        try {
          idToken = await user.getIdToken();
        } catch {
          idToken = null;
        }

        // Verify server-side whether this signed-in email is an allowlisted Owner
        if (idToken) {
          try {
            let eligibility = await adminFetch<{ eligibleOwner: boolean }>(
              '/api/admin/auth/firebase-eligibility',
              { bearerToken: idToken }
            );
            // If cached Firebase ID token was near expiry, retry once with a force-refreshed token
            if (!eligibility.eligibleOwner) {
              const refreshedToken = await user.getIdToken(true).catch(() => null);
              if (refreshedToken && refreshedToken !== idToken) {
                idToken = refreshedToken;
                eligibility = await adminFetch<{ eligibleOwner: boolean }>(
                  '/api/admin/auth/firebase-eligibility',
                  { bearerToken: idToken }
                );
              }
            }
            if (eligibility.eligibleOwner) {
              setIsVerifiedOwner(true);
              if (pendingOwnerAutoEnterRef.current) {
                pendingOwnerAutoEnterRef.current = false;
                try {
                  const ssoSession = await adminFetch<AdminSessionState>(
                    '/api/admin/auth/firebase-sso',
                    {
                      method: 'POST',
                      body: {},
                      bearerToken: idToken
                    }
                  );
                  if (ssoSession.authenticated) {
                    setAdminSessionToken(ssoSession.sessionToken);
                    setOwnerAdminSession(ssoSession);
                    setRouteMode('admin_portal');
                  }
                } catch {
                  // Still allow entering the Admin Portal gate so the Owner can see clear status or retry
                  setOwnerAdminSession(null);
                  setRouteMode('admin_portal');
                }
              }
            } else {
              setIsVerifiedOwner(false);
              setOwnerAdminSession(null);
              pendingOwnerAutoEnterRef.current = false;
            }
          } catch {
            setIsVerifiedOwner(false);
            pendingOwnerAutoEnterRef.current = false;
          }
        }

        try {
          const susp = await adminFetch<CustomerSuspensionInfo & { invoice?: TopUpOrder | null }>(
            '/api/customer/suspension',
            { bearerToken: idToken }
          );
          if (susp.suspended) {
            setCustomerSuspension(susp);
            if (susp.invoice) {
              setOrders((prev) => {
                const merged = mergeOrders([susp.invoice!], prev);
                saveLocalOrders(merged);
                return merged;
              });
            }
          } else {
            setCustomerSuspension(null);
          }
        } catch {
          setCustomerSuspension(null);
        }

        try {
          const localPrefs = loadLocalPrefs();
          const synced = await syncUserFromFirestore(user, localPrefs.whatsapp);
          setPrefs((prev) => {
            const merged: UserPreferences = {
              whatsapp: synced.prefs.whatsapp || prev.whatsapp,
              savedAccounts: { ...prev.savedAccounts, ...synced.prefs.savedAccounts }
            };
            saveLocalPrefs(merged);
            return merged;
          });
          setOrders((prev) => {
            const merged = mergeOrders(synced.orders, prev);
            saveLocalOrders(merged);
            return merged;
          });
        } catch (err) {
          // Graceful localStorage fallback if Firestore is unreachable or unverified
          console.warn('Firestore sync skipped, using local cache:', err);
        }
      } else {
        setIsVerifiedOwner(false);
        setOwnerAdminSession(null);
        setAdminSessionToken(null);
        pendingOwnerAutoEnterRef.current = false;
        setCustomerSuspension(null);
      }
    });
    return () => unsub();
  }, []);

  // Track browser Back/Forward navigation so routeMode stays in sync with window.location.pathname
  useEffect(() => {
    const handlePopState = () => {
      const nextPath = normalizePathname(window.location.pathname);
      setCurrentPathname(nextPath);
      setRouteMode(resolvePopstateRouteMode(nextPath));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Verify non-root path on server without exposing secret ADMIN_PATH in client bundle
  useEffect(() => {
    const hasActiveAdminSession = Boolean(ownerAdminSession?.authenticated || getAdminSessionToken());
    if (
      !shouldRunServerGateCheck({
        pathname: currentPathname,
        authReady,
        routeMode: routeModeRef.current,
        hasActiveAdminSession
      })
    ) {
      return;
    }

    let active = true;
    (async () => {
      try {
        const idToken = firebaseUser ? await firebaseUser.getIdToken().catch(() => null) : null;
        const result = await adminFetch<{ mode: RouteGateMode; message?: string }>(
          '/api/gate/check',
          {
            method: 'POST',
            body: { pathname: currentPathname },
            bearerToken: idToken
          }
        );
        if (!active) return;
        setRouteMode(result.mode);
        setAccessDeniedMessage(result.message);
      } catch (err) {
        if (!active) return;
        if (err instanceof AdminApiError) {
          if (err.payload.mode === 'access_denied') {
            setRouteMode('access_denied');
            setAccessDeniedMessage(
              typeof err.payload.message === 'string' ? err.payload.message : err.message
            );
            return;
          }
        }
        setRouteMode('not_found');
      }
    })();
    return () => {
      active = false;
    };
  }, [currentPathname, authReady, firebaseUser, ownerAdminSession]);

  const userSummary: AuthUserSummary | null = useMemo(() => {
    if (!firebaseUser) return null;
    return {
      uid: firebaseUser.uid,
      displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Member ALSTORE',
      email: firebaseUser.email || '',
      photoURL: firebaseUser.photoURL || '',
      providerId: firebaseUser.providerData[0]?.providerId || 'google.com'
    };
  }, [firebaseUser]);

  const activeGame = useMemo(
    () => GAMES_CATALOG.find((g) => g.id === selectedGameId) || GAMES_CATALOG[0],
    [selectedGameId]
  );

  const activeOrder = useMemo(
    () => orders.find((o) => o.invoiceId === activeInvoiceId) || orders[0] || null,
    [orders, activeInvoiceId]
  );

  const navigateTo = useCallback((nextView: AppView) => {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRecordRecentGame = useCallback((gameId: string) => {
    setRecentGameIds((prev) => {
      const next = recordRecentGameId(prev, gameId, VALID_GAME_IDS);
      saveRecentGameIds(next);
      return next;
    });
  }, []);

  const handleRemoveRecentGame = useCallback((gameId: string) => {
    setRecentGameIds((prev) => {
      const next = removeRecentGameId(prev, gameId);
      saveRecentGameIds(next);
      return next;
    });
  }, []);

  const handleClearRecentGames = useCallback(() => {
    setRecentGameIds([]);
    saveRecentGameIds([]);
  }, []);

  const handleSelectGame = useCallback(
    (gameId: string, nominalId?: string) => {
      handleRecordRecentGame(gameId);
      setSelectedGameId(gameId);
      setPreselectedNominalId(nominalId || null);
      setView('checkout');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [handleRecordRecentGame]
  );

  const handleCreateOrder = useCallback(
    async (order: TopUpOrder, savedAccount: SavedGameAccount) => {
      const enrichedOrder: TopUpOrder = {
        ...order,
        ownerUid: firebaseUser?.uid
      };

      setOrders((prev) => {
        const next = [enrichedOrder, ...prev];
        saveLocalOrders(next);
        return next;
      });

      setPrefs((prev) => {
        const next: UserPreferences = {
          whatsapp: order.whatsapp,
          savedAccounts: {
            ...prev.savedAccounts,
            [savedAccount.gameId]: savedAccount
          }
        };
        saveLocalPrefs(next);
        return next;
      });

      setActiveInvoiceId(enrichedOrder.invoiceId);
      setView('invoice');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Mirror order to backend SQLite so Admin Panel can manage & confirm it
      try {
        const idToken = firebaseUser ? await firebaseUser.getIdToken().catch(() => null) : null;
        await adminFetch('/api/public/orders', {
          method: 'POST',
          body: enrichedOrder,
          bearerToken: idToken
        });
      } catch {
        // Non-blocking fallback
      }

      if (firebaseUser) {
        try {
          await saveOrderToFirestore(firebaseUser, enrichedOrder);
          await saveUserAutofillToFirestore(firebaseUser, order.whatsapp, savedAccount);
        } catch (err) {
          console.warn('Firestore order write fell back to localStorage:', err);
        }
      }
    },
    [firebaseUser]
  );

  const handleUploadProof = useCallback(
    async (invoiceId: string, fileName: string, previewDataUrl: string) => {
      setOrders((prev) => {
        const next = prev.map((ord) =>
          ord.invoiceId === invoiceId
            ? {
                ...ord,
                status: 'waiting_verification' as const,
                proofFileName: fileName,
                proofPreviewDataUrl: previewDataUrl
              }
            : ord
        );
        saveLocalOrders(next);
        return next;
      });

      try {
        await adminFetch(`/api/public/orders/${encodeURIComponent(invoiceId)}/proof`, {
          method: 'POST',
          body: { fileName }
        });
      } catch {
        // Non-blocking fallback
      }

      if (firebaseUser) {
        try {
          await updateOrderProofInFirestore(invoiceId, fileName);
        } catch (err) {
          console.warn('Firestore proof update fell back to localStorage:', err);
        }
      }
    },
    [firebaseUser]
  );

  const handleExpireOrder = useCallback((invoiceId: string) => {
    setOrders((prev) => {
      const target = prev.find((o) => o.invoiceId === invoiceId);
      if (!target || target.status !== 'pending') return prev;
      const next = prev.map((ord) =>
        ord.invoiceId === invoiceId ? { ...ord, status: 'expired' as const } : ord
      );
      saveLocalOrders(next);
      return next;
    });
  }, []);

  const handleOpenInvoice = useCallback((invoiceId: string) => {
    setActiveInvoiceId(invoiceId);
    setView('invoice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenAdminPortal = useCallback(async () => {
    if (!firebaseUser || openingAdminPortalRef.current) return;
    openingAdminPortalRef.current = true;
    try {
      let idToken = await firebaseUser.getIdToken();
      let ssoSession: AdminSessionState;
      try {
        ssoSession = await adminFetch<AdminSessionState>('/api/admin/auth/firebase-sso', {
          method: 'POST',
          body: {},
          bearerToken: idToken
        });
      } catch (firstErr) {
        // Retry once with a fresh Firebase ID token if the cached token just expired
        if (firstErr instanceof AdminApiError && firstErr.status === 401) {
          idToken = await firebaseUser.getIdToken(true);
          ssoSession = await adminFetch<AdminSessionState>('/api/admin/auth/firebase-sso', {
            method: 'POST',
            body: {},
            bearerToken: idToken
          });
        } else {
          throw firstErr;
        }
      }

      if (ssoSession.authenticated) {
        setAdminSessionToken(ssoSession.sessionToken);
        setOwnerAdminSession(ssoSession);
        setRouteMode('admin_portal');
        window.scrollTo({ top: 0 });
      }
    } catch {
      // Verified owner button should never feel dead: open AdminPortal so it can display error or re-authenticate
      if (isVerifiedOwner) {
        setOwnerAdminSession(null);
        setRouteMode('admin_portal');
        window.scrollTo({ top: 0 });
      }
    } finally {
      openingAdminPortalRef.current = false;
    }
  }, [firebaseUser, isVerifiedOwner]);

  const handleBackToStorefront = useCallback(() => {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setCurrentPathname('/');
    setOwnerAdminSession(null);
    document.title = 'ALSTORE — Top-Up Game Instan, Aman & Terpercaya';
    setRouteMode('storefront');
    window.scrollTo({ top: 0 });
  }, []);

  const handleAdminSessionCleared = useCallback(() => {
    setAdminSessionToken(null);
    setOwnerAdminSession(null);
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      if (isVerifiedOwner) {
        await adminFetch('/api/admin/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
      }
      setAdminSessionToken(null);
      setOwnerAdminSession(null);
      await signOutAccount();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, [isVerifiedOwner]);

  if (routeMode === 'checking') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
        Memuat ALSTORE...
      </div>
    );
  }

  if (routeMode === 'admin_portal') {
    return (
      <ErrorBoundary>
        <AdminPortal
          firebaseUser={firebaseUser}
          initialSession={ownerAdminSession}
          onBackToStorefront={handleBackToStorefront}
          onSessionCleared={handleAdminSessionCleared}
        />
      </ErrorBoundary>
    );
  }

  if (routeMode === 'access_denied') {
    return (
      <ErrorBoundary>
        <AccessDeniedPage message={accessDeniedMessage} />
      </ErrorBoundary>
    );
  }

  if (routeMode === 'not_found') {
    return (
      <ErrorBoundary>
        <NotFoundPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        <Navbar
          currentView={view}
          onNavigate={navigateTo}
          theme={theme}
          onChangeTheme={setTheme}
          user={userSummary}
          isVerifiedOwner={isVerifiedOwner}
          onOpenAdminPortal={handleOpenAdminPortal}
          onOpenAuth={() => setAuthModalOpen(true)}
          onSignOut={handleSignOut}
          ordersCount={orders.length}
        />

        <main className="flex-1">
          {customerSuspension?.suspended && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-22 -mb-16 relative z-10">
              <div
                role="alert"
                className="rounded-2xl border border-rose-500/40 bg-rose-950/70 backdrop-blur-md p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-rose-100"
              >
                <div className="flex items-start gap-3">
                  {customerSuspension.status === 'approved_unpaid' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm text-white">
                      Akun Ditangguhkan · Kasus {customerSuspension.caseId}
                    </p>
                    <p className="text-rose-200">{customerSuspension.message}</p>
                  </div>
                </div>
                {customerSuspension.status === 'approved_unpaid' && customerSuspension.invoiceId && (
                  <button
                    type="button"
                    onClick={() => handleOpenInvoice(customerSuspension.invoiceId!)}
                    className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
                  >
                    Bayar Tagihan {formatIdr(customerSuspension.feeAmountIdr || 90000)}
                  </button>
                )}
              </div>
            </div>
          )}

          {view === 'home' && (
            <>
              <PromoSlider onSelectGame={(id) => handleSelectGame(id)} />
              <FlashSaleSection onQuickSelect={handleSelectGame} />
              <GameCatalog
                onSelectGame={(id) => handleSelectGame(id)}
                recentGameIds={recentGameIds}
                onRecordRecentGame={handleRecordRecentGame}
                onRemoveRecentGame={handleRemoveRecentGame}
                onClearRecentGames={handleClearRecentGames}
              />
            </>
          )}

          {view === 'checkout' && (
            <CheckoutPage
              game={activeGame}
              initialNominalId={preselectedNominalId}
              prefs={prefs}
              isSignedIn={Boolean(userSummary)}
              onBack={() => navigateTo('home')}
              onCreateOrder={handleCreateOrder}
            />
          )}

          {view === 'invoice' && activeOrder && (
            <InvoicePage
              order={activeOrder}
              onBackHome={() => navigateTo('home')}
              onGoTrack={() => navigateTo('track')}
              onUploadProof={handleUploadProof}
              onExpireOrder={handleExpireOrder}
            />
          )}

          {view === 'invoice' && !activeOrder && (
            <TrackOrderPage
              orders={orders}
              onOpenInvoice={handleOpenInvoice}
              onStartShopping={() => navigateTo('home')}
            />
          )}

          {view === 'track' && (
            <TrackOrderPage
              orders={orders}
              onOpenInvoice={handleOpenInvoice}
              onStartShopping={() => navigateTo('home')}
            />
          )}
        </main>

        <Footer onNavigate={navigateTo} onSelectGame={(id) => handleSelectGame(id)} />

        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSignInIntent={() => {
            pendingOwnerAutoEnterRef.current = true;
          }}
          onSignInCancel={() => {
            pendingOwnerAutoEnterRef.current = false;
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
