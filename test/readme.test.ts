/** The examples in README.md, so the documentation can't drift from the code. */
import { describe, expect, it } from 'vitest';

import { asciiFold, decode, duitnow, explain, paynow, promptpay, qris, validate, vietqr, withAmount } from '../src';
import { DUITNOW_RETAIL, QRIS_STATIC } from './fixtures';

describe('README examples', () => {
  it('DuitNow', () => {
    const merchant = {
      acquirerId: '501664',
      merchantId: '123456789',
      merchantName: 'QRCSDNBHD',
      city: 'BANGI',
      mcc: '9999',
    };
    expect(duitnow.create({ ...merchant, amount: '10.00' })).toBe(DUITNOW_RETAIL);
    const extra = duitnow.decode(
      duitnow.create({ ...merchant, amount: 25, dynamic: true, additionalData: { billNumber: 'INV-0042' } }),
    );
    expect([extra.amount, extra.dynamic, extra.additionalData.billNumber]).toEqual(['25.00', true, 'INV-0042']);
  });

  it('PayNow', () => {
    const qr = paynow.decode(
      paynow.create({
        uen: '201234567A',
        amount: 88.8,
        reference: 'INV-0042',
        expiry: '20261231',
        editable: false,
        merchantName: 'Example Pte Ltd',
      }),
    );
    expect([qr.amount, qr.reference, qr.expiry, qr.editable]).toEqual(['88.80', 'INV-0042', '20261231', false]);
    expect(paynow.normalizeMobile('+65 9123 4567')).toBe('+6591234567');
  });

  it('PromptPay', () => {
    const qr = promptpay.decode(promptpay.create({ mobile: '081-234-5678', amount: 100 }));
    expect(qr.kind === 'transfer' && qr.target.value).toBe('0066812345678');
    expect(
      promptpay.decode(
        promptpay.billPayment({ billerId: '010555512345601', ref1: 'CUST0001', ref2: 'INV42', amount: 1500 }),
      ).amount,
    ).toBe('1500.00');
  });

  it('QRIS', () => {
    expect(qris.decode(qris.withAmount(QRIS_STATIC, 25000, { fee: { fixed: 1000 } })).fee).toEqual({
      type: 'fixed',
      amount: '1000',
    });
  });

  it('VietQR', () => {
    expect(
      vietqr.decode(
        vietqr.create({
          bin: '970436',
          account: '0011001234567',
          amount: 150000,
          purpose: asciiFold('Thanh toán đơn hàng'),
        }),
      ).purpose,
    ).toBe('Thanh toan don hang');
  });

  it('tools', () => {
    expect(validate('junk').valid).toBe(false);
    expect(decode(withAmount(DUITNOW_RETAIL, 25)).amount).toBe('25.00');
    // the explain() output shown in the README
    expect(explain(DUITNOW_RETAIL)).toBe(
      [
        '00  Payload format indicator                 02',
        '01  Point of initiation method               11  (static: reusable)',
        '26  Merchant account information',
        '      00  Globally unique identifier         A0000006150001  (DuitNow, PayNet Malaysia)',
        '      01  Acquirer ID                        501664',
        '      02  Merchant or recipient ID           123456789',
        '52  Merchant category code                   9999',
        '53  Transaction currency                     458  (MYR)',
        '54  Transaction amount                       10.00',
        '58  Country code                             MY',
        '59  Merchant name                            QRCSDNBHD',
        '60  Merchant city                            BANGI',
        '63  CRC                                      343F  (valid)',
      ].join('\n'),
    );
  });
});
