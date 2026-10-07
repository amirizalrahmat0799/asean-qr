import { currencyAlpha } from '../amount';
import { QrError } from '../emv/errors';
import { type EmvPayload, getTag, type ParseOptions, parsePayload } from '../emv/payload';
import type { EmvField } from '../emv/tlv';
import { checkText } from '../text';
import { GUID, guidInfo, type SchemeId } from './guids';

/** Optional fields of the additional data template (62). All plain ASCII, at most 25 characters. */
export interface AdditionalData {
  billNumber?: string;
  mobileNumber?: string;
  storeLabel?: string;
  loyaltyNumber?: string;
  referenceLabel?: string;
  customerLabel?: string;
  terminalLabel?: string;
  purpose?: string;
}

const ADDITIONAL_TAGS: Record<keyof AdditionalData, string> = {
  billNumber: '01',
  mobileNumber: '02',
  storeLabel: '03',
  loyaltyNumber: '04',
  referenceLabel: '05',
  customerLabel: '06',
  terminalLabel: '07',
  purpose: '08',
};

/** One merchant account template (tags 26-51), e.g. the DuitNow or PayNow block. */
export interface MerchantAccount {
  tag: string;
  guid: string | undefined;
  /** What the GUID means, e.g. "PayNow Singapore". */
  label: string | undefined;
  scheme: SchemeId | undefined;
  /** Sub-tag values keyed by sub-tag, e.g. `{ '00': 'SG.PAYNOW', '01': '2', ... }`. */
  fields: Record<string, string>;
}

/** What every decoded QR has, whatever the scheme. Amounts are strings exactly as in the payload ("10.00"). */
export interface DecodedBase {
  /** Two-letter country code (tag 58). */
  country: string | undefined;
  /** ISO 4217 alpha code for the supported currencies (MYR, SGD, THB, IDR, VND), else undefined. */
  currency: string | undefined;
  /** ISO 4217 numeric code as in the payload (tag 53), e.g. "458". */
  currencyCode: string | undefined;
  amount: string | undefined;
  /** True for a one-time QR (point of initiation 12), false for a reusable one (11 or absent). */
  dynamic: boolean;
  merchant: {
    name: string | undefined;
    city: string | undefined;
    postalCode: string | undefined;
    category: string | undefined;
  };
  additionalData: AdditionalData;
  /** Every merchant account template, in payload order. A QR can carry several (e.g. SGQR). */
  accounts: MerchantAccount[];
  /** The full parsed payload, for anything not surfaced above. */
  payload: EmvPayload;
}

export function readAccounts(payload: EmvPayload): MerchantAccount[] {
  return payload.fields
    .filter((f) => Number(f.tag) >= 26 && Number(f.tag) <= 51 && f.children)
    .map((f) => {
      const fields = Object.fromEntries((f.children ?? []).map((c) => [c.tag, c.value]));
      const guid = fields['00'];
      const info = guidInfo(guid);
      return { tag: f.tag, guid, label: info?.label, scheme: info?.scheme, fields };
    });
}

/** The scheme a payload belongs to, by its merchant account GUIDs. QRIS also counts when only an acquirer GUID and ID country are present. */
export function detectScheme(payload: EmvPayload): SchemeId | undefined {
  const accounts = readAccounts(payload);
  const order: SchemeId[] = ['duitnow', 'paynow', 'promptpay', 'vietqr', 'qris'];
  for (const scheme of order) {
    if (accounts.some((a) => a.scheme === scheme)) return scheme;
  }
  if (getTag(payload, '58') === 'ID' && accounts.some((a) => a.label === 'QRIS acquirer')) return 'qris';
  return undefined;
}

export function decodeBase(payload: EmvPayload): DecodedBase {
  const additional = payload.fields.find((f) => f.tag === '62')?.children ?? [];
  const additionalData: AdditionalData = {};
  for (const [key, tag] of Object.entries(ADDITIONAL_TAGS) as [keyof AdditionalData, string][]) {
    const value = additional.find((c) => c.tag === tag)?.value;
    if (value !== undefined) additionalData[key] = value;
  }
  const currencyCode = getTag(payload, '53');
  return {
    country: getTag(payload, '58'),
    currency: currencyAlpha(currencyCode),
    currencyCode,
    amount: getTag(payload, '54'),
    dynamic: getTag(payload, '01') === '12',
    merchant: {
      name: getTag(payload, '59'),
      city: getTag(payload, '60'),
      postalCode: getTag(payload, '61'),
      category: getTag(payload, '52'),
    },
    additionalData,
    accounts: readAccounts(payload),
    payload,
  };
}

/** Parses a payload and checks it belongs to `scheme`; returns the parsed payload and its account for that scheme. */
export function parseFor(
  input: string | EmvPayload,
  scheme: SchemeId,
  options?: ParseOptions,
): { payload: EmvPayload; account: MerchantAccount | undefined } {
  const payload = typeof input === 'string' ? parsePayload(input, options) : input;
  const found = detectScheme(payload);
  if (found !== scheme) {
    throw new QrError(
      'WRONG_SCHEME',
      `Not a ${SCHEME_NAMES[scheme]} QR${found ? ` (it is ${SCHEME_NAMES[found]})` : ''}`,
    );
  }
  return { payload, account: readAccounts(payload).find((a) => a.scheme === scheme) };
}

export const SCHEME_NAMES: Record<SchemeId, string> = {
  duitnow: 'DuitNow',
  paynow: 'PayNow',
  promptpay: 'PromptPay',
  qris: 'QRIS',
  vietqr: 'VietQR',
};

// --- building -----------------------------------------------------------------------------------

export function field(tag: string, value: string): EmvField {
  return { tag, value };
}

export function template(tag: string, children: (EmvField | undefined)[]): EmvField {
  return { tag, value: '', children: children.filter((c): c is EmvField => c !== undefined) };
}

/** The additional data template (62), or undefined when there is nothing to put in it. */
export function additionalDataField(data: AdditionalData | undefined): EmvField | undefined {
  if (!data) return undefined;
  const children: EmvField[] = [];
  for (const [key, tag] of Object.entries(ADDITIONAL_TAGS) as [keyof AdditionalData, string][]) {
    const value = data[key];
    if (value !== undefined && value !== '') children.push(field(tag, checkText(value, key, `62.${tag}`, 25)));
  }
  return children.length ? template('62', children) : undefined;
}

export { GUID };
