import { describe, expect, it } from 'vitest';

import {
  buildPayload,
  crc16,
  explain,
  getSubTag,
  getTag,
  isValid,
  parsePayload,
  QrError,
  qris,
  validate,
  vietqr,
} from '../src';
import { DUITNOW_RETAIL, PROMPTPAY_THAI_NAME, QRIS_STATIC, UNKNOWN_SCHEME } from './fixtures';

function error(fn: () => unknown): QrError {
  try {
    fn();
  } catch (e) {
    if (e instanceof QrError) return e;
    throw e;
  }
  throw new Error('expected a QrError');
}

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it("reproduces PayNet's published checksum", () => {
    expect(crc16(DUITNOW_RETAIL.slice(0, -4))).toBe('343F');
  });

  it('pads to four uppercase hex digits', () => {
    expect(crc16('')).toBe('FFFF');
    expect(crc16('a')).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe('parsePayload', () => {
  it('reads top-level fields and nested templates', () => {
    const p = parsePayload(DUITNOW_RETAIL);
    expect(p.fields.map((f) => f.tag)).toEqual(['00', '01', '26', '52', '53', '54', '58', '59', '60', '63']);
    expect(getTag(p, '59')).toBe('QRCSDNBHD');
    expect(getSubTag(p, '26', '00')).toBe('A0000006150001');
    expect(getSubTag(p, '26', '02')).toBe('123456789');
    expect(p.crc).toEqual({ value: '343F', expected: '343F', valid: true });
    expect(p.warnings).toEqual([]);
  });

  it('counts lengths in characters, so Thai text in the language template parses', () => {
    const p = parsePayload(PROMPTPAY_THAI_NAME);
    expect(getSubTag(p, '64', '01')).toBe('ร้านกาแฟ');
  });

  it('ignores surrounding whitespace from scanners', () => {
    expect(getTag(parsePayload(`  ${DUITNOW_RETAIL}\n`), '60')).toBe('BANGI');
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['0002', 'MALFORMED'],
    ['00020201021', 'MALFORMED'],
    ['0A0201', 'MALFORMED'],
    ['00X201', 'MALFORMED'],
    ['01021100020163041234', 'MALFORMED'],
    ['000201010211', 'CRC_MISSING'],
    ['00020163041G2Z', 'MALFORMED'],
  ])('rejects %j with %s', (input, code) => {
    expect(error(() => parsePayload(input)).code).toBe(code);
  });

  it('points at the field that does not line up', () => {
    const e = error(() => parsePayload('000201015011'));
    expect(e.code).toBe('MALFORMED');
    expect(e.tag).toBe('01');
    expect(e.position).toBe(6);
  });

  it('rejects a payload whose checksum does not match, unless asked not to', () => {
    const tampered = DUITNOW_RETAIL.replace('540510.00', '540599.00');
    const e = error(() => parsePayload(tampered));
    expect(e.code).toBe('CRC_MISMATCH');
    expect(e.message).toContain('343F');

    const p = parsePayload(tampered, { verifyCrc: false });
    expect(p.crc.valid).toBe(false);
    expect(getTag(p, '54')).toBe('99.00');
  });

  it('accepts a lowercase checksum', () => {
    expect(parsePayload(`${DUITNOW_RETAIL.slice(0, -4)}343f`).crc.valid).toBe(true);
  });

  it('warns about oddities without rejecting, and throws on them in strict mode', () => {
    const noCountry = buildPayload([
      { tag: '00', value: '01' },
      { tag: '26', value: '0009SG.PAYNOW' },
      { tag: '53', value: '702' },
      { tag: '59', value: 'A NAME THAT IS DEFINITELY TOO LONG' },
    ]);
    const p = parsePayload(noCountry);
    expect(p.warnings.map((w) => [w.code, w.tag])).toEqual([
      ['FIELD_TOO_LONG', '59'],
      ['MISSING_FIELD', '58'],
    ]);
    expect(error(() => parsePayload(noCountry, { strict: true })).code).toBe('FIELD_TOO_LONG');
  });

  it('warns when nothing can be paid', () => {
    const p = parsePayload(
      buildPayload([
        { tag: '00', value: '01' },
        { tag: '53', value: '458' },
        { tag: '58', value: 'MY' },
      ]),
    );
    expect(p.warnings.map((w) => w.code)).toContain('MISSING_FIELD');
  });
});

describe('buildPayload', () => {
  it('rebuilds a parsed payload byte for byte', () => {
    for (const payload of [DUITNOW_RETAIL, QRIS_STATIC, PROMPTPAY_THAI_NAME]) {
      expect(buildPayload(parsePayload(payload).fields)).toBe(payload);
    }
  });

  it('refuses values longer than 99 characters', () => {
    expect(
      error(() =>
        buildPayload([
          { tag: '00', value: '01' },
          { tag: '59', value: 'x'.repeat(100) },
        ]),
      ).code,
    ).toBe('FIELD_TOO_LONG');
  });

  it('refuses tags that are not two digits', () => {
    expect(error(() => buildPayload([{ tag: '5', value: 'x' }])).code).toBe('INVALID_FIELD');
  });
});

describe('validate / isValid', () => {
  it('never throws for bad input', () => {
    expect(isValid(DUITNOW_RETAIL)).toBe(true);
    expect(isValid('not a qr')).toBe(false);
    const result = validate(DUITNOW_RETAIL.slice(0, -1));
    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe('MALFORMED');
  });
});

describe('explain', () => {
  it('names every field, including the scheme behind a GUID', () => {
    const text = explain(DUITNOW_RETAIL);
    expect(text).toContain('Payload format indicator');
    expect(text).toMatch(/00 {2}Globally unique identifier\s+A0000006150001 {2}\(DuitNow, PayNet Malaysia\)/);
    expect(text).toMatch(/01 {2}Acquirer ID\s+501664/);
    expect(text).toMatch(/53 {2}Transaction currency\s+458 {2}\(MYR\)/);
    expect(text).toMatch(/63 {2}CRC\s+343F {2}\(valid\)/);
  });

  it('reports a bad checksum instead of throwing', () => {
    expect(explain(DUITNOW_RETAIL.replace('BANGI', 'BANGO'))).toMatch(/INVALID, expected [0-9A-F]{4}/);
  });

  it('shows nested templates, dynamic QRs and fees', () => {
    const vn = explain(vietqr.create({ bin: '970436', account: '001100123456', amount: 50000, purpose: 'Coffee' }));
    expect(vn).toMatch(/01 {2}Point of initiation method\s+12 {2}\(dynamic: one payment\)/);
    expect(vn).toMatch(/00 {2}Globally unique identifier\s+A000000727 {2}\(VietQR, NAPAS\)/);
    expect(vn).toMatch(/01 {2}Beneficiary\n\s+00 {2}Bank BIN\s+970436\n\s+01 {2}Account or card number\s+001100123456/);
    expect(vn).toMatch(/08 {2}Purpose of transaction\s+Coffee/);
    const withFee = explain(qris.withAmount(QRIS_STATIC, 25000, { fee: { percent: 1.5 } }));
    expect(withFee).toMatch(/55 {2}Tip or convenience indicator\s+03 {2}\(percentage fee in tag 57\)/);
    expect(withFee).toMatch(/57 {2}Convenience fee \(percentage\)\s+1.5/);
    expect(explain(UNKNOWN_SCHEME)).toMatch(/02 {2}Merchant account \(card network\)\s+4111111111111111/);
  });

  it('includes warnings at the end', () => {
    const payload = buildPayload([
      { tag: '00', value: '01' },
      { tag: '26', value: '0009SG.PAYNOW' },
      { tag: '53', value: '702' },
    ]);
    expect(explain(payload)).toMatch(/warning: No country code \(tag 58\)$/);
  });

  it('labels QRIS acquirer and national templates', () => {
    const text = explain(QRIS_STATIC);
    expect(text).toMatch(/01 {2}Merchant PAN\s+936000000000000001/);
    expect(text).toMatch(/02 {2}NMID\s+ID1020000000001/);
  });
});
