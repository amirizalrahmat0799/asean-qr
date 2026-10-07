import { QrError } from './errors';

/** One data object: a two-digit tag and its value. Templates also carry their parsed children. */
export interface EmvField {
  tag: string;
  value: string;
  children?: EmvField[];
}

/**
 * Values are measured in characters (Unicode code points), as EMVCo lengths are, so a Thai or Vietnamese name in the
 * alternate-language template (64) is counted the same way as an ASCII one.
 */
export function charLength(value: string): number {
  let n = 0;
  for (const _ of value) n++;
  return n;
}

/** Splits a TLV string into fields. Throws QrError('MALFORMED') with the offset when it doesn't line up. */
export function parseTlv(input: string, offset = 0, parentTag?: string): EmvField[] {
  const chars = Array.from(input);
  const fields: EmvField[] = [];
  let i = 0;
  while (i < chars.length) {
    const where = parentTag ? `inside tag ${parentTag}` : 'in the payload';
    if (i + 4 > chars.length) {
      throw new QrError('MALFORMED', `Unexpected end of data ${where} at position ${offset + i}`, {
        position: offset + i,
      });
    }
    const tag = chars.slice(i, i + 2).join('');
    const len = chars.slice(i + 2, i + 4).join('');
    if (!/^\d\d$/.test(tag)) {
      throw new QrError('MALFORMED', `Expected a two-digit tag ${where} at position ${offset + i}, found "${tag}"`, {
        position: offset + i,
      });
    }
    if (!/^\d\d$/.test(len)) {
      throw new QrError('MALFORMED', `Tag ${tag} has an invalid length "${len}" at position ${offset + i + 2}`, {
        tag,
        position: offset + i + 2,
      });
    }
    const length = Number(len);
    if (i + 4 + length > chars.length) {
      throw new QrError(
        'MALFORMED',
        `Tag ${tag} says it is ${length} characters long, but only ${chars.length - i - 4} are left ${where}`,
        { tag, position: offset + i },
      );
    }
    fields.push({ tag, value: chars.slice(i + 4, i + 4 + length).join('') });
    i += 4 + length;
  }
  return fields;
}

/** Encodes fields as TLV. A field with children is encoded from its children, ignoring `value`. */
export function encodeTlv(fields: readonly EmvField[], parentTag?: string): string {
  let out = '';
  for (const field of fields) {
    if (!/^\d\d$/.test(field.tag)) {
      throw new QrError('INVALID_FIELD', `Tags must be two digits, got "${field.tag}"`, { tag: field.tag });
    }
    const path = parentTag ? `${parentTag}.${field.tag}` : field.tag;
    const value = field.children ? encodeTlv(field.children, path) : field.value;
    const length = charLength(value);
    if (length > 99) {
      throw new QrError('FIELD_TOO_LONG', `Tag ${path} is ${length} characters; the maximum is 99`, { tag: path });
    }
    out += field.tag + String(length).padStart(2, '0') + value;
  }
  return out;
}

/** Templates whose values are themselves TLV: merchant account information, additional data, language, unreserved. */
export function isTemplateTag(tag: string): boolean {
  const n = Number(tag);
  return (n >= 26 && n <= 51) || n === 62 || n === 64 || (n >= 80 && n <= 99);
}
