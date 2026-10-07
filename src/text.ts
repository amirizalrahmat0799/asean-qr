import { QrError } from './emv/errors';

/**
 * Removes accents and other non-ASCII characters, e.g. "Thanh toán đơn hàng" becomes "Thanh toan don hang".
 * Payment apps expect plain ASCII in names, cities and references.
 */
export function asciiFold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, '');
}

/** Validates a text field for a QR payload: trimmed, printable ASCII, not empty, within `max` characters. */
export function checkText(value: string, label: string, tag: string, max: number): string {
  const text = String(value ?? '').trim();
  if (!text) throw new QrError('MISSING_FIELD', `${label} is required`, { tag });
  if (!/^[\x20-\x7E]+$/.test(text)) {
    throw new QrError('INVALID_FIELD', `${label} must be plain ASCII; use asciiFold() to remove accents: "${text}"`, {
      tag,
    });
  }
  if (text.length > max) {
    throw new QrError('FIELD_TOO_LONG', `${label} is ${text.length} characters; the maximum is ${max}`, { tag });
  }
  return text;
}
