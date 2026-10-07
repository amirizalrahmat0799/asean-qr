import { guidInfo } from '../schemes/guids';
import { parsePayload } from './payload';
import type { EmvField } from './tlv';

const ROOT_NAMES: Record<string, string> = {
  '00': 'Payload format indicator',
  '01': 'Point of initiation method',
  '52': 'Merchant category code',
  '53': 'Transaction currency',
  '54': 'Transaction amount',
  '55': 'Tip or convenience indicator',
  '56': 'Convenience fee (fixed)',
  '57': 'Convenience fee (percentage)',
  '58': 'Country code',
  '59': 'Merchant name',
  '60': 'Merchant city',
  '61': 'Postal code',
  '62': 'Additional data',
  '63': 'CRC',
  '64': 'Merchant information (alternate language)',
};

const ADDITIONAL_DATA_NAMES: Record<string, string> = {
  '01': 'Bill number',
  '02': 'Mobile number',
  '03': 'Store label',
  '04': 'Loyalty number',
  '05': 'Reference label',
  '06': 'Customer label',
  '07': 'Terminal label',
  '08': 'Purpose of transaction',
  '09': 'Additional consumer data request',
  '10': 'Merchant tax ID',
  '11': 'Merchant channel',
};

const LANGUAGE_NAMES: Record<string, string> = {
  '00': 'Language preference',
  '01': 'Merchant name (alternate language)',
  '02': 'Merchant city (alternate language)',
};

const CURRENCIES: Record<string, string> = { '458': 'MYR', '702': 'SGD', '764': 'THB', '360': 'IDR', '704': 'VND' };

function rootName(tag: string): string {
  const n = Number(tag);
  if (ROOT_NAMES[tag]) return ROOT_NAMES[tag];
  if (n >= 2 && n <= 25) return 'Merchant account (card network)';
  if (n >= 26 && n <= 51) return 'Merchant account information';
  if (n >= 65 && n <= 79) return 'Reserved for future use';
  if (n >= 80 && n <= 99) return 'Unreserved template';
  return 'Unknown';
}

function childName(parent: string, child: string, guid: string | undefined): string {
  if (parent === '62') return ADDITIONAL_DATA_NAMES[child] ?? (Number(child) >= 50 ? 'Payment system specific' : 'RFU');
  if (parent === '64') return LANGUAGE_NAMES[child] ?? 'RFU';
  if (child === '00') return 'Globally unique identifier';
  return guidInfo(guid)?.subTags?.[child] ?? 'Payment network specific';
}

function note(field: EmvField): string {
  switch (field.tag) {
    case '01':
      return field.value === '11' ? 'static: reusable' : field.value === '12' ? 'dynamic: one payment' : '';
    case '53':
      return CURRENCIES[field.value] ?? '';
    case '55':
      return (
        { '01': 'payer enters a tip', '02': 'fixed fee in tag 56', '03': 'percentage fee in tag 57' }[field.value] ?? ''
      );
    default:
      return '';
  }
}

/**
 * A readable breakdown of a payload, one line per field, for logs and debugging:
 *
 * ```text
 * 00  Payload format indicator           02
 * 26  Merchant account information
 *       00  Globally unique identifier   A0000006150001  (DuitNow, PayNet)
 * ```
 * Works on damaged payloads too: a wrong checksum is reported rather than thrown.
 */
export function explain(payload: string): string {
  const parsed = parsePayload(payload, { verifyCrc: false });
  const lines: string[] = [];
  const row = (indent: string, tag: string, name: string, value: string, extra: string) =>
    lines.push(`${indent}${tag}  ${name.padEnd(40 - indent.length)} ${value}${extra ? `  (${extra})` : ''}`.trimEnd());

  for (const field of parsed.fields) {
    if (field.tag === '63') {
      row('', '63', 'CRC', field.value, parsed.crc.valid ? 'valid' : `INVALID, expected ${parsed.crc.expected}`);
      continue;
    }
    if (field.children) {
      row('', field.tag, rootName(field.tag), '', '');
      const guid = field.children.find((c) => c.tag === '00')?.value;
      for (const child of field.children) {
        const scheme = guidInfo(guid);
        const nested = scheme?.nested?.[child.tag];
        const inner = nested ? parseTlvSafe(child.value) : undefined;
        if (nested && inner) {
          // A template inside a template, e.g. VietQR's beneficiary (38.01): bank BIN + account
          row('      ', child.tag, childName(field.tag, child.tag, guid), '', '');
          for (const g of inner) row('            ', g.tag, nested[g.tag] ?? 'Sub-field', g.value, '');
          continue;
        }
        row(
          '      ',
          child.tag,
          childName(field.tag, child.tag, guid),
          child.value,
          child.tag === '00' && scheme ? scheme.label : '',
        );
      }
      continue;
    }
    row('', field.tag, rootName(field.tag), field.value, note(field));
  }
  for (const w of parsed.warnings) lines.push(`warning: ${w.message}`);
  return lines.join('\n');
}

function parseTlvSafe(value: string): EmvField[] | undefined {
  // Only treat a value as nested TLV when it parses cleanly from start to end
  const out: EmvField[] = [];
  let i = 0;
  while (i < value.length) {
    const tag = value.slice(i, i + 2);
    const len = value.slice(i + 2, i + 4);
    if (!/^\d\d$/.test(tag) || !/^\d\d$/.test(len)) return undefined;
    const end = i + 4 + Number(len);
    if (end > value.length) return undefined;
    out.push({ tag, value: value.slice(i + 4, end) });
    i = end;
  }
  return out;
}
