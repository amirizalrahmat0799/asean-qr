/** Payment schemes the library understands. */
export type SchemeId = 'duitnow' | 'paynow' | 'promptpay' | 'qris' | 'vietqr';

export interface GuidInfo {
  scheme?: SchemeId;
  label: string;
  /** Names of the sub-tags inside this merchant account template. */
  subTags?: Record<string, string>;
  /** Templates nested inside a sub-tag, e.g. VietQR's beneficiary (01) holding the bank BIN and account. */
  nested?: Record<string, Record<string, string>>;
}

export const GUID = {
  DUITNOW: 'A0000006150001',
  PAYNOW: 'SG.PAYNOW',
  PROMPTPAY_TRANSFER: 'A000000677010111',
  PROMPTPAY_TRANSFER_OTA: 'A000000677010114',
  PROMPTPAY_BILL: 'A000000677010112',
  QRIS: 'ID.CO.QRIS.WWW',
  VIETQR: 'A000000727',
  SGQR: 'SG.SGQR',
} as const;

const PROMPTPAY_TRANSFER_TAGS = {
  '01': 'Mobile number',
  '02': 'National ID or tax ID',
  '03': 'e-Wallet ID',
  '04': 'Bank account',
};

/** Keyed by upper-case GUID. */
const KNOWN_GUIDS: Record<string, GuidInfo> = {
  [GUID.DUITNOW]: {
    scheme: 'duitnow',
    label: 'DuitNow, PayNet Malaysia',
    subTags: { '01': 'Acquirer ID', '02': 'Merchant or recipient ID', '03': 'Reserved' },
  },
  [GUID.PAYNOW]: {
    scheme: 'paynow',
    label: 'PayNow Singapore',
    subTags: {
      '01': 'Proxy type (0 mobile, 2 UEN)',
      '02': 'Proxy value',
      '03': 'Amount editable (1 yes, 0 no)',
      '04': 'Expiry date (YYYYMMDD)',
      '05': 'Reference',
    },
  },
  [GUID.PROMPTPAY_TRANSFER]: {
    scheme: 'promptpay',
    label: 'PromptPay credit transfer',
    subTags: PROMPTPAY_TRANSFER_TAGS,
  },
  [GUID.PROMPTPAY_TRANSFER_OTA]: {
    scheme: 'promptpay',
    label: 'PromptPay credit transfer (one-time)',
    subTags: { ...PROMPTPAY_TRANSFER_TAGS, '05': 'One-time authorisation code' },
  },
  [GUID.PROMPTPAY_BILL]: {
    scheme: 'promptpay',
    label: 'PromptPay bill payment',
    subTags: { '01': 'Biller ID', '02': 'Reference 1', '03': 'Reference 2' },
  },
  [GUID.QRIS]: {
    scheme: 'qris',
    label: 'QRIS national merchant ID',
    subTags: { '02': 'NMID', '03': 'Merchant criteria' },
  },
  [GUID.VIETQR]: {
    scheme: 'vietqr',
    label: 'VietQR, NAPAS',
    subTags: { '01': 'Beneficiary', '02': 'Service code' },
    nested: { '01': { '00': 'Bank BIN', '01': 'Account or card number' } },
  },
  [GUID.SGQR]: {
    label: 'SGQR registration',
    subTags: {
      '01': 'SGQR ID',
      '02': 'Version',
      '03': 'Postal code',
      '04': 'Level',
      '05': 'Unit number',
      '06': 'Miscellaneous',
      '07': 'Version date',
    },
  },
};

const QRIS_ACQUIRER: GuidInfo = {
  label: 'QRIS acquirer',
  subTags: { '01': 'Merchant PAN', '02': 'Merchant ID', '03': 'Merchant criteria' },
};

/** What a merchant account GUID means, if known. Indonesian reverse-domain GUIDs are QRIS acquirers. */
export function guidInfo(guid: string | undefined): GuidInfo | undefined {
  if (!guid) return undefined;
  const key = guid.toUpperCase();
  const known = KNOWN_GUIDS[key];
  if (known) return known;
  if (/^(ID\.CO\.|ID\.OR\.|COM\.)[A-Z0-9.-]+\.WWW$/.test(key) || /^ID\.[A-Z0-9.-]+$/.test(key)) return QRIS_ACQUIRER;
  return undefined;
}
