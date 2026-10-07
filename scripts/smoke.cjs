// Runs the built package the way a CommonJS user would (package self-reference), on any supported Node version.
const assert = require('node:assert');
const { decode, duitnow, paynow, promptpay, qris, vietqr, isValid } = require('asean-qr');

const payload = duitnow.create({
  acquirerId: '501664',
  merchantId: '123456789',
  merchantName: 'QRCSDNBHD',
  city: 'BANGI',
  mcc: '9999',
  amount: '10.00',
});
assert.ok(payload.endsWith('6304343F'), 'DuitNow example');
assert.strictEqual(decode(paynow.create({ mobile: '91234567' })).scheme, 'paynow');
assert.strictEqual(decode(promptpay.create({ mobile: '0812345678', amount: 1 })).amount, '1.00');
assert.strictEqual(decode(vietqr.create({ bin: '970436', account: '1', amount: 1000 })).amount, '1000');
assert.strictEqual(typeof qris.withAmount, 'function');
assert.strictEqual(isValid('nope'), false);
console.log(`CommonJS OK on Node ${process.version}`);
