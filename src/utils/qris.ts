/**
 * ALSTORE — Modul Konverter Static QRIS ke Dynamic QRIS (Standar EMVCo + CRC16-CCITT)
 *
 * Payload QRIS resmi merchant (TOKO SEMBAKO EPEP · NMID: ID1024360748064) telah
 * dikonfigurasi aktif. Setiap transaksi otomatis dikonversi menjadi Dynamic QRIS
 * dengan nominal tagihan terisi otomatis saat pembeli melakukan scan, sehingga saldo
 * langsung masuk ke rekening QRIS merchant tersebut.
 */
export const STATIC_QRIS_PAYLOAD =
  '00020101021126570011ID.DANA.WWW011893600915379567025402097956702540303UMI51440014ID.CO.QRIS.WWW0215ID10243607480640303UMI5204594553033605802ID5917TOKO SEMBAKO EPEP6015Kota Jakarta Ti61051335063044936';

export const MERCHANT_QRIS_INFO = {
  merchantName: 'TOKO SEMBAKO EPEP',
  nmid: 'ID1024360748064',
  terminalId: 'A01',
  printedBy: '93600915',
  imagePath: '/qris-alstore.jpg',
  fallbackImagePath: '/assets/aistudio/WhatsApp_Image_2026-11-21_at_23.46.30_2b68ac8f.jpeg'
} as const;

/**
 * Menghitung checksum CRC-16/CCITT-FALSE (Polynomial 0x1021, Init 0xFFFF)
 * sesuai spesifikasi EMVCo Merchant-Presented QR Code.
 */
export function calculateCRC16CCITT(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

interface TlvField {
  tag: string;
  value: string;
}

/**
 * Mem-parse string EMVCo TLV (Tag-Length-Value) tingkat root secara presisi.
 */
export function parseEmvTlv(payload: string): TlvField[] {
  const fields: TlvField[] = [];
  let cursor = 0;
  const trimmed = payload.trim();

  while (cursor + 4 <= trimmed.length) {
    const tag = trimmed.slice(cursor, cursor + 2);
    const lenStr = trimmed.slice(cursor + 2, cursor + 4);
    const length = Number.parseInt(lenStr, 10);

    if (Number.isNaN(length) || length < 0 || cursor + 4 + length > trimmed.length) {
      throw new Error(`Invalid EMVCo TLV field at offset ${cursor}`);
    }

    const value = trimmed.slice(cursor + 4, cursor + 4 + length);
    fields.push({ tag, value });
    cursor += 4 + length;
  }

  if (cursor !== trimmed.length) {
    throw new Error('Malformed trailing bytes in EMVCo QRIS payload');
  }

  return fields;
}

function serializeTlvField(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Mengonversi Static QRIS payload menjadi Dynamic QRIS dengan nominal transaksi (Tag 54)
 * dan checksum CRC16-CCITT (Tag 63) yang valid.
 */
export function convertStaticToDynamicQRIS(staticPayload: string, amountIdr: number): string {
  const cleanPayload = staticPayload.trim();
  if (!cleanPayload) {
    throw new Error('STATIC_QRIS_PAYLOAD kosong');
  }

  const roundedAmount = Math.round(amountIdr);
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    throw new Error('Nominal pembayaran harus lebih besar dari 0');
  }

  const fields = parseEmvTlv(cleanPayload);
  const hasPayloadFormat = fields.some((f) => f.tag === '00');
  if (!hasPayloadFormat) {
    throw new Error('Payload QRIS tidak memiliki Tag 00 (Payload Format Indicator)');
  }

  const amountStr = String(roundedAmount);
  const rebuilt: TlvField[] = [];
  let insertedAmount = false;

  for (const field of fields) {
    // Abaikan CRC lama (Tag 63) karena akan dihitung ulang
    if (field.tag === '63') {
      continue;
    }

    // Ubah Point of Initiation Method dari 11 (Static) -> 12 (Dynamic)
    if (field.tag === '01') {
      rebuilt.push({ tag: '01', value: '12' });
      continue;
    }

    // Hapus Tag 54 lama jika sudah ada, akan disisipkan ulang dengan nominal terbaru
    if (field.tag === '54') {
      continue;
    }

    // Sisipkan Tag 54 tepat sebelum Tag 58 (Country Code) sesuai urutan standar EMVCo
    if (field.tag === '58' && !insertedAmount) {
      rebuilt.push({ tag: '54', value: amountStr });
      insertedAmount = true;
    }

    rebuilt.push(field);
  }

  if (!insertedAmount) {
    rebuilt.push({ tag: '54', value: amountStr });
  }

  const bodyWithoutCrc =
    rebuilt.map((f) => serializeTlvField(f.tag, f.value)).join('') + '6304';
  const crc = calculateCRC16CCITT(bodyWithoutCrc);
  return `${bodyWithoutCrc}${crc}`;
}

/**
 * Mengecek apakah string payload memiliki CRC16 yang valid.
 */
export function verifyQrisCRC(payload: string): boolean {
  const clean = payload.trim();
  if (clean.length < 8) return false;
  const tagIdx = clean.length - 8;
  if (clean.slice(tagIdx, tagIdx + 4) !== '6304') return false;
  const body = clean.slice(0, clean.length - 4);
  const expected = clean.slice(clean.length - 4).toUpperCase();
  return calculateCRC16CCITT(body) === expected;
}
