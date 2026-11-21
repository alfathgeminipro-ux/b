export type ThemeId = 'obsidian' | 'pearl' | 'cyber' | 'emerald';

export type OrderStatus = 'pending' | 'waiting_verification' | 'completed' | 'expired';

export interface SavedGameAccount {
  gameId: string;
  gameName: string;
  accountId: string;
  zoneId: string;
  updatedAtMs: number;
}

export interface TopUpOrder {
  invoiceId: string;
  ownerUid?: string;
  gameId: string;
  gameName: string;
  itemName: string;
  accountId: string;
  zoneId: string;
  whatsapp: string;
  paymentMethodId: string;
  paymentMethodName: string;
  basePrice: number;
  adminFee: number;
  uniqueCode: number;
  totalAmount: number;
  status: OrderStatus;
  proofFileName: string;
  proofPreviewDataUrl?: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface UserPreferences {
  whatsapp: string;
  savedAccounts: Record<string, SavedGameAccount>;
}

export interface AuthUserSummary {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  providerId: string;
}
