import { crc16 } from './crc';
import { QrError, type QrWarning } from './errors';
import { charLength, type EmvField, encodeTlv, isTemplateTag, parseTlv } from './tlv';

/** A parsed EMVCo merchant-presented QR payload. Plain data, safe to serialise as JSON. */
export interface EmvPayload {
  /** Every top-level field in payload order, including the CRC (63). Templates have `children`. */
  fields: EmvField[];
  /** The checksum found in tag 63 and whether it matches the data. */
  crc: { value: string; expected: string; valid: boolean };
  /** Unusual but scannable things, such as a missing merchant name. Empty for a clean payload. */
  warnings: QrWarning[];
}

export interface ParseOptions {
  /** Throw on a checksum mismatch (default true). Turn off to inspect a damaged payload. */
  verifyCrc?: boolean;
  /** Turn warnings into errors (default false). */
  strict?: boolean;
}

const MAX_LENGTH: Record<string, number> = { '54': 13, '59': 25, '60': 15, '61': 10 };

/**
 * Parses and checks a payload: TLV structure, the checksum, and the shape of the common fields.
 * Problems that break the payload throw a {@link QrError}; oddities that most apps tolerate become `warnings`.
 */
export function parsePayload(payload: string, options: ParseOptions = {}): EmvPayload {
  const { verifyCrc = true, strict = false } = options;
  const input = typeof payload === 'string' ? payload.trim() : '';
  if (!input) throw new QrError('EMPTY', 'The payload is empty');

  const fields = parseTlv(input);
  if (fields[0]?.tag !== '00') {
    throw new QrError('MALFORMED', 'An EMVCo payload must start with the payload format indicator (tag 00)', {
      tag: '00',
      position: 0,
    });
  }
  const last = fields[fields.length - 1];
  if (last?.tag !== '63') {
    throw new QrError('CRC_MISSING', 'The payload must end with the CRC (tag 63)', { tag: '63' });
  }
  if (!/^[0-9A-Fa-f]{4}$/.test(last.value)) {
    throw new QrError('MALFORMED', `The CRC must be 4 hex digits, found "${last.value}"`, { tag: '63' });
  }
  const chars = Array.from(input);
  const expected = crc16(chars.slice(0, chars.length - 4).join(''));
  const crc = { value: last.value.toUpperCase(), expected, valid: last.value.toUpperCase() === expected };
  if (verifyCrc && !crc.valid) {
    throw new QrError('CRC_MISMATCH', `CRC mismatch: the payload says ${crc.value}, the data gives ${expected}`, {
      tag: '63',
    });
  }

  const warnings: QrWarning[] = [];
  for (const field of fields) {
    if (isTemplateTag(field.tag)) {
      try {
        field.children = parseTlv(field.value, 0, field.tag);
      } catch {
        // Proprietary data in 80-99 is allowed to be anything; elsewhere it should be TLV.
        if (Number(field.tag) < 80) {
          warnings.push({ code: 'NOT_TLV', tag: field.tag, message: `Tag ${field.tag} should contain TLV data` });
        }
      }
    }
  }
  warnings.push(...checkCommonFields(fields));

  if (strict && warnings.length > 0) {
    const first = warnings[0] as QrWarning;
    throw new QrError(
      first.code === 'NOT_TLV' || first.code === 'UNKNOWN_FORMAT' ? 'INVALID_FIELD' : first.code,
      first.message,
      {
        ...(first.tag ? { tag: first.tag } : {}),
      },
    );
  }
  return { fields, crc, warnings };
}

