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
 * DuitNow QR (Malaysia, PayNet). Merchant account information in tag 26 with GUID A0000006150001:
 * 01 acquirer ID, 02 merchant or recipient ID. Currency 458 (MYR), country MY, payload format version 02.
 */
export interface DuitNowOptions {
  /** The acquiring bank's ID, as issued by PayNet (e.g. "501664"). */
  acquirerId: string;
  /** The merchant or recipient ID registered with the acquirer. */
  merchantId: string;
  /** Up to 25 characters, shown to the payer. */
  merchantName: string;
  /** Up to 15 characters. */
  city: string;
  /** ISO 18245 merchant category code. Default "0000" (person to person). */
  mcc?: string;
  postalCode?: string;
  /** Omit for a QR where the payer types the amount. */
  amount?: Amount;
  /** Mark as a one-time QR (point of initiation 12). Default: false, as in PayNet's examples, even with an amount. */
  dynamic?: boolean;
  additionalData?: AdditionalData;
}

export interface DuitNowQr extends DecodedBase {
  scheme: 'duitnow';
  acquirerId: string | undefined;
  merchantId: string | undefined;
}

/** Generates a DuitNow QR payload. */
export function create(options: DuitNowOptions): string {
  const acquirerId = String(options.acquirerId ?? '').trim();
  if (!/^\d{1,11}$/.test(acquirerId)) {
    throw new QrError('INVALID_FIELD', `The acquirer ID must be digits, got "${acquirerId}"`, { tag: '26.01' });
  }
  const merchantId = checkText(options.merchantId, 'merchantId', '26.02', 40);
  const mcc = options.mcc ?? '0000';
  if (!/^\d{4}$/.test(mcc)) throw new QrError('INVALID_FIELD', 'The MCC must be 4 digits', { tag: '52' });

  return buildPayload(
    [
      field('00', '02'),
      field('01', options.dynamic ? '12' : '11'),
      template('26', [field('00', GUID.DUITNOW), field('01', acquirerId), field('02', merchantId)]),
      field('52', mcc),
      field('53', CURRENCY.MYR),
      options.amount === undefined ? undefined : field('54', formatAmount(options.amount, CURRENCY.MYR)),
      field('58', 'MY'),
      field('59', checkText(options.merchantName, 'merchantName', '59', 25)),
      field('60', checkText(options.city, 'city', '60', 15)),
      options.postalCode === undefined ? undefined : field('61', checkText(options.postalCode, 'postalCode', '61', 10)),
      additionalDataField(options.additionalData),
    ].filter((f) => f !== undefined),
  );
}

/** Decodes a DuitNow QR. Throws QrError('WRONG_SCHEME') for other schemes. */
export function decode(input: string | EmvPayload, options?: ParseOptions): DuitNowQr {
  const { payload, account } = parseFor(input, 'duitnow', options);
  return {
    scheme: 'duitnow',
    ...decodeBase(payload),
    acquirerId: account?.fields['01'],
    merchantId: account?.fields['02'],
  };
}
