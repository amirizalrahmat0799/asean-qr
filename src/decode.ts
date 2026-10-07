import { type Amount, formatAmount } from './amount';
import { QrError, type QrWarning } from './emv/errors';
import {
  buildPayload,
  type EmvPayload,
  getTag,
  type ParseOptions,
  parsePayload,
  removeFields,
  setField,
} from './emv/payload';
import { type DecodedBase, decodeBase, detectScheme, field } from './schemes/common';
import { type DuitNowQr, decode as decodeDuitNow } from './schemes/duitnow';
import { decode as decodePayNow, type PayNowQr } from './schemes/paynow';
import { decode as decodePromptPay, type PromptPayQr } from './schemes/promptpay';
import { decode as decodeQris, type QrisQr } from './schemes/qris';
import { decode as decodeVietQr, type VietQr } from './schemes/vietqr';

/** An EMVCo payload from a scheme this library doesn't model; the common fields are still decoded. */
export interface UnknownQr extends DecodedBase {
  scheme: 'unknown';
}

/** Any decoded QR. Narrow on `scheme` to get the scheme's own fields. */
export type DecodedQr = DuitNowQr | PayNowQr | PromptPayQr | QrisQr | VietQr | UnknownQr;

/**
 * Parses, checks and decodes any EMVCo merchant-presented payload, detecting the scheme:
 *
 * ```ts
 * const qr = decode(scanned);
 * if (qr.scheme === 'duitnow') console.log(qr.merchant.name, qr.amount, qr.acquirerId);
 * ```
 * Throws QrError for payloads that can't be paid (bad structure or checksum).
 */
export function decode(payload: string, options?: ParseOptions): DecodedQr {
  const parsed = parsePayload(payload, options);
  switch (detectScheme(parsed)) {
    case 'duitnow':
      return decodeDuitNow(parsed);
    case 'paynow':
      return decodePayNow(parsed);
    case 'promptpay':
      return decodePromptPay(parsed);
    case 'qris':
      return decodeQris(parsed);
    case 'vietqr':
      return decodeVietQr(parsed);
    default:
      return { scheme: 'unknown', ...decodeBase(parsed) };
  }
}

export interface ValidationResult {
  valid: boolean;
  /** The reason it can't be used, when `valid` is false. */
  error: QrError | undefined;
  warnings: QrWarning[];
}

/** Checks a payload without throwing. `valid` means structurally sound with a matching checksum. */
export function validate(payload: string, options?: Omit<ParseOptions, 'verifyCrc'>): ValidationResult {
  try {
    const parsed = parsePayload(payload, options);
    return { valid: true, error: undefined, warnings: parsed.warnings };
  } catch (e) {
    if (e instanceof QrError) return { valid: false, error: e, warnings: [] };
    throw e;
  }
}

/** True when the payload is structurally sound and its checksum matches. */
export function isValid(payload: string): boolean {
  return validate(payload).valid;
}

/**
 * Returns a dynamic copy of any payload with the amount set (point of initiation 12, tag 54), using the
 * currency's rules (whole numbers for IDR and VND). Everything else is kept. For QRIS with a fee, use qris.withAmount.
 */
export function withAmount(payload: string | EmvPayload, amount: Amount): string {
  const parsed = typeof payload === 'string' ? parsePayload(payload) : payload;
  const currency = getTag(parsed, '53');
  if (!currency)
    throw new QrError('MISSING_FIELD', 'The payload has no currency (tag 53), so the amount format is unknown', {
      tag: '53',
    });
  let fields = removeFields(parsed.fields, '63');
  fields = setField(fields, field('01', '12'));
  fields = setField(fields, field('54', formatAmount(amount, currency)));
  return buildPayload(fields);
}
