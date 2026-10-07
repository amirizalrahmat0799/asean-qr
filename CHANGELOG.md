# Changelog

All notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-07

### Added
- EMVCo merchant-presented QR core: TLV parsing with nested templates, CRC-16/CCITT-FALSE, validation with
  structured errors (`QrError`) and warnings, payload building, `explain()` breakdown.
- DuitNow (Malaysia): create and decode; reproduces PayNet's published examples.
- PayNow (Singapore): create for mobile numbers and UENs with amount, editable flag, expiry and reference; decode,
  including PayNow inside multi-scheme SGQR codes.
- PromptPay (Thailand): credit transfers to a mobile number, national or tax ID, or e-wallet; bill payments; decode.
- QRIS (Indonesia): decode, and static to dynamic conversion with fixed or percentage fees.
- VietQR (Vietnam): account and card transfers with amount and message; decode.
- `decode()` with scheme detection, `validate()`, `isValid()`, `withAmount()` for any scheme, `asciiFold()`.
- `asean-qr` command-line tool: `explain`, `decode` and `validate`.
- ESM and CommonJS builds with TypeScript types; no dependencies; Node 18+ and browsers.

[Unreleased]: https://github.com/amirizalrahmat0799/asean-qr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/amirizalrahmat0799/asean-qr/releases/tag/v0.1.0
