# Security and limitations

## Safety controls

- Read-only RPC methods are hard-coded in the collectors.
- Inputs accept only a u32 asset ID and a 20-byte EVM address.
- Remote plaintext `http://` and `ws://` endpoints are rejected; plaintext is allowed only for localhost development.
- Credentials embedded in endpoint URLs are rejected.
- Every Substrate and EVM operation has a bounded timeout; EVM transport retries are capped at two.
- Substrate initialization retains the `ApiPromise` instance before waiting for readiness. On timeout FIRMA disconnects both that instance and its `WsProvider`, so a timed-out readiness promise cannot later leave an unowned connection open. The Polkadot API readiness promise has no `AbortSignal` interface; disconnect is the available cancellation boundary, and the timeout still remains `UNKNOWN` evidence.
- Independent historical checks own one shared request deadline. A transient Substrate timeout permits exactly one fresh-session retry at the same imported block; both attempts, EVM reads, and cleanup remain inside that deadline. Exhaustion stays `UNAVAILABLE`, never `VERIFIED` or `MISMATCH`. Polkadot API initialization cannot be force-cancelled internally, so FIRMA disconnects the owned API/provider and briefly drains readiness settlement; library callbacks may still finish during that bounded cleanup window.
- Public request bodies cannot select RPC endpoints. Endpoint overrides are operator-controlled environment settings and are validated before use.
- Verification requests are limited to 8 KiB. Independent report-check requests are limited to a 1 MiB envelope, while imported report text is limited to 256 KiB. Both adapters cap concurrent work and apply bounded per-client rate limits.
- EVM JSON-RPC response bodies are streamed with a 512 KiB hard limit, strict UTF-8 JSON decoding, matching response IDs, and one-result-or-error envelope validation. Oversized responses stop without being recorded as evidence.
- ABI dynamic strings require a canonical 32-byte offset, exact 32-byte alignment, bounded length, zero padding, and strict UTF-8. Decode failures stay unavailable and make dependent checks `UNKNOWN`.
- Exported errors omit stack traces so evidence cannot leak deployment or developer filesystem paths.
- Runtime support is fail-closed against an exact reviewed chain/runtime profile. Missing, invalid, mismatched, or differently pinned identity evidence suppresses all dependent parity verdicts instead of displaying misleading individual passes.
- The CLI refuses to overwrite an existing evidence file.
- Balances and supplies remain decimal strings backed by `BigInt`; JavaScript floating-point numbers are never used for asset arithmetic.
- The browser renders response text with DOM `textContent`, not HTML injection.
- Imported reports must contain the complete expected read-only EVM transcript. FIRMA validates JSON-RPC methods, IDs, retry attempts, parameters, block tags, responses, decoded values, and duplicated verdict evidence before any historical reproduction.
- A recomputed report commitment is not authentication. Authentication requires an independently supplied trusted commitment; absent that anchor, the checker reports `UNANCHORED` and the aggregate result can be `REPRODUCED` but never `AUTHENTICATED`.

## What FIRMA does not establish

- Endpoint honesty, consensus correctness, or cryptographic state proofs.
- Authenticity or provenance of an unanchored uploaded report, even when its historical claims reproduce.
- Correctness of transfers, approvals, permits, event emission, gas charging, fees, or dust behavior.
- Safety of user-provided or third-party RPC infrastructure.
- Support for runtimes other than the explicitly recognized Portaldot V3 genesis and runtime-code fingerprint.
- Absence of unpublished competitors or undisclosed chain behavior.

## Known design risks

- The Substrate and EVM services could expose different histories even at an equal height. FIRMA records both surface-specific hashes but does not claim they should be identical; they use different block representations.
- Runtime upgrades can invalidate address, storage, or ABI assumptions. FIRMA gates support on the finalized runtime `:code` hash plus the reviewed identity tuple. It separately records raw metadata SHA-256 as evidence; that digest is not an approval key because an observed Revive fallback varies across block contexts with unchanged runtime code.
- Public endpoints can rate-limit, prune history, or return transient errors. Those outcomes are `UNKNOWN`.
- The current account check depends on a pre-existing Revive mapping. Missing mapping is `UNKNOWN`, not evidence of a zero balance or a broken chain.
- Function-memory rate limits are per instance and per region. The current `firma` project also has one live Vercel Firewall rule for `/api/`: fixed window, 10 requests per 60 seconds per IP, returning the platform rate-limit action. This project control must be re-inspected before release because it is not stored in Git.
- The CLI intentionally writes an operator-selected evidence path with no-overwrite semantics. Do not expose CLI arguments to untrusted remote users.

## Publication gate

Before promotion, confirm the existing live `/api/` firewall rule still covers both `POST /api/verify` and `POST /api/check-report`, test the exact protected preview, and preserve Deployment Protection. Do not edit or republish firewall configuration as part of an application deployment. See `DEPLOYMENT.md`. Vercel's automatic DDoS mitigation does not replace endpoint-specific usage control.

## Responsible extension

Any future write-conformance suite must use disposable funded accounts/assets, explicit organizer authorization, transaction budgets, idempotent cleanup where possible, and separate user confirmation. None of that functionality exists in this MVP.

