import type { PaymentMethod } from '../data/payments';
import { ADMIN_WHATSAPP_NUMBER } from '../data/payments';

export interface PriceBreakdown {
  basePrice: number;
  adminFee: number;
  uniqueCode: number;
  totalAmount: number;
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(amount));
}

export function calculateDiscountPercent(originalPrice: number, promoPrice: number): number {
  if (originalPrice <= 0 || promoPrice >= originalPrice) return 0;
  return Math.round(((originalPrice - promoPrice) / originalPrice) * 100);
}

/**
 * Menghasilkan 3 digit kode unik deterministik/semi-acak (101–499) untuk verifikasi Transfer Bank.
 */
export function generateBankUniqueCode(seed?: number): number {
  const value = seed !== undefined ? Math.abs(Math.floor(seed)) : Math.floor(Math.random() * 10000);
  return 101 + (value % 399);
}

export function calculatePaymentTotal(
  basePrice: number,
  method: PaymentMethod,
  bankUniqueCode = 0
): PriceBreakdown {
  const percentFee = Math.round((basePrice * method.feePercent) / 100);
  const adminFee = method.feeFlat + percentFee;
  const uniqueCode = method.usesUniqueCode ? bankUniqueCode : 0;
  const totalAmount = basePrice + adminFee + uniqueCode;
  return { basePrice, adminFee, uniqueCode, totalAmount };
}

export function generateInvoiceId(date = new Date(), randomSeed?: number): string {
  const year = date.getFullYear();
  const num =
    randomSeed !== undefined
      ? Math.abs(Math.floor(randomSeed)) % 90000 + 10000
      : Math.floor(10000 + Math.random() * 90000);
  const suffix = String(num).slice(0, 4);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const c1 = letters[(date.getMinutes() + num) % letters.length];
  const c2 = letters[(date.getSeconds() + num * 3) % letters.length];
  return `ALS-${year}${suffix}${c1}${c2}`;
}

export function validateWhatsAppNumber(input: string): { valid: boolean; normalized: string; error?: string } {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) {
    return { valid: false, normalized: '', error: 'Nomor WhatsApp wajib diisi untuk pengiriman invoice.' };
  }
  if (digits.length < 9 || digits.length > 15) {
    return { valid: false, normalized: digits, error: 'Nomor WhatsApp harus terdiri dari 9–15 digit angka.' };
  }
  if (!digits.startsWith('08') && !digits.startsWith('628') && !digits.startsWith('8')) {
    return { valid: false, normalized: digits, error: 'Gunakan format nomor Indonesia, misal 0812xxxx atau 62812xxxx.' };
  }
  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('8')
      ? `62${digits}`
      : digits;
  return { valid: true, normalized };
}

export function buildAdminWhatsAppUrl(order: {
  invoiceId: string;
  gameName: string;
  itemName: string;
  accountId: string;
  zoneId?: string;
  paymentMethodName: string;
  totalAmount: number;
  whatsapp: string;
  proofFileName?: string;
}): string {
  const targetAccount = order.zoneId ? `${order.accountId} (${order.zoneId})` : order.accountId;
  const lines = [
    'Halo Admin ALSTORE, saya ingin konfirmasi pembayaran pesanan:',
    '',
    `No. Invoice : ${order.invoiceId}`,
    `Game        : ${order.gameName}`,
    `Nominal     : ${order.itemName}`,
    `ID Akun     : ${targetAccount}`,
    `Metode Bayar: ${order.paymentMethodName}`,
    `Total Bayar : ${formatIDR(order.totalAmount)}`,
    `WhatsApp    : ${order.whatsapp}`
  ];

  if (order.proofFileName) {
    lines.push(`Bukti Bayar : ${order.proofFileName} (terlampir)`);
  }

  lines.push('', 'Mohon diproses ya Min. Terima kasih!');

  return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}
