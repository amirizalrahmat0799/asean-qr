const encoder = new TextEncoder();

/**
 * CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF, no reflection, no final XOR), as required by
 * EMVCo for tag 63. Computed over the UTF-8 bytes of everything before the checksum, including "6304".
 * Returns four uppercase hex digits.
 */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (const byte of encoder.encode(data)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
