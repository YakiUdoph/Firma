# Security and limitations

## Safety controls

- Read-only RPC methods are hard-coded in the collectors.
- Inputs accept only a u32 asset ID and a 20-byte EVM address.
- Remote plaintext `http://` and `ws://` endpoints are rejected; plaintext is allowed only for localhost development.
- Credentials embedded in endpoint URLs are rejected.
- Network operations have bounded timeouts and at most two retries.
- The web server listens on `127.0.0.1`, limits requests to 8 KiB, permits one active verification per client, and applies a five-per-minute rate limit.
- The CLI refuses to overwrite an existing evidence file.
- Balances and supplies remain decimal strings backed by `BigInt`; JavaScript floating-point numbers are never used for asset arithmetic.
- The browser renders response text with DOM `textContent`, not HTML injection.

## What FIRMA does not establish

- Endpoint honesty, consensus correctness, or cryptographic state proofs.
- Correctness of transfers, approvals, permits, event emission, gas charging, fees, or dust behavior.
- Safety of user-provided or third-party RPC infrastructure.
- Support for runtimes other than the explicitly recognized Portaldot V3 shape.
- Absence of unpublished competitors or undisclosed chain behavior.

## Known design risks

- The Substrate and EVM services could expose different histories even at an equal height. FIRMA records both surface-specific hashes but does not claim they should be identical; they use different block representations.
- Runtime upgrades can invalidate address, storage, or ABI assumptions. FIRMA records spec/transaction/metadata versions and the metadata SHA-256 to make drift visible.
- Public endpoints can rate-limit, prune history, or return transient errors. Those outcomes are `UNKNOWN`.
- The current account check depends on a pre-existing Revive mapping. Missing mapping is `UNKNOWN`, not evidence of a zero balance or a broken chain.
- The local web server is a demo interface, not an internet-hardened multi-tenant service.

## Responsible extension

Any future write-conformance suite must use disposable funded accounts/assets, explicit organizer authorization, transaction budgets, idempotent cleanup where possible, and separate user confirmation. None of that functionality exists in this MVP.

