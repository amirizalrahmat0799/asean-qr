import { describe, expect, it } from 'vitest';

import { asciiFold, buildPayload, decode, duitnow, paynow, promptpay, QrError, qris, vietqr, withAmount } from '../src';
import { DUITNOW_P2P, DUITNOW_RETAIL, PROMPTPAY_THAI_NAME, QRIS_STATIC, SGQR_MULTI, UNKNOWN_SCHEME } from './fixtures';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof QrError) return e.code;
    throw e;
  }
  throw new Error('expected a QrError');
}

describe('DuitNow', () => {
  it("generates PayNet's published examples exactly", () => {
    expect(
      duitnow.create({
        acquirerId: '501664',
        merchantId: '123456789',
        merchantName: 'QRCSDNBHD',
        city: 'BANGI',
        mcc: '9999',
        amount: '10.00',
      }),
    ).toBe(DUITNOW_RETAIL);
    expect(
      duitnow.create({
        acquirerId: '501664',
        merchantId: '123456789',
        merchantName: 'AUSERNAME',
        city: 'BANGI',
        amount: 10,
      }),
    ).toBe(DUITNOW_P2P);
  });

  it('decodes the merchant, amount and acquirer', () => {
    const qr = duitnow.decode(DUITNOW_RETAIL);
    expect(qr).toMatchObject({
      scheme: 'duitnow',
      country: 'MY',
      currency: 'MYR',
      currencyCode: '458',
      amount: '10.00',
      dynamic: false,
      acquirerId: '501664',
      merchantId: '123456789',
      merchant: { name: 'QRCSDNBHD', city: 'BANGI', category: '9999' },
    });
  });

  it('supports dynamic QRs, postal codes and additional data', () => {
    const payload = duitnow.create({
      acquirerId: '588734',
      merchantId: 'M000123',
      merchantName: 'Kedai Kopi Mizal',
      city: 'Cyberjaya',
      mcc: '5814',
      postalCode: '63000',
      amount: 12.5,
      dynamic: true,
      additionalData: { billNumber: 'INV-2026-0042', terminalLabel: 'POS1' },
    });
    const qr = duitnow.decode(payload);
    expect(qr.dynamic).toBe(true);
    expect(qr.amount).toBe('12.50');
    expect(qr.merchant.postalCode).toBe('63000');
    expect(qr.additionalData).toEqual({ billNumber: 'INV-2026-0042', terminalLabel: 'POS1' });
  });

  it('validates its inputs', () => {
    const base = { acquirerId: '501664', merchantId: '1', merchantName: 'A', city: 'B' };
    expect(code(() => duitnow.create({ ...base, acquirerId: 'AFFIN' }))).toBe('INVALID_FIELD');
    expect(code(() => duitnow.create({ ...base, merchantName: 'X'.repeat(26) }))).toBe('FIELD_TOO_LONG');
    expect(code(() => duitnow.create({ ...base, city: 'Kuala Lumpur City' }))).toBe('FIELD_TOO_LONG');
    expect(code(() => duitnow.create({ ...base, merchantName: '' }))).toBe('MISSING_FIELD');
    expect(code(() => duitnow.create({ ...base, merchantName: 'Café' }))).toBe('INVALID_FIELD');
    expect(code(() => duitnow.create({ ...base, mcc: '58' }))).toBe('INVALID_FIELD');
    expect(code(() => duitnow.create({ ...base, amount: 10.005 }))).toBe('INVALID_FIELD');
    expect(code(() => duitnow.create({ ...base, amount: 0 }))).toBe('INVALID_FIELD');
  });

  it('refuses to decode another scheme as DuitNow', () => {
    expect(code(() => duitnow.decode(SGQR_MULTI))).toBe('WRONG_SCHEME');
  });
});

