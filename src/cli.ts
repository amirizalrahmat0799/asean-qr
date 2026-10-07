import { decode, validate } from './decode';
import { QrError } from './emv/errors';
import { explain } from './emv/explain';

const HELP = `asean-qr: inspect Southeast Asian payment QR payloads (DuitNow, PayNow, PromptPay, QRIS, VietQR)

Usage:
  asean-qr explain  <payload>   field-by-field breakdown with names (works on damaged payloads too)
  asean-qr decode   <payload>   decoded JSON: scheme, merchant, amount, account details
  asean-qr validate <payload>   exit code 0 if the payload is usable, 1 if not

The payload can also be piped in: echo "000201..." | asean-qr explain`;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '-h' || command === '--help') {
    console.log(HELP);
    return command ? 0 : 1;
  }
  const payload = rest.join('').trim() || (await readStdin());
  if (!payload) {
    console.error('No payload given.\n');
    console.error(HELP);
    return 1;
  }
  try {
    switch (command) {
      case 'explain':
        console.log(explain(payload));
        return 0;
      case 'decode': {
        const { payload: _parsed, ...decoded } = decode(payload);
        console.log(JSON.stringify(decoded, null, 2));
        return 0;
      }
      case 'validate': {
        const result = validate(payload);
        if (result.valid) {
          console.log(
            result.warnings.length
              ? `valid, with warnings:\n- ${result.warnings.map((w) => w.message).join('\n- ')}`
              : 'valid',
          );
          return 0;
        }
        console.log(`invalid: ${result.error?.message}`);
        return 1;
      }
      default:
        console.error(`Unknown command "${command}".\n`);
        console.error(HELP);
        return 1;
    }
  } catch (e) {
    if (e instanceof QrError) {
      console.error(`${e.code}: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

main().then((code) => {
  process.exitCode = code;
});
