# Security and limitations

## Safety controls

- Read-only RPC methods are hard-coded in the collectors.
- Inputs accept only a u32 asset ID and a 20-byte EVM address.
- Remote plaintext `http://` and `ws://` endpoints are rejected; plaintext is allowed only for localhost development.
- Credentials embedded in endpoint URLs are rejected.
- Every Substrate and EVM operation has a bounded timeout; EVM transport retries are capped at two.
- Public request bodies cannot select RPC endpoints. Endpoint overrides are operator-controlled environment settings and are validated before use.
- Verification requests are limited to 8 KiB. Independent report-check requests are limited to a 1 MiB envelope, while imported report text is limited to 256 KiB. Both adapters cap concurrent work and apply bounded per-client rate limits.
- Exported errors omit stack traces so evidence cannot leak deployment or developer filesystem paths.
- Runtime support is fail-closed against an exact reviewed chain/runtime profile. Missing, invalid, mismatched, or differently pinned identity evidence suppresses all dependent parity verdicts instead of displaying misleading individual passes.
- The CLI refuses to overwrite an existing evidence file.
- Balances and supplies remain decimal strings backed by `BigInt`; JavaScript floating-point numbers are never used for asset arithmetic.
- The browser renders response text with DOM `textContent`, not HTML injection.

## What FIRMA does not establish

- Endpoint honesty, consensus correctness, or cryptographic state proofs.
- Correctness of transfers, approvals, permits, event emission, gas charging, fees, or dust behavior.
- Safety of user-provided or third-party RPC infrastructure.
- Support for runtimes other than the explicitly recognized Portaldot V3 genesis and runtime-code fingerprint.
- Absence of unpublished competitors or undisclosed chain behavior.

## Known design risks

- The Substrate and EVM services could expose different histories even at an equal height. FIRMA records both surface-specific hashes but does not claim they should be identical; they use different block representations.
- Runtime upgrades can invalidate address, storage, or ABI assumptions. FIRMA gates support on the finalized runtime `:code` hash plus the reviewed identity tuple. It separately records raw metadata SHA-256 as evidence; that digest is not an approval key because an observed Revive fallback varies across block contexts with unchanged runtime code.
- Public endpoints can rate-limit, prune history, or return transient errors. Those outcomes are `UNKNOWN`.
- The current account check depends on a pre-existing Revive mapping. Missing mapping is `UNKNOWN`, not evidence of a zero balance or a broken chain.
- Function-memory rate limits are per instance and per region. A Vercel Firewall rate-limit rule is a required public-launch control, not an optional optimization.
- The CLI intentionally writes an operator-selected evidence path with no-overwrite semantics. Do not expose CLI arguments to untrusted remote users.

## Publication gate

Before sharing a public URL, stage Vercel Firewall protection for both `POST /api/verify` and `POST /api/check-report`, observe it in log mode, test enforcement on a preview, and only then publish the production rate limit. See `DEPLOYMENT.md`. Vercel's automatic DDoS mitigation does not replace this endpoint-specific usage control.

## Responsible extension

Any future write-conformance suite must use disposable funded accounts/assets, explicit organizer authorization, transaction budgets, idempotent cleanup where possible, and separate user confirmation. None of that functionality exists in this MVP.