describe('PayNow', () => {
  it('normalises Singapore mobile numbers', () => {
    for (const input of ['91234567', '9123 4567', '+65 9123 4567', '6591234567', '+65-9123-4567']) {
      expect(paynow.normalizeMobile(input)).toBe('+6591234567');
    }
    expect(code(() => paynow.normalizeMobile('1234567'))).toBe('INVALID_FIELD');
    expect(code(() => paynow.normalizeMobile('21234567'))).toBe('INVALID_FIELD');
  });

  it('creates an open-amount QR for a mobile number', () => {
    const qr = paynow.decode(paynow.create({ mobile: '9123 4567' }));
    expect(qr).toMatchObject({
      scheme: 'paynow',
      proxyType: 'mobile',
      proxyValue: '+6591234567',
      editable: true,
      dynamic: false,
      amount: undefined,
      currency: 'SGD',
      country: 'SG',
      merchant: { name: 'NA', city: 'Singapore', category: '0000' },
    });
  });

  it('creates a fixed-amount QR for a UEN with expiry and reference', () => {
    const qr = paynow.decode(
      paynow.create({
        uen: '200012345k',
        amount: '88.8',
        expiry: new Date(2026, 11, 31),
        reference: 'INV-0042',
        merchantName: 'Example Pte Ltd',
      }),
    );
    expect(qr).toMatchObject({
      proxyType: 'uen',
      proxyValue: '200012345K',
      amount: '88.80',
      editable: false,
      dynamic: true,
      expiry: '20261231',
      reference: 'INV-0042',
      merchant: { name: 'Example Pte Ltd' },
    });
  });

  it('lets an amount stay editable when asked', () => {
    expect(paynow.decode(paynow.create({ mobile: '81234567', amount: 5, editable: true })).editable).toBe(true);
  });

  it('accepts the expiry as a string and rejects nonsense', () => {
    expect(paynow.decode(paynow.create({ mobile: '81234567', expiry: '2026-12-31' })).expiry).toBe('20261231');
    expect(code(() => paynow.create({ mobile: '81234567', expiry: 'tomorrow' }))).toBe('INVALID_FIELD');
  });

  it('needs exactly one of mobile or UEN', () => {
    expect(code(() => paynow.create({} as never))).toBe('INVALID_FIELD');
    expect(code(() => paynow.create({ mobile: '81234567', uen: '200012345K' } as never))).toBe('INVALID_FIELD');
  });

  it('finds PayNow inside a multi-scheme SGQR', () => {
    const qr = decode(SGQR_MULTI);
    expect(qr.scheme).toBe('paynow');
    expect(qr.accounts.map((a) => a.label)).toEqual(['PayNow Singapore', 'SGQR registration']);
    if (qr.scheme === 'paynow') expect(qr.proxyValue).toBe('200012345K');
  });
});

describe('PromptPay', () => {
  it('formats Thai mobile numbers the PromptPay way', () => {
    for (const input of ['0812345678', '081-234-5678', '+66812345678', '66812345678', '0066812345678']) {
      expect(promptpay.formatMobile(input)).toBe('0066812345678');
    }
    expect(code(() => promptpay.formatMobile('12345'))).toBe('INVALID_FIELD');
    // landlines (02...) and numbers that only look like the 0066 prefix are not mobiles
    expect(code(() => promptpay.formatMobile('021234567'))).toBe('INVALID_FIELD');
    expect(code(() => promptpay.formatMobile('0066000000'))).toBe('INVALID_FIELD');
  });

  it('creates transfers to a mobile number, national ID or e-wallet', () => {
    const mobile = promptpay.decode(promptpay.create({ mobile: '081-234-5678', amount: 100 }));
    expect(mobile).toMatchObject({
      scheme: 'promptpay',
      kind: 'transfer',
      target: { type: 'mobile', value: '0066812345678' },
      amount: '100.00',
      dynamic: true,
      currency: 'THB',
      country: 'TH',
    });
    const id = promptpay.decode(promptpay.create({ nationalId: '1-2345-67890-12-3' }));
    expect(id).toMatchObject({
      kind: 'transfer',
      target: { type: 'nationalId', value: '1234567890123' },
      dynamic: false,
    });
    const wallet = promptpay.decode(promptpay.create({ eWalletId: '123456789012345' }));
    expect(wallet).toMatchObject({ kind: 'transfer', target: { type: 'eWallet', value: '123456789012345' } });
  });

  it('creates bill payments', () => {
    const qr = promptpay.decode(
      promptpay.billPayment({ billerId: '010555512345601', ref1: 'CUST0001', ref2: 'INV42', amount: '1500.5' }),
    );
    expect(qr).toMatchObject({
      kind: 'bill',
      billerId: '010555512345601',
      ref1: 'CUST0001',
      ref2: 'INV42',
      amount: '1500.50',
    });
  });

  it('validates identifiers', () => {
    expect(code(() => promptpay.create({ nationalId: '123' }))).toBe('INVALID_FIELD');
    expect(code(() => promptpay.create({ eWalletId: '12345' }))).toBe('INVALID_FIELD');
    expect(code(() => promptpay.create({ mobile: '0812345678', nationalId: '1234567890123' } as never))).toBe(
      'INVALID_FIELD',
    );
    expect(code(() => promptpay.billPayment({ billerId: '1', ref1: 'A' }))).toBe('INVALID_FIELD');
  });

  it('decodes a QR with a Thai merchant name in the language template', () => {
    const qr = promptpay.decode(PROMPTPAY_THAI_NAME);
    expect(qr.kind).toBe('transfer');
    expect(qr.payload.fields.find((f) => f.tag === '64')?.children?.[1]?.value).toBe('ร้านกาแฟ');
  });
});

