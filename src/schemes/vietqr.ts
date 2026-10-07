import { type Amount, CURRENCY, formatAmount } from '../amount';
import { QrError } from '../emv/errors';
import { buildPayload, type EmvPayload, type ParseOptions } from '../emv/payload';
import { checkText } from '../text';
import { type DecodedBase, decodeBase, field, GUID, parseFor, template } from './common';

/**
 * VietQR (Vietnam, NAPAS). Merchant account information in tag 38 with GUID A000000727:
 * 01 beneficiary template (00 bank BIN, 01 account or card number), 02 service code
 * (QRIBFTTA to an account, QRIBFTTC to a card). Currency 704 (VND, whole numbers), country VN,
 * transfer message in 62.08.
 */
export interface VietQrOptions {
  /** The bank's 6-digit BIN, e.g. "970436" for Vietcombank. */
  bin: string;
  /** Account number, or card number when `service` is "card". */
  account: string;
  /** Default "account". */
  service?: 'account' | 'card';
  /** Whole dong. */
  amount?: Amount;
  /** Transfer message (62.08), plain ASCII, up to 25 characters. Use asciiFold() to drop Vietnamese accents. */
  purpose?: string;
  /** Optional, unlike other schemes. */
  merchantName?: string;
  city?: string;
}

export interface VietQr extends DecodedBase {
  scheme: 'vietqr';
  bin: string | undefined;
  account: string | undefined;
  service: 'account' | 'card' | 'unknown';
  purpose: string | undefined;
}

const SERVICE = { account: 'QRIBFTTA', card: 'QRIBFTTC' } as const;

/** Generates a VietQR transfer payload. */
export function create(options: VietQrOptions): string {
  const bin = String(options.bin ?? '').trim();
  if (!/^\d{6}$/.test(bin))
    throw new QrError('INVALID_FIELD', `The bank BIN must be 6 digits, got "${bin}"`, { tag: '38.01.00' });
  const account = String(options.account ?? '').replace(/\s/g, '');
  if (!/^[0-9A-Za-z]{1,19}$/.test(account)) {
    throw new QrError('INVALID_FIELD', `The account must be 1-19 letters or digits, got "${options.account}"`, {
      tag: '38.01.01',
    });
  }
  const service = options.service ?? 'account';
  if (service !== 'account' && service !== 'card') {
    throw new QrError('INVALID_FIELD', 'The service must be "account" or "card"', { tag: '38.02' });
  }

  return buildPayload(
    [
      field('00', '01'),
      field('01', options.amount === undefined ? '11' : '12'),
      template('38', [
        field('00', GUID.VIETQR),
        template('01', [field('00', bin), field('01', account)]),
        field('02', SERVICE[service]),
      ]),
      field('53', CURRENCY.VND),
      options.amount === undefined ? undefined : field('54', formatAmount(options.amount, CURRENCY.VND)),
      field('58', 'VN'),
      options.merchantName === undefined
        ? undefined
        : field('59', checkText(options.merchantName, 'merchantName', '59', 25)),
      options.city === undefined ? undefined : field('60', checkText(options.city, 'city', '60', 15)),
      options.purpose === undefined
        ? undefined
        : template('62', [field('08', checkText(options.purpose, 'purpose', '62.08', 25))]),
    ].filter((f) => f !== undefined),
  );
}

/** Decodes a VietQR payload. */
export function decode(input: string | EmvPayload, options?: ParseOptions): VietQr {
  const { payload, account } = parseFor(input, 'vietqr', options);
  const base = decodeBase(payload);
  const beneficiary = account?.fields['01'];
  let bin: string | undefined;
  let accountNumber: string | undefined;
  if (beneficiary) {
    // 01 is itself a template: 00 BIN, 01 account
    let i = 0;
    while (i + 4 <= beneficiary.length) {
      const tag = beneficiary.slice(i, i + 2);
      const len = Number(beneficiary.slice(i + 2, i + 4));
      if (!Number.isInteger(len)) break;
      const value = beneficiary.slice(i + 4, i + 4 + len);
      if (tag === '00') bin = value;
      if (tag === '01') accountNumber = value;
      i += 4 + len;
    }
  }
  const code = account?.fields['02'];
  return {
    scheme: 'vietqr',
    ...base,
    bin,
    account: accountNumber,
    service: code === SERVICE.account ? 'account' : code === SERVICE.card ? 'card' : 'unknown',
    purpose: base.additionalData.purpose,
  };
}
