// Same as smoke.cjs, through the ES module build.
import assert from 'node:assert';
import { decode, duitnow, explain } from 'asean-qr';

const payload = duitnow.create({ acquirerId: '501664', merchantId: '123456789', merchantName: 'QRCSDNBHD', city: 'BANGI', mcc: '9999', amount: '10.00' });
assert.strictEqual(decode(payload).scheme, 'duitnow');
assert.match(explain(payload), /343F {2}\(valid\)/);
console.log(`ES module OK on Node ${process.version}`);