describe('QRIS', () => {
  it('decodes the national merchant ID and acquirer', () => {
    const qr = qris.decode(QRIS_STATIC);
    expect(qr).toMatchObject({
      scheme: 'qris',
      nmid: 'ID1020000000001',
      merchantCriteria: 'UMI',
      dynamic: false,
      currency: 'IDR',
      merchant: { name: 'TOKO CONTOH', city: 'JAKARTA', postalCode: '10110', category: '5812' },
      additionalData: { terminalLabel: 'A01' },
      fee: undefined,
    });
    expect(qr.acquirers).toEqual([
      { tag: '26', guid: 'ID.CO.EXAMPLE.WWW', merchantPan: '936000000000000001', merchantId: '000000000000001' },
    ]);
  });

  it('turns a static QRIS into a dynamic one, keeping the rest as issued', () => {
    const dynamic = qris.withAmount(QRIS_STATIC, 25000);
    const qr = qris.decode(dynamic);
    expect(qr.dynamic).toBe(true);
    expect(qr.amount).toBe('25000');
    expect(qr.nmid).toBe('ID1020000000001');
    // only 01 and 54 change
    expect(dynamic.slice(0, 12)).toBe('000201010212');
    expect(dynamic).toContain('5303360540525000');
  });

  it('adds a fixed or percentage convenience fee', () => {
    expect(qris.decode(qris.withAmount(QRIS_STATIC, '25000', { fee: { fixed: 1000 } })).fee).toEqual({
      type: 'fixed',
      amount: '1000',
    });
    expect(qris.decode(qris.withAmount(QRIS_STATIC, 25000, { fee: { percent: 0.7 } })).fee).toEqual({
      type: 'percent',
      percent: '0.7',
    });
    expect(code(() => qris.withAmount(QRIS_STATIC, 25000, { fee: { percent: 150 } }))).toBe('INVALID_FIELD');
  });

  it('replaces an existing amount and fee instead of adding a second one', () => {
    const once = qris.withAmount(QRIS_STATIC, 1000, { fee: { fixed: 500 } });
    const twice = qris.withAmount(once, 2000);
    const qr = qris.decode(twice);
    expect(qr.amount).toBe('2000');
    expect(qr.fee).toBeUndefined();
    expect(qr.payload.fields.filter((f) => f.tag === '54')).toHaveLength(1);
  });

  it('only takes whole rupiah', () => {
    expect(code(() => qris.withAmount(QRIS_STATIC, '25000.50'))).toBe('INVALID_FIELD');
  });
});

describe('VietQR', () => {
  it('creates and decodes an account transfer with amount and message', () => {
    const qr = vietqr.decode(
      vietqr.create({
        bin: '970436',
        account: '0011 0012 3456',
        amount: 150000,
        purpose: asciiFold('Thanh toán đơn hàng'),
      }),
    );
    expect(qr).toMatchObject({
      scheme: 'vietqr',
      bin: '970436',
      account: '001100123456',
      service: 'account',
      amount: '150000',
      purpose: 'Thanh toan don hang',
      currency: 'VND',
      country: 'VN',
      dynamic: true,
      merchant: { name: undefined, city: undefined },
    });
  });

  it('supports card transfers', () => {
    expect(vietqr.decode(vietqr.create({ bin: '970436', account: '9704361234567890', service: 'card' })).service).toBe(
      'card',
    );
  });

  it('asks for ASCII, pointing at asciiFold for accents', () => {
    let message = '';
    try {
      vietqr.create({ bin: '970436', account: '1', purpose: 'Chuyển tiền' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('asciiFold');
  });

  it('validates the BIN and account', () => {
    expect(code(() => vietqr.create({ bin: '97043', account: '1' }))).toBe('INVALID_FIELD');
    expect(code(() => vietqr.create({ bin: '970436', account: '12345678901234567890' }))).toBe('INVALID_FIELD');
    expect(code(() => vietqr.create({ bin: '970436', account: '1', amount: '1000.5' }))).toBe('INVALID_FIELD');
  });
});

describe('decode', () => {
  it('detects every scheme', () => {
    expect(decode(DUITNOW_RETAIL).scheme).toBe('duitnow');
    expect(decode(paynow.create({ mobile: '91234567' })).scheme).toBe('paynow');
    expect(decode(promptpay.create({ mobile: '0812345678' })).scheme).toBe('promptpay');
    expect(decode(QRIS_STATIC).scheme).toBe('qris');
    expect(decode(vietqr.create({ bin: '970436', account: '1' })).scheme).toBe('vietqr');
  });

  it('still decodes the common fields of schemes it does not know', () => {
    const qr = decode(UNKNOWN_SCHEME);
    expect(qr).toMatchObject({
      scheme: 'unknown',
      country: 'US',
      currency: undefined,
      currencyCode: '840',
      merchant: { name: 'EXAMPLE STORE', city: 'SEATTLE', category: '5411' },
    });
  });
});

describe('withAmount', () => {
  it("sets an amount in the currency's format and marks the QR dynamic", () => {
    const qr = decode(withAmount(DUITNOW_P2P, '25.9'));
    expect(qr.amount).toBe('25.90');
    expect(qr.dynamic).toBe(true);
    expect(decode(withAmount(vietqr.create({ bin: '970436', account: '1' }), 50000)).amount).toBe('50000');
    expect(decode(withAmount(promptpay.create({ mobile: '0812345678' }), 99.5)).amount).toBe('99.50');
  });

  it('needs a currency to know the amount format', () => {
    const noCurrency = buildPayload([
      { tag: '00', value: '01' },
      { tag: '26', value: '0009SG.PAYNOW' },
      { tag: '58', value: 'SG' },
    ]);
    expect(code(() => withAmount(noCurrency, 1))).toBe('MISSING_FIELD');
  });
});
