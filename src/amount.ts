import { QrError } from './emv/errors';

/** ISO 4217 numeric codes for the supported currencies (tag 53). */
export const CURRENCY = { MYR: '458', SGD: '702', THB: '764', IDR: '360', VND: '704' } as const;

const ALPHA: Record<string, string> = { '458': 'MYR', '702': 'SGD', '764': 'THB', '360': 'IDR', '704': 'VND' };

/** Decimal places an amount may have: rupiah and dong are whole numbers. */
const DECIMALS: Record<string, number> = { '458': 2, '702': 2, '764': 2, '360': 0, '704': 0 };

/** An amount as a number (`12.5`) or a decimal string (`"12.50"`). Strings avoid floating-point surprises. */
export type Amount = number | string;

export function currencyAlpha(numeric: string | undefined): string | undefined {
  return numeric ? ALPHA[numeric] : undefined;
}

export function currencyDecimals(numeric: string | undefined): number {
  return numeric ? (DECIMALS[numeric] ?? 2) : 2;
}

/**
 * Formats an amount for tag 54: no more decimals than the currency allows (whole numbers for IDR and VND),
 * always the full number of decimals otherwise ("10" becomes "10.00" for MYR), positive, at most 13 characters.
 */
export function formatAmount(amount: Amount, currencyCode: string): string {
  const decimals = currencyDecimals(currencyCode);
  const name = ALPHA[currencyCode] ?? currencyCode;
  let text: string;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new QrError('INVALID_FIELD', `The amount must be a positive number, got ${amount}`, { tag: '54' });
    }
    const scaled = amount * 10 ** decimals;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6 * Math.max(1, Math.abs(scaled))) {
      throw new QrError('INVALID_FIELD', `${name} amounts can have at most ${decimals} decimal places, got ${amount}`, {
        tag: '54',
      });
    }
    text = (Math.round(scaled) / 10 ** decimals).toFixed(decimals);
  } else {
    const s = String(amount).trim();
    const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
    if (!pattern.test(s)) {
      throw new QrError(
        'INVALID_FIELD',
        decimals === 0
          ? `${name} amounts must be whole numbers, got "${s}"`
          : `"${s}" is not a valid amount (digits, optionally with up to ${decimals} decimals)`,
        { tag: '54' },
      );
    }
    const [int = '0', frac = ''] = s.split('.');
    const whole = int.replace(/^0+(?=\d)/, '');
    text = decimals === 0 ? whole : `${whole}.${frac.padEnd(decimals, '0')}`;
    if (!/[1-9]/.test(text)) throw new QrError('INVALID_FIELD', 'The amount must be more than zero', { tag: '54' });
  }
  if (text.length > 13) {
    throw new QrError('FIELD_TOO_LONG', `The amount ${text} is longer than 13 characters`, { tag: '54' });
  }
  return text;
}
