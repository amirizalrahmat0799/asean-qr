# asean-qr

[![npm](https://img.shields.io/npm/v/asean-qr)](https://www.npmjs.com/package/asean-qr)
[![CI](https://github.com/amirizalrahmat0799/asean-qr/actions/workflows/ci.yml/badge.svg)](https://github.com/amirizalrahmat0799/asean-qr/actions/workflows/ci.yml)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![size](https://img.shields.io/badge/min%2Bgzip-7.7%20kB-blue)
[![license](https://img.shields.io/github/license/amirizalrahmat0799/asean-qr)](LICENSE)

Parse, validate and generate **Southeast Asian payment QR codes** with one API:

| | Scheme | Country | Generate | Decode |
|---|---|---|---|---|
| 🇲🇾 | **DuitNow QR** (PayNet) | Malaysia | ✅ | ✅ |
| 🇸🇬 | **PayNow** (also inside SGQR) | Singapore | ✅ mobile, UEN | ✅ |
| 🇹🇭 | **PromptPay** | Thailand | ✅ mobile, national ID, e-wallet, bill payment | ✅ |
| 🇮🇩 | **QRIS** | Indonesia | ✅ static → dynamic, with fees | ✅ |
| 🇻🇳 | **VietQR** (NAPAS) | Vietnam | ✅ account, card | ✅ |

All five are built on the same EMVCo merchant-presented QR standard, so the library is one small, well-tested
EMVCo core plus a thin module per scheme. It also decodes the common fields of any other EMVCo QR.

- **Zero dependencies**, 7.7 kB min+gzip for everything (3.9 kB if you only decode). Node, browsers, React Native, Deno, Bun.
- **Strict where it matters**: checksum verified, lengths checked, amounts formatted per currency (no decimals for
  rupiah and dong), and inputs validated with clear errors before you print a QR nobody can pay.
- **Verified against real references**: it reproduces PayNet's published DuitNow examples byte for byte and is
  cross-checked against the established single-country libraries (see [How it's verified](#how-its-verified)).
- **TypeScript-first**: decoded results are a discriminated union, so `qr.scheme === 'duitnow'` gives you
  `qr.acquirerId`; ESM and CommonJS builds.

```bash
npm install asean-qr
```

## Quick start

### Decode anything a customer scans

```ts
import { decode } from 'asean-qr';

const qr = decode(scannedText); // throws QrError if the payload is damaged or the checksum is wrong

qr.scheme;          // 'duitnow' | 'paynow' | 'promptpay' | 'qris' | 'vietqr' | 'unknown'
qr.merchant.name;   // 'KEDAI KOPI'
qr.amount;          // '12.50' (exactly as encoded) or undefined when the payer types it
qr.currency;        // 'MYR'
qr.dynamic;         // true for a one-time QR

switch (qr.scheme) {
  case 'duitnow':   console.log(qr.acquirerId, qr.merchantId); break;
  case 'paynow':    console.log(qr.proxyType, qr.proxyValue, qr.expiry); break;
  case 'promptpay': console.log(qr.kind === 'transfer' ? qr.target : qr.billerId); break;
  case 'qris':      console.log(qr.nmid, qr.acquirers); break;
  case 'vietqr':    console.log(qr.bin, qr.account, qr.purpose); break;
}
```

### Generate a QR

`create()` returns the payload text. Turn it into an image with any QR library, for example
[`qrcode`](https://www.npmjs.com/package/qrcode):

```ts
import QRCode from 'qrcode';
import { duitnow } from 'asean-qr';

const payload = duitnow.create({
  acquirerId: '501664',        // your acquiring bank's ID, from PayNet
  merchantId: '123456789',     // your merchant ID at that bank
  merchantName: 'KEDAI KOPI',
  city: 'CYBERJAYA',
  mcc: '5814',
  amount: '12.50',             // omit to let the payer enter the amount
});

await QRCode.toFile('pay.png', payload, { errorCorrectionLevel: 'M' });
```

## Schemes

### 🇲🇾 DuitNow

```ts
import { duitnow } from 'asean-qr';

duitnow.create({
  acquirerId: '501664',
  merchantId: '123456789',
  merchantName: 'QRCSDNBHD',   // up to 25 characters
  city: 'BANGI',               // up to 15 characters
  mcc: '9999',                 // default '0000' (person to person)
  amount: '10.00',             // optional
});
// => '00020201021126410014A0000006150001...6304343F'  (PayNet's published retail example)

// Optional extras: postalCode, dynamic: true (one-time QR), and additionalData for tag 62
duitnow.create({ ...merchant, amount: 25, dynamic: true, additionalData: { billNumber: 'INV-0042' } });

const qr = duitnow.decode(payload);   // throws QrError('WRONG_SCHEME') for other schemes
```

DuitNow uses payload format version `02`, as in PayNet's published examples; the library follows that.

### 🇸🇬 PayNow

```ts
import { paynow } from 'asean-qr';

paynow.create({ mobile: '9123 4567' });              // payer enters the amount
paynow.create({
  uen: '201234567A',
  amount: 88.8,                                      // '88.80'
  reference: 'INV-0042',                             // shown in the payer's app (tag 62.01)
  expiry: '20261231',                                // or a Date (its local date is used)
  editable: false,                                   // default: false with an amount, true without
  merchantName: 'Example Pte Ltd',
});

paynow.normalizeMobile('+65 9123 4567');             // '+6591234567'
```

`decode()` also finds PayNow inside a multi-scheme **SGQR**; every scheme on the code is listed in `qr.accounts`.

### 🇹🇭 PromptPay

```ts
import { promptpay } from 'asean-qr';

promptpay.create({ mobile: '081-234-5678', amount: 100 });    // mobile becomes 0066812345678
promptpay.create({ nationalId: '1-2345-67890-12-3' });       // or a tax ID, 13 digits
promptpay.create({ eWalletId: '123456789012345' });          // 15 digits

promptpay.billPayment({ billerId: '010555512345601', ref1: 'CUST0001', ref2: 'INV42', amount: 1500 });
```

### 🇮🇩 QRIS

A merchant's QRIS is issued by its acquirer, so instead of creating one from scratch you take the merchant's
static QRIS and turn it into a one-time QR for the amount at checkout. Everything else stays as issued.

```ts
import { qris } from 'asean-qr';

const checkout = qris.withAmount(merchantStaticQris, 25000);                       // whole rupiah
const withFee  = qris.withAmount(merchantStaticQris, 25000, { fee: { fixed: 1000 } });
const withPct  = qris.withAmount(merchantStaticQris, 25000, { fee: { percent: 0.7 } });

const qr = qris.decode(checkout);
qr.nmid;              // national merchant ID, e.g. 'ID1020000000001'
qr.merchantCriteria;  // 'UMI' | 'UKE' | 'UME' | 'UBE' | 'URE'
qr.acquirers;         // [{ guid: 'ID.CO.BANK.WWW', merchantPan: '9360...', merchantId: '...' }]
qr.fee;               // { type: 'fixed', amount: '1000' }
```

### 🇻🇳 VietQR

```ts
import { asciiFold, vietqr } from 'asean-qr';

vietqr.create({
  bin: '970436',                                   // the bank's NAPAS BIN
  account: '0011001234567',
  amount: 150000,                                  // whole dong
  purpose: asciiFold('Thanh toán đơn hàng'),       // 'Thanh toan don hang': payment apps expect ASCII
});

vietqr.create({ bin: '970436', account: '9704361234567890', service: 'card' });
```

## Tools

```ts
import { explain, isValid, validate, withAmount } from 'asean-qr';

isValid(text);              // boolean: structure and checksum
validate(text);             // { valid, error, warnings }: never throws

withAmount(staticQr, 25);   // any scheme: one-time copy with the amount, in the currency's format

console.log(explain(text)); // field-by-field breakdown, great in logs and bug reports
```

```text
00  Payload format indicator                 02
01  Point of initiation method               11  (static: reusable)
26  Merchant account information
      00  Globally unique identifier         A0000006150001  (DuitNow, PayNet Malaysia)
      01  Acquirer ID                        501664
      02  Merchant or recipient ID           123456789
52  Merchant category code                   9999
53  Transaction currency                     458  (MYR)
54  Transaction amount                       10.00
58  Country code                             MY
59  Merchant name                            QRCSDNBHD
60  Merchant city                            BANGI
63  CRC                                      343F  (valid)
```

The same is available from the command line, no install needed:

```bash
npx asean-qr explain  "000202010211..."
npx asean-qr decode   "000202010211..."   # JSON
npx asean-qr validate "000202010211..."   # exit code 0 or 1
```

Lower-level building blocks are exported too: `parsePayload`, `buildPayload`, `getTag`, `getSubTag`, `crc16`,
`formatAmount`, `asciiFold`, and the `GUID` and `CURRENCY` constants.

## Errors

Everything the library rejects throws a `QrError` with a stable `code`, a readable `message`, and the `tag` it is
about (`'54'`, `'26.02'`, ...). Parse errors also carry the character `position`.

| Code | Meaning |
|---|---|
| `EMPTY` | Nothing to parse |
| `MALFORMED` | The TLV structure doesn't line up, or the payload doesn't start with tag 00 |
| `CRC_MISSING` / `CRC_MISMATCH` | No checksum at the end, or it doesn't match (a damaged or tampered payload) |
| `INVALID_FIELD` | A value is wrong: not a Singapore mobile number, a 7-digit national ID, decimals in rupiah... |
| `FIELD_TOO_LONG` | Over the EMVCo limit, e.g. a merchant name longer than 25 characters |
| `MISSING_FIELD` | A required input is empty |
| `WRONG_SCHEME` | `paynow.decode()` was given a DuitNow QR, and so on |

Oddities that most payment apps tolerate (a missing country code, an overlong name in a QR someone else made)
are reported in `warnings` instead of thrown. Pass `{ strict: true }` to treat them as errors.

## How it's verified

- **Official examples**: PayNet's published DuitNow examples are reproduced byte for byte, including their
  checksums (`343F`, `3A23`).
- **Cross-checked against established libraries** (dev dependencies only), on every CI run:
  - VietQR is **byte-identical** to [vietnam-qr-pay](https://www.npmjs.com/package/vietnam-qr-pay), which also
    parses our output.
  - QRIS static → dynamic with a fee is **byte-identical** to [qris-dinamis](https://www.npmjs.com/package/qris-dinamis).
  - PromptPay matches [promptpay-qr](https://www.npmjs.com/package/promptpay-qr) field for field.
  - PayNow matches [paynowqr](https://www.npmjs.com/package/paynowqr) field for field.
- **Property-based tests** ([fast-check](https://fast-check.dev)), about 10,000 generated cases per run: the parser
  only ever throws `QrError` on arbitrary input, every single-character change to a valid payload is detected, every
  2-decimal amount formats exactly, and generated QRs round-trip through `decode()`.
- **Independent fixtures**: test payloads are encoded by a separate script, not by the library itself.

## Good to know

- **A QR is not a payment.** Decoding tells you what the payer will be asked to pay. Confirm the payment from your
  bank or payment provider (webhook or status API) before releasing goods.
- **Static vs dynamic**: a static QR (`dynamic: false`) can be paid many times; a dynamic one is meant for a
  single payment. Banks may treat them differently, so use dynamic QRs for checkouts.
- **Test with real apps** before going live. Schemes evolve, and some banks are stricter than the specifications.
- This is an independent open-source project. It is not affiliated with or endorsed by PayNet, the Association of
  Banks in Singapore, Bank of Thailand, Bank Indonesia, NAPAS or EMVCo. Scheme names are trademarks of their owners.

## Contributing

Issues and pull requests are welcome, especially real-world payloads that don't decode as expected (please
replace account numbers first) and more schemes, such as Cambodia's KHQR or the Philippines' QR Ph.

```bash
npm install
npm test          # unit, interoperability and property tests
npm run lint
npm run build
```

## License

[MIT](LICENSE) © Ahmad Amirizal Rahmat
