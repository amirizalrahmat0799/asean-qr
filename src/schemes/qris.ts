import { type Amount, CURRENCY, formatAmount } from '../amount';
import { QrError } from '../emv/errors';
import { buildPayload, type EmvPayload, type ParseOptions, removeFields, setField } from '../emv/payload';
import { type DecodedBase, decodeBase, field, GUID, type MerchantAccount, parseFor } from './common';

/**
 * QRIS (Indonesia, Bank Indonesia). A merchant's QRIS is issued by its acquirer, so this module decodes QRIS and
 * turns a merchant's static QRIS into a dynamic one with an amount, which is how QRIS is used at checkout.
 * Tag 51 with GUID ID.CO.QRIS.WWW holds the national merchant ID (NMID, sub-tag 02) and merchant criteria (03);
 * acquirer templates (26-45) hold the merchant PAN (01), merchant ID (02) and criteria (03). Currency 360 (IDR).
 */
export interface QrisQr extends DecodedBase {
  scheme: 'qris';
  /** National Merchant ID, e.g. "ID1020000000001". */
  nmid: string | undefined;
  /** UMI (micro), UKE (small), UME (medium), UBE (large) or URE (regular). */
  merchantCriteria: string | undefined;
  /** Acquirer templates: who processes the payment, with the merchant PAN and ID at that acquirer. */
  acquirers: {
    tag: string;
    guid: string | undefined;
    merchantPan: string | undefined;
    merchantId: string | undefined;
  }[];
  /** The fee added on top of the amount, if the QR asks for one. */
  fee:
    | { type: 'payer-tip' }
    | { type: 'fixed'; amount: string | undefined }
    | { type: 'percent'; percent: string | undefined }
    | undefined;
}

export interface QrisAmountOptions {
  /** A convenience fee the payer pays on top: a fixed rupiah amount or a percentage (e.g. 0.7 for 0.7%). */
  fee?: { fixed: Amount; percent?: never } | { percent: number | string; fixed?: never };
}

function isAcquirer(a: MerchantAccount): boolean {
  return Number(a.tag) <= 45 && a.guid?.toUpperCase() !== GUID.QRIS;
}

/** Decodes a QRIS payload, static or dynamic. */
export function decode(input: string | EmvPayload, options?: ParseOptions): QrisQr {
  const { payload } = parseFor(input, 'qris', options);
  const base = decodeBase(payload);
  const national = base.accounts.find((a) => a.guid?.toUpperCase() === GUID.QRIS);
  const tip = base.payload.fields.find((f) => f.tag === '55')?.value;
  const fee =
    tip === '01'
      ? ({ type: 'payer-tip' } as const)
      : tip === '02'
        ? ({ type: 'fixed', amount: base.payload.fields.find((f) => f.tag === '56')?.value } as const)
        : tip === '03'
          ? ({ type: 'percent', percent: base.payload.fields.find((f) => f.tag === '57')?.value } as const)
          : undefined;
  return {
    scheme: 'qris',
    ...base,
    nmid: national?.fields['02'],
    merchantCriteria: national?.fields['03'] ?? base.accounts.find(isAcquirer)?.fields['03'],
    acquirers: base.accounts
      .filter(isAcquirer)
      .map((a) => ({ tag: a.tag, guid: a.guid, merchantPan: a.fields['01'], merchantId: a.fields['02'] })),
    fee,
  };
}

/**
 * Turns a merchant's static QRIS into a dynamic one for a specific amount (whole rupiah), optionally with a
 * convenience fee. Everything else in the merchant's QRIS is kept as issued.
 */
export function withAmount(input: string | EmvPayload, amount: Amount, options: QrisAmountOptions = {}): string {
  const { payload } = parseFor(input, 'qris');
  let fields = removeFields(payload.fields, '55', '56', '57', '63');
  fields = setField(fields, field('01', '12'));
  fields = setField(fields, field('54', formatAmount(amount, CURRENCY.IDR)));
  if (options.fee) {
    if (options.fee.fixed !== undefined) {
      fields = setField(fields, field('55', '02'));
      fields = setField(fields, field('56', formatAmount(options.fee.fixed, CURRENCY.IDR)));
    } else {
      const percent = String(options.fee.percent).trim();
      if (!/^\d{1,2}(\.\d{1,2})?$/.test(percent) || Number(percent) <= 0 || Number(percent) >= 100) {
        throw new QrError('INVALID_FIELD', `The fee percentage must be between 0 and 100, got "${percent}"`, {
          tag: '57',
        });
      }
      fields = setField(fields, field('55', '03'));
      fields = setField(fields, field('57', percent));
    }
  }
  return buildPayload(fields);
}