function checkCommonFields(fields: EmvField[]): QrWarning[] {
  const warnings: QrWarning[] = [];
  const get = (tag: string) => fields.find((f) => f.tag === tag)?.value;
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.tag))
      warnings.push({ code: 'INVALID_FIELD', tag: f.tag, message: `Tag ${f.tag} appears more than once` });
    seen.add(f.tag);
    const max = MAX_LENGTH[f.tag];
    if (max !== undefined && charLength(f.value) > max) {
      warnings.push({ code: 'FIELD_TOO_LONG', tag: f.tag, message: `Tag ${f.tag} is longer than ${max} characters` });
    }
  }

  const format = get('00');
  if (format !== '01' && format !== '02') {
    warnings.push({ code: 'UNKNOWN_FORMAT', tag: '00', message: `Unknown payload format indicator "${format}"` });
  }
  const poi = get('01');
  if (poi !== undefined && poi !== '11' && poi !== '12') {
    warnings.push({
      code: 'INVALID_FIELD',
      tag: '01',
      message: 'Point of initiation must be 11 (static) or 12 (dynamic)',
    });
  }
  const currency = get('53');
  if (currency === undefined)
    warnings.push({ code: 'MISSING_FIELD', tag: '53', message: 'No transaction currency (tag 53)' });
  else if (!/^\d{3}$/.test(currency)) {
    warnings.push({ code: 'INVALID_FIELD', tag: '53', message: 'The currency must be a 3-digit ISO 4217 code' });
  }
  const amount = get('54');
  if (amount !== undefined && !/^(?=.*[1-9])\d+(\.\d+)?$/.test(amount)) {
    warnings.push({ code: 'INVALID_FIELD', tag: '54', message: `"${amount}" is not a valid amount` });
  }
  const country = get('58');
  if (country === undefined) warnings.push({ code: 'MISSING_FIELD', tag: '58', message: 'No country code (tag 58)' });
  else if (!/^[A-Z]{2}$/.test(country)) {
    warnings.push({ code: 'INVALID_FIELD', tag: '58', message: 'The country must be a 2-letter ISO 3166 code' });
  }
  const mcc = get('52');
  if (mcc !== undefined && !/^\d{4}$/.test(mcc)) {
    warnings.push({ code: 'INVALID_FIELD', tag: '52', message: 'The merchant category code must be 4 digits' });
  }
  const hasAccount = fields.some((f) => Number(f.tag) >= 2 && Number(f.tag) <= 51);
  if (!hasAccount) {
    warnings.push({ code: 'MISSING_FIELD', message: 'No merchant account information (tags 02-51): nothing to pay' });
  }
  return warnings;
}

/** Builds a payload from fields: drops any existing CRC, appends tag 63 with a fresh checksum. */
export function buildPayload(fields: readonly EmvField[]): string {
  const body = encodeTlv(fields.filter((f) => f.tag !== '63'));
  const withCrcTag = `${body}6304`;
  return withCrcTag + crc16(withCrcTag);
}

/** Value of a top-level tag, e.g. `getTag(p, '54')` for the amount. */
export function getTag(payload: EmvPayload, tag: string): string | undefined {
  return payload.fields.find((f) => f.tag === tag)?.value;
}

/** Value of a sub-tag inside a template, e.g. `getSubTag(p, '62', '01')` for the bill number. */
export function getSubTag(payload: EmvPayload, tag: string, sub: string): string | undefined {
  return payload.fields.find((f) => f.tag === tag)?.children?.find((c) => c.tag === sub)?.value;
}

/** Sets a top-level field (replacing it, or inserting it in tag order). Returns a new array. */
export function setField(fields: readonly EmvField[], field: EmvField): EmvField[] {
  const index = fields.findIndex((f) => f.tag === field.tag);
  if (index >= 0) return fields.map((f, i) => (i === index ? field : f));
  const insertAt = fields.findIndex((f) => f.tag !== '00' && Number(f.tag) > Number(field.tag));
  const copy = [...fields];
  copy.splice(insertAt < 0 ? copy.length : insertAt, 0, field);
  return copy;
}

/** Removes top-level fields by tag. Returns a new array. */
export function removeFields(fields: readonly EmvField[], ...tags: string[]): EmvField[] {
  return fields.filter((f) => !tags.includes(f.tag));
}
