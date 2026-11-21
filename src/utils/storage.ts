import type { User } from 'firebase/auth';
import {
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  handleFirestoreError,
  OperationType,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from '../lib/firebase';
import type { SavedGameAccount, ThemeId, TopUpOrder, UserPreferences } from '../types/store';

const THEME_STORAGE_KEY = 'alstore_theme_v1';
const ORDERS_STORAGE_KEY = 'alstore_orders_v1';
const PREFS_STORAGE_KEY = 'alstore_prefs_v1';

const VALID_THEMES: ThemeId[] = ['obsidian', 'pearl', 'cyber', 'emerald'];

export function loadSavedTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
    if (raw && VALID_THEMES.includes(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return 'obsidian';
}

export function saveTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function applyThemeToDocument(theme: ThemeId): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (theme === 'pearl') {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }
}

export function loadLocalOrders(): TopUpOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TopUpOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalOrders(orders: TopUpOrder[]): void {
  try {
    // Strip large inline base64 previews beyond the 5 most recent orders to keep localStorage lean
    const compacted = orders.slice(0, 40).map((order, idx) =>
      idx >= 5 ? { ...order, proofPreviewDataUrl: undefined } : order
    );
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(compacted));
  } catch {
    // ignore quota errors
  }
}

export function loadLocalPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { whatsapp: '', savedAccounts: {} };
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      whatsapp: typeof parsed.whatsapp === 'string' ? parsed.whatsapp : '',
      savedAccounts: parsed.savedAccounts && typeof parsed.savedAccounts === 'object' ? parsed.savedAccounts : {}
    };
  } catch {
    return { whatsapp: '', savedAccounts: {} };
  }
}

export function saveLocalPrefs(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

function clampString(val: string, max: number): string {
  return val.trim().slice(0, max);
}

/**
 * Ensures the signed-in user's Firestore profile document exists and fetches saved preferences & orders.
 */
export async function syncUserFromFirestore(
  user: User,
  fallbackWhatsapp = ''
): Promise<{ prefs: UserPreferences; orders: TopUpOrder[] }> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  let whatsapp = clampString(fallbackWhatsapp, 20);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: clampString(user.displayName || user.email?.split('@')[0] || 'Member ALSTORE', 100),
        email: clampString(user.email || 'user@alstore.id', 200),
        photoURL: clampString(user.photoURL || '', 500),
        whatsapp,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const data = snap.data();
      if (typeof data.whatsapp === 'string' && data.whatsapp.length > 0) {
        whatsapp = data.whatsapp;
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  // Fetch saved game accounts
  const savedAccounts: Record<string, SavedGameAccount> = {};
  const accountsPath = `users/${user.uid}/savedAccounts`;
  try {
    const qAccounts = query(
      collection(db, 'users', user.uid, 'savedAccounts'),
      where('ownerUid', '==', user.uid)
    );
    const accSnap = await getDocs(qAccounts);
    accSnap.forEach((docItem) => {
      const d = docItem.data();
      savedAccounts[docItem.id] = {
        gameId: String(d.gameId || docItem.id),
        gameName: String(d.gameName || ''),
        accountId: String(d.accountId || ''),
        zoneId: String(d.zoneId || ''),
        updatedAtMs: Date.now()
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, accountsPath);
  }

  // Fetch user's orders
  const orders: TopUpOrder[] = [];
  const ordersPath = 'orders';
  try {
    const qOrders = query(collection(db, 'orders'), where('ownerUid', '==', user.uid));
    const ordSnap = await getDocs(qOrders);
    ordSnap.forEach((docItem) => {
      const d = docItem.data();
      const createdAtMs =
        d.createdAt && typeof d.createdAt.toMillis === 'function'
          ? d.createdAt.toMillis()
          : Number(d.expiresAtMs || Date.now()) - 15 * 60 * 1000;
      orders.push({
        invoiceId: String(d.invoiceId || docItem.id),
        ownerUid: String(d.ownerUid || user.uid),
        gameId: String(d.gameId || ''),
        gameName: String(d.gameName || ''),
        itemName: String(d.itemName || ''),
        accountId: String(d.accountId || ''),
        zoneId: String(d.zoneId || ''),
        whatsapp: String(d.whatsapp || ''),
        paymentMethodId: String(d.paymentMethodId || 'qris'),
        paymentMethodName: String(d.paymentMethodName || 'QRIS'),
        basePrice: Number(d.basePrice || 0),
        adminFee: Number(d.adminFee || 0),
        uniqueCode: Number(d.uniqueCode || 0),
        totalAmount: Number(d.totalAmount || 0),
        status: (d.status as TopUpOrder['status']) || 'pending',
        proofFileName: String(d.proofFileName || ''),
        createdAtMs,
        expiresAtMs: Number(d.expiresAtMs || Date.now())
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, ordersPath);
  }

  orders.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return { prefs: { whatsapp, savedAccounts }, orders };
}

export async function saveOrderToFirestore(user: User, order: TopUpOrder): Promise<void> {
  const path = `orders/${order.invoiceId}`;
  try {
    await setDoc(doc(db, 'orders', order.invoiceId), {
      invoiceId: clampString(order.invoiceId, 40),
      ownerUid: user.uid,
      gameId: clampString(order.gameId, 64),
      gameName: clampString(order.gameName, 100),
      itemName: clampString(order.itemName, 120),
      accountId: clampString(order.accountId, 64),
      zoneId: clampString(order.zoneId, 32),
      whatsapp: clampString(order.whatsapp, 20),
      paymentMethodId: clampString(order.paymentMethodId, 40),
      paymentMethodName: clampString(order.paymentMethodName, 80),
      basePrice: Number(order.basePrice),
      adminFee: Number(order.adminFee),
      uniqueCode: Number(order.uniqueCode),
      totalAmount: Number(order.basePrice + order.adminFee + order.uniqueCode),
      status: 'pending',
      proofFileName: '',
      expiresAtMs: Number(order.expiresAtMs),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateOrderProofInFirestore(
  invoiceId: string,
  proofFileName: string
): Promise<void> {
  const path = `orders/${invoiceId}`;
  try {
    await updateDoc(doc(db, 'orders', invoiceId), {
      status: 'waiting_verification',
      proofFileName: clampString(proofFileName, 160),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveUserAutofillToFirestore(
  user: User,
  whatsapp: string,
  account: SavedGameAccount
): Promise<void> {
  const userPath = `users/${user.uid}`;
  try {
    await updateDoc(doc(db, 'users', user.uid), {
      whatsapp: clampString(whatsapp, 20),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  const accPath = `users/${user.uid}/savedAccounts/${account.gameId}`;
  try {
    await setDoc(doc(db, 'users', user.uid, 'savedAccounts', account.gameId), {
      ownerUid: user.uid,
      gameId: clampString(account.gameId, 64),
      gameName: clampString(account.gameName, 100),
      accountId: clampString(account.accountId, 64),
      zoneId: clampString(account.zoneId, 32),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, accPath);
  }
}
