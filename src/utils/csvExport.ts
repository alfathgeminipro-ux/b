import type { OrderStatus, TopUpOrder } from '../types/store';

export interface TransactionCsvRow extends TopUpOrder {
  invoiceType?: string;
  customerEmail?: string | null;
  confirmedByName?: string | null;
}

/**
 * Escapes a single CSV field (RFC-4180) and neutralizes spreadsheet formula injection prefixes
 * (=, +, -, @, tab, CR) so exported reports open safely in Excel and Google Sheets.
 */
export function escapeCsvCell(value: unknown): string {
  let text = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatOrderStatusCsvLabel(status: OrderStatus): string {
  switch (status) {
    case 'completed':
      return 'Selesai';
    case 'waiting_verification':
      return 'Menunggu Verifikasi';
    case 'pending':
      return 'Menunggu Bayar';
    case 'expired':
      return 'Kedaluwarsa';
    default:
      return status;
  }
}

export function buildTransactionsCsv(orders: readonly TransactionCsvRow[]): string {
  const headers = [
    'Nomor Invoice',
    'Tipe Invoice',
    'Waktu Dibuat (ISO)',
    'Game',
    'Produk / Nominal',
    'ID Akun Game',
    'Zone / Server',
    'WhatsApp',
    'Email Pelanggan',
    'Metode Pembayaran',
    'Harga Dasar (IDR)',
    'Biaya Admin (IDR)',
    'Kode Unik (IDR)',
    'Total (IDR)',
    'Status',
    'Bukti Pembayaran',
    'Dikonfirmasi Oleh'
  ];

  const rows = orders.map((ord) =>
    [
      ord.invoiceId,
      ord.invoiceType || 'topup',
      new Date(ord.createdAtMs).toISOString(),
      ord.gameName,
      ord.itemName,
      ord.accountId,
      ord.zoneId || '',
      ord.whatsapp || '',
      ord.customerEmail || '',
      ord.paymentMethodName,
      Math.max(0, Math.round(Number(ord.basePrice) || 0)),
      Math.max(0, Math.round(Number(ord.adminFee) || 0)),
      Math.max(0, Math.round(Number(ord.uniqueCode) || 0)),
      Math.max(0, Math.round(Number(ord.totalAmount) || 0)),
      formatOrderStatusCsvLabel(ord.status),
      ord.proofFileName || '',
      ord.confirmedByName || ''
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}

export function buildCsvFilename(prefix: string, nowMs = Date.now()): string {
  const safePrefix = prefix.replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const datePart = new Date(nowMs).toISOString().slice(0, 10);
  return `${safePrefix || 'export'}-${datePart}.csv`;
}

export function downloadCsvFile(filename: string, csvContent: string): void {
  const withBom = csvContent.startsWith('\uFEFF') ? csvContent : `\uFEFF${csvContent}`;
  const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
