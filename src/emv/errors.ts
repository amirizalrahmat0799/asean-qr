/** Machine-readable reasons a payload or input was rejected. */
export type QrErrorCode =
  | 'EMPTY'
  | 'MALFORMED'
  | 'CRC_MISSING'
  | 'CRC_MISMATCH'
  | 'INVALID_FIELD'
  | 'FIELD_TOO_LONG'
  | 'MISSING_FIELD'
  | 'WRONG_SCHEME';

/** Thrown for anything the library can't parse or build. `code` is stable; `message` is for humans. */
export class QrError extends Error {
  override readonly name = 'QrError';
  readonly code: QrErrorCode;
  /** The tag the problem is about, e.g. "54" or "26.01", when there is one. */
  readonly tag: string | undefined;
  /** Character offset in the payload, for parse errors. */
  readonly position: number | undefined;

  constructor(code: QrErrorCode, message: string, details: { tag?: string; position?: number } = {}) {
    super(message);
    this.code = code;
    this.tag = details.tag;
    this.position = details.position;
  }
}

/** Something unusual that doesn't stop the payload from being used (most apps would still scan it). */
export interface QrWarning {
  code: 'MISSING_FIELD' | 'INVALID_FIELD' | 'FIELD_TOO_LONG' | 'NOT_TLV' | 'UNKNOWN_FORMAT';
  tag?: string;
  message: string;
}
