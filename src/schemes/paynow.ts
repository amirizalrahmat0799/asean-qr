import { type Amount, CURRENCY, formatAmount } from '../amount';
import { QrError } from '../emv/errors';
import { buildPayload, type EmvPayload, type ParseOptions } from '../emv/payload';
import { checkText } from '../text';
import {
  type AdditionalData,
  additionalDataField,
  type DecodedBase,
  decodeBase,
  field,
  GUID,
  parseFor,
  template,
} from './common';

/**
 * PayNow (Singapore). Merchant account information in tag 26 with GUID "SG.PAYNOW":
 * 01 proxy type (0 mobile, 2 UEN), 02 proxy value, 03 amount editable (1/0), 04 expiry (YYYYMMDD).
 * Currency 702 (SGD), country SG.
 */
export type PayNowProxy = { mobile: string; uen?: never } | { uen: string; mobile?: never };

export type PayNowOptions = PayNowProxy & {
  amount?: Amount;
  /** Whether the payer may change the amount. Default: true without an amount, false with one. */
  editable?: boolean;
  /** Last day the QR can be paid, as a Date (local date is used) or "YYYYMMDD". */
  expiry?: Date | string;
  /** Shown in the payer's app and on the recipient's statement; goes in tag 62.01. Up to 25 characters. */
  reference?: string;
  /** Default "NA", which PayNow apps replace with the registered name. */
  merchantName?: string;
  /** Default "Singapore". */
  city?: string;
  additionalData?: Omit<AdditionalData, 'billNumber'>;
};

export interface PayNowQr extends DecodedBase {
  scheme: 'paynow';
  proxyType: 'mobile' | 'uen' | 'unknown';
  /** "+6591234567" for mobile, the UEN for businesses. */
  proxyValue: string | undefined;
  editable: boolean;
  /** "YYYYMMDD" when the QR expires. */
  expiry: string | undefined;
  reference: string | undefined;
}

/** "9123 4567", "6591234567" and "+65 9123 4567" all become "+6591234567". */
export function normalizeMobile(mobile: string): string {
  const digits = String(mobile).replace(/[\s\-()]/g, '');
  const local = digits.replace(/^\+?65(?=\d{8}$)/, '');
  if (!/^[3689]\d{7}$/.test(local)) {
    throw new QrError('INVALID_FIELD', `"${mobile}" is not a Singapore mobile number`, { tag: '26.02' });
  }
  return `+65${local}`;
}

function normalizeUen(uen: string): string {
  const value = String(uen).trim().toUpperCase();
  if (!/^[0-9A-Z]{9,10}$/.test(value)) {
    throw new QrError('INVALID_FIELD', `"${uen}" is not a valid UEN (9 or 10 letters and digits)`, { tag: '26.02' });
  }
  return value;
}

function formatExpiry(expiry: Date | string): string {
  if (expiry instanceof Date) {
    if (Number.isNaN(expiry.getTime()))
      throw new QrError('INVALID_FIELD', 'The expiry date is invalid', { tag: '26.04' });
    return `${expiry.getFullYear()}${String(expiry.getMonth() + 1).padStart(2, '0')}${String(expiry.getDate()).padStart(2, '0')}`;
  }
  const text = String(expiry).replace(/-/g, '');
  if (!/^\d{8}$/.test(text))
    throw new QrError('INVALID_FIELD', 'The expiry must be a Date or "YYYYMMDD"', { tag: '26.04' });
  return text;
}

/** Generates a PayNow QR payload for a mobile number or a UEN. */
export function create(options: PayNowOptions): string {
  const hasMobile = options.mobile !== undefined;
  const hasUen = options.uen !== undefined;
  if (hasMobile === hasUen) {
    throw new QrError('INVALID_FIELD', 'Give exactly one of mobile or uen', { tag: '26.02' });
  }
  const proxy = hasMobile ? normalizeMobile(options.mobile as string) : normalizeUen(options.uen as string);
  const editable = options.editable ?? options.amount === undefined;
  const reference =
    options.reference === undefined ? undefined : checkText(options.reference, 'reference', '62.01', 25);

  return buildPayload(
    [
      field('00', '01'),
      field('01', options.amount === undefined ? '11' : '12'),
      template('26', [
        field('00', GUID.PAYNOW),
        field('01', hasMobile ? '0' : '2'),
        field('02', proxy),
        field('03', editable ? '1' : '0'),
        options.expiry === undefined ? undefined : field('04', formatExpiry(options.expiry)),
      ]),
      field('52', '0000'),
      field('53', CURRENCY.SGD),
      options.amount === undefined ? undefined : field('54', formatAmount(options.amount, CURRENCY.SGD)),
      field('58', 'SG'),
      field('59', checkText(options.merchantName ?? 'NA', 'merchantName', '59', 25)),
      field('60', checkText(options.city ?? 'Singapore', 'city', '60', 15)),
      additionalDataField({ ...options.additionalData, ...(reference === undefined ? {} : { billNumber: reference }) }),
    ].filter((f) => f !== undefined),
  );
}

/** Decodes a PayNow QR (including PayNow inside a multi-scheme SGQR). */
export function decode(input: string | EmvPayload, options?: ParseOptions): PayNowQr {
  const { payload, account } = parseFor(input, 'paynow', options);
  const base = decodeBase(payload);
  const type = account?.fields['01'];
  return {
    scheme: 'paynow',
    ...base,
    proxyType: type === '0' ? 'mobile' : type === '2' ? 'uen' : 'unknown',
    proxyValue: account?.fields['02'],
    editable: account?.fields['03'] !== '0',
    expiry: account?.fields['04'],
    reference: base.additionalData.billNumber,
  };
}
