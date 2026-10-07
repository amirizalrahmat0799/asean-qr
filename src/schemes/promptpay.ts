import { type Amount, CURRENCY, formatAmount } from '../amount';
import { QrError } from '../emv/errors';
import { buildPayload, type EmvPayload, type ParseOptions } from '../emv/payload';
import { checkText } from '../text';
import { type DecodedBase, decodeBase, field, GUID, parseFor, template } from './common';

/**
 * PromptPay (Thailand). Credit transfers use tag 29 with GUID A000000677010111 and one of: 01 mobile
 * ("0066" + number without the leading 0, 13 digits), 02 national or tax ID (13 digits), 03 e-wallet ID (15 digits).
 * Bill payments use tag 30 with GUID A000000677010112: 01 biller ID, 02 reference 1, 03 reference 2.
 * Currency 764 (THB), country TH.
 */
export type PromptPayTarget =
  | { mobile: string; nationalId?: never; eWalletId?: never }
  | { nationalId: string; mobile?: never; eWalletId?: never }
  | { eWalletId: string; mobile?: never; nationalId?: never };

export type PromptPayOptions = PromptPayTarget & {
  amount?: Amount;
};

export interface PromptPayBillOptions {
  /** National ID or tax ID followed by a 2-digit suffix, 15 digits. */
  billerId: string;
  ref1: string;
  ref2?: string;
  amount?: Amount;
  /** Optional, up to 25 characters. */
  merchantName?: string;
}

export type PromptPayQr = DecodedBase & { scheme: 'promptpay' } & (
    | {
        kind: 'transfer';
        target: { type: 'mobile' | 'nationalId' | 'eWallet' | 'bankAccount' | 'unknown'; value: string | undefined };
      }
    | { kind: 'bill'; billerId: string | undefined; ref1: string | undefined; ref2: string | undefined }
  );

/** "081-234-5678", "+66812345678" and "66812345678" all become "0066812345678". */
export function formatMobile(mobile: string): string {
  const digits = String(mobile).replace(/[\s\-()+]/g, '');
  // Decide by length, so a local number is never mistaken for one with the 0066 prefix
  const local =
    digits.length === 13 && digits.startsWith('0066')
      ? digits.slice(4)
      : digits.length === 11 && digits.startsWith('66')
        ? digits.slice(2)
        : digits.length === 10 && digits.startsWith('0')
          ? digits.slice(1)
          : digits;
  // Thai mobile numbers are 0 + 9 digits and start with 06, 08 or 09
  if (!/^[689]\d{8}$/.test(local)) {
    throw new QrError('INVALID_FIELD', `"${mobile}" is not a Thai mobile number`, { tag: '29.01' });
  }
  return `0066${local}`;
}

function digitsOnly(value: string, length: number, label: string, tag: string): string {
  const digits = String(value).replace(/[\s-]/g, '');
  if (!new RegExp(`^\\d{${length}}$`).test(digits)) {
    throw new QrError('INVALID_FIELD', `${label} must be ${length} digits, got "${value}"`, { tag });
  }
  return digits;
}

/** Generates a PromptPay credit transfer QR to a mobile number, national ID or e-wallet. */
export function create(options: PromptPayOptions): string {
  const given = ['mobile', 'nationalId', 'eWalletId'].filter(
    (k) => (options as Record<string, unknown>)[k] !== undefined,
  );
  if (given.length !== 1) {
    throw new QrError('INVALID_FIELD', 'Give exactly one of mobile, nationalId or eWalletId', { tag: '29' });
  }
  const target =
    options.mobile !== undefined
      ? field('01', formatMobile(options.mobile))
      : options.nationalId !== undefined
        ? field('02', digitsOnly(options.nationalId, 13, 'The national ID', '29.02'))
        : field('03', digitsOnly(options.eWalletId as string, 15, 'The e-wallet ID', '29.03'));

  return buildPayload(
    [
      field('00', '01'),
      field('01', options.amount === undefined ? '11' : '12'),
      template('29', [field('00', GUID.PROMPTPAY_TRANSFER), target]),
      field('53', CURRENCY.THB),
      options.amount === undefined ? undefined : field('54', formatAmount(options.amount, CURRENCY.THB)),
      field('58', 'TH'),
    ].filter((f) => f !== undefined),
  );
}

/** Generates a PromptPay bill payment QR (biller ID with references). */
export function billPayment(options: PromptPayBillOptions): string {
  return buildPayload(
    [
      field('00', '01'),
      field('01', options.amount === undefined ? '11' : '12'),
      template('30', [
        field('00', GUID.PROMPTPAY_BILL),
        field('01', digitsOnly(options.billerId, 15, 'The biller ID', '30.01')),
        field('02', checkText(options.ref1, 'ref1', '30.02', 20)),
        options.ref2 === undefined ? undefined : field('03', checkText(options.ref2, 'ref2', '30.03', 20)),
      ]),
      field('53', CURRENCY.THB),
      options.amount === undefined ? undefined : field('54', formatAmount(options.amount, CURRENCY.THB)),
      field('58', 'TH'),
      options.merchantName === undefined
        ? undefined
        : field('59', checkText(options.merchantName, 'merchantName', '59', 25)),
    ].filter((f) => f !== undefined),
  );
}

/** Decodes a PromptPay transfer or bill payment QR. */
export function decode(input: string | EmvPayload, options?: ParseOptions): PromptPayQr {
  const { payload, account } = parseFor(input, 'promptpay', options);
  const base = decodeBase(payload);
  const fields = account?.fields ?? {};
  if (account?.guid?.toUpperCase() === GUID.PROMPTPAY_BILL) {
    return {
      scheme: 'promptpay',
      ...base,
      kind: 'bill',
      billerId: fields['01'],
      ref1: fields['02'],
      ref2: fields['03'],
    };
  }
  const [type, value] =
    fields['01'] !== undefined
      ? (['mobile', fields['01']] as const)
      : fields['02'] !== undefined
        ? (['nationalId', fields['02']] as const)
        : fields['03'] !== undefined
          ? (['eWallet', fields['03']] as const)
          : fields['04'] !== undefined
            ? (['bankAccount', fields['04']] as const)
            : (['unknown', undefined] as const);
  return { scheme: 'promptpay', ...base, kind: 'transfer', target: { type, value } };
}
