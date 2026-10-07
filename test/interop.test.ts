/**
 * Cross-checks against established single-country libraries: payloads they generate must decode correctly here,
 * and payloads generated here must match theirs (byte for byte where field order agrees, field by field otherwise).
 * These libraries are dev dependencies only; asean-qr itself has no dependencies.
 */
import { createRequire } from 'node:module';
import { QRPay } from 'vietnam-qr-pay';
import { describe, expect, it } from 'vitest';

import { decode, type EmvField, isValid, parsePayload, paynow, promptpay, qris, vietqr } from '../src';
import { QRIS_STATIC } from './fixtures';

const require = createRequire(import.meta.url);
const promptpayQr: (target: string, options: { amount?: number }) => string = require('promptpay-qr');
const PaynowQR: new (options: Record<string, unknown>) => { output(): string } = require('paynowqr');
// its ES module build is broken; the CommonJS one works
const qrisDinamis: { makeString(qris: string, options: Record<string, string>): string } = require('qris-dinamis');

/** Tag -> value (templates as nested objects), ignoring order and the CRC. */
function fieldMap(payload: string): Record<string, unknown> {
  const toMap = (fields: EmvField[]): Record<string, unknown> =>
    Object.fromEntries(
      fields.filter((f) => f.tag !== '63').map((f) => [f.tag, f.children ? toMap(f.children) : f.value]),
    );
  return toMap(parsePayload(payload).fields);
}

describe('PromptPay vs promptpay-qr (dtinth)', () => {
  it.each([
    ['0812345678', 'mobile', '0066812345678', undefined],
    ['0812345678', 'mobile', '0066812345678', 100.5],
    ['1234567890123', 'nationalId', '1234567890123', 42],
    ['123456789012345', 'eWallet', '123456789012345', undefined],
  ] as const)('target %s (%s), amount %s', (target, type, value, amount) => {
    const theirs = promptpayQr(target, amount === undefined ? {} : { amount });
    expect(isValid(theirs)).toBe(true);
    const qr = decode(theirs);
    expect(qr).toMatchObject({ scheme: 'promptpay', kind: 'transfer', target: { type, value } });

    const options =
      type === 'mobile' ? { mobile: target } : type === 'nationalId' ? { nationalId: target } : { eWalletId: target };
    const ours = promptpay.create({
      ...options,
      ...(amount === undefined ? {} : { amount }),
    } as promptpay.PromptPayOptions);
    expect(fieldMap(ours)).toEqual(fieldMap(theirs));
  });
});

describe('PayNow vs paynowqr', () => {
  it('produces the same fields for a UEN QR with amount, expiry and reference', () => {
    const theirs = new PaynowQR({
      uen: '200012345K',
      amount: 88.8,
      editable: false,
      expiry: '20261231',
      refNumber: 'INV-0042',
      company: 'Example Pte Ltd',
    }).output();
    const qr = decode(theirs);
    expect(qr).toMatchObject({ scheme: 'paynow', proxyType: 'uen', proxyValue: '200012345K', expiry: '20261231' });

    const ours = paynow.create({
      uen: '200012345K',
      amount: 88.8,
      expiry: '20261231',
      reference: 'INV-0042',
      merchantName: 'Example Pte Ltd',
    });
    // paynowqr writes amounts without padding ("88.8"); both are valid EMV amounts
    expect({ ...fieldMap(ours), '54': undefined }).toEqual({ ...fieldMap(theirs), '54': undefined });
    expect(Number(fieldMap(ours)['54'])).toBe(Number(fieldMap(theirs)['54']));
  });
});

describe('VietQR vs vietnam-qr-pay', () => {
  it.each([
    [{ bin: '970436', account: '001100123456', amount: 150000, purpose: 'Thanh toan don hang' }],
    [{ bin: '970416', account: '257678859' }],
  ])('generates the identical payload for %o', (input) => {
    const theirs = QRPay.initVietQR({
      bankBin: input.bin,
      bankNumber: input.account,
      ...('amount' in input ? { amount: String(input.amount) } : {}),
      ...('purpose' in input ? { purpose: input.purpose } : {}),
    }).build();
    expect(vietqr.create(input)).toBe(theirs);
  });

  it('is parsed by vietnam-qr-pay', () => {
    const parsed = new QRPay(
      vietqr.create({ bin: '970436', account: '001100123456', amount: 50000, purpose: 'Coffee' }),
    );
    expect(parsed.isValid).toBe(true);
    expect(parsed.consumer.bankBin).toBe('970436');
    expect(parsed.consumer.bankNumber).toBe('001100123456');
    expect(parsed.amount).toBe('50000');
    expect(parsed.additionalData.purpose).toBe('Coffee');
  });
});

describe('QRIS vs qris-dinamis', () => {
  it('converts static to dynamic with a fixed fee identically', () => {
    const theirs = qrisDinamis.makeString(QRIS_STATIC, { nominal: '25000', taxtype: 'r', fee: '1000' });
    expect(qris.withAmount(QRIS_STATIC, 25000, { fee: { fixed: 1000 } })).toBe(theirs);
  });

  it('decodes its output', () => {
    const qr = qris.decode(qrisDinamis.makeString(QRIS_STATIC, { nominal: '15000' }));
    expect(qr.amount).toBe('15000');
    expect(qr.dynamic).toBe(true);
    // qris-dinamis adds a 0% fee when none is asked for; we surface it rather than hide it
    expect(qr.fee).toEqual({ type: 'percent', percent: '0' });
  });
});
