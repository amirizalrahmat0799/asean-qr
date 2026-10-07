import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  decode,
  duitnow,
  formatAmount,
  isValid,
  parsePayload,
  paynow,
  promptpay,
  QrError,
  validate,
  vietqr,
} from '../src';
import { DUITNOW_RETAIL, QRIS_STATIC, SGQR_MULTI } from './fixtures';

const ascii = (min: number, max: number) =>
  fc
    .string({
      minLength: min,
      maxLength: max,
      unit: fc.integer({ min: 0x21, max: 0x7e }).map((c) => String.fromCharCode(c)),
    })
    .filter((s) => s.trim() === s);
const digits = (n: number) => fc.string({ minLength: n, maxLength: n, unit: fc.constantFrom(...'0123456789') });
const cents = fc.integer({ min: 1, max: 99_999_999_99 });

describe('properties', () => {
  it('only ever throws QrError, whatever the input', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: 'binary' }), digits(30)), (input) => {
        try {
          parsePayload(input);
        } catch (e) {
          expect(e).toBeInstanceOf(QrError);
        }
        expect(typeof validate(input).valid).toBe('boolean');
      }),
      { numRuns: 2000 },
    );
  });

  it('detects any single-character change to a valid payload', () => {
    const payloads = [DUITNOW_RETAIL, QRIS_STATIC, SGQR_MULTI];
    fc.assert(
      fc.property(fc.constantFrom(...payloads), fc.nat(), fc.integer({ min: 0x21, max: 0x7e }), (payload, at, code) => {
        const i = at % payload.length;
        const replacement = String.fromCharCode(code);
        fc.pre(
          payload[i] !== replacement &&
            !(payload[i]?.toUpperCase() === replacement.toUpperCase() && i >= payload.length - 4),
        );
        const mutated = payload.slice(0, i) + replacement + payload.slice(i + 1);
        expect(isValid(mutated)).toBe(false);
      }),
      { numRuns: 3000 },
    );
  });

  it('formats every 2-decimal amount exactly, from numbers and strings', () => {
    fc.assert(
      fc.property(cents, (n) => {
        const text = `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
        expect(formatAmount(n / 100, '458')).toBe(text);
        expect(formatAmount(text, '458')).toBe(text);
      }),
      { numRuns: 2000 },
    );
  });

  it('round-trips DuitNow', () => {
    fc.assert(
      fc.property(
        digits(6),
        ascii(1, 20),
        ascii(1, 25),
        ascii(1, 15),
        fc.option(cents, { nil: undefined }),
        (acq, id, name, city, amt) => {
          const payload = duitnow.create({
            acquirerId: acq,
            merchantId: id,
            merchantName: name,
            city,
            ...(amt === undefined ? {} : { amount: amt / 100 }),
          });
          const qr = duitnow.decode(payload, { strict: true });
          expect([qr.acquirerId, qr.merchantId, qr.merchant.name, qr.merchant.city]).toEqual([acq, id, name, city]);
          expect(qr.amount === undefined ? undefined : Math.round(Number(qr.amount) * 100)).toBe(amt);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('round-trips PayNow, PromptPay and VietQR through the generic decoder', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('8', '9'),
        digits(7),
        fc.constantFrom('6', '8', '9'),
        digits(8),
        digits(6),
        digits(12),
        (first, rest, thFirst, thRest, bin, account) => {
          const th = thFirst + thRest;
          const sg = decode(paynow.create({ mobile: first + rest }));
          expect(sg.scheme === 'paynow' && sg.proxyValue).toBe(`+65${first}${rest}`);
          const thai = decode(promptpay.create({ mobile: `0${th}` }));
          expect(thai.scheme === 'promptpay' && thai.kind === 'transfer' && thai.target.value).toBe(`0066${th}`);
          const vn = decode(vietqr.create({ bin, account }));
          expect(vn.scheme === 'vietqr' && [vn.bin, vn.account]).toEqual([bin, account]);
        },
      ),
      { numRuns: 500 },
    );
  });
});
