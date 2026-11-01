# Security and limitations

## Safety controls

- Read-only RPC methods are hard-coded in the collectors.
- Inputs accept only a u32 asset ID and a 20-byte EVM address.
- Remote plaintext `http://` and `ws://` endpoints are rejected; plaintext is allowed only for localhost development.
- Credentials embedded in endpoint URLs are rejected.
- Every Substrate and EVM operation has a bounded timeout. EVM transport retries and Substrate initialization retries are capped at two; failed Substrate providers are disconnected before the next 250/500 ms backoff attempt. Native anchor verification uses the same explicit bounded Substrate connection path rather than the provider's internal reconnect loop.
- Public request bodies cannot select RPC endpoints. Endpoint overrides are operator-controlled environment settings and are validated before use.
- Local and production HTTP adapters limit requests to 8 KiB, cap concurrent work per instance, and apply a bounded five-per-minute client limiter.
- Exported errors omit stack traces so evidence cannot leak deployment or developer filesystem paths.
- Runtime support is fail-closed against an exact reviewed chain/runtime profile. Missing, invalid, mismatched, or differently pinned identity evidence suppresses all dependent parity verdicts instead of displaying misleading individual passes.
- The CLI refuses to overwrite an existing evidence file.
- Balances and supplies remain decimal strings backed by `BigInt`; JavaScript floating-point numbers are never used for asset arithmetic.
- The browser renders response text with DOM `textContent`, not HTML injection.
- Preferred native anchoring accepts only a valid 32-byte SS58 account exposed by SubWallet, requires the reviewed Portaldot genesis/runtime, and permits only `system.remarkWithEvent` with the versioned FIRMA payload.
- Optional EVM anchoring accepts only a 20-byte EVM account, rejects SS58 accounts as EVM senders, requires chain ID `420420777`, and blocks maximum fees above a 1 tPOT safety ceiling.
- Preparation fixes a zero-value self-transaction containing only the versioned FIRMA prefix and deterministic report commitment.
- Both native and EVM preparation reject `FAIL` and `UNKNOWN` reports; only a genuine `PASS` report can reach fee review and wallet confirmation.
- The browser checks usable EVM balance, estimates a maximum fee, displays every material field, and requires an explicit checkbox and button action before opening the wallet request.
- The account and chain are checked again after confirmation. A changed context requires a fresh estimate. Rejections and replacements never trigger automatic resubmission.
- Private keys, recovery phrases, seed phrases, signed raw transactions, server-side signing, token transfers, approvals, and automatic submissions are absent by design.

## What FIRMA does not establish

- Endpoint honesty, consensus correctness, or cryptographic state proofs.
- Correctness of transfers, approvals, permits, event emission, gas charging, fees, or dust behavior.
- Safety of user-provided or third-party RPC infrastructure.
- Support for runtimes other than the explicitly recognized Portaldot V3 genesis and runtime-code fingerprint.
- Absence of unpublished competitors or undisclosed chain behavior.
- Truth of every claim in a report merely because its deterministic commitment was recorded.
- Report authorship merely because one wallet submitted an anchoring transaction.

## Known design risks

- The Substrate and EVM services could expose different histories even at an equal height. FIRMA records both surface-specific hashes but does not claim they should be identical; they use different block representations.
- Runtime upgrades can invalidate address, storage, or ABI assumptions. FIRMA gates support on the finalized runtime `:code` hash plus the reviewed identity tuple. It separately records raw metadata SHA-256 as evidence; that digest is not an approval key because an observed Revive fallback varies across block contexts with unchanged runtime code.
- Public endpoints can rate-limit, prune history, or return transient errors. Those outcomes are `UNKNOWN`.
- The current account check depends on a pre-existing Revive mapping. Missing mapping is `UNKNOWN`, not evidence of a zero balance or a broken chain.
- Function-memory rate limits are per instance and per region. A Vercel Firewall rate-limit rule is a required public-launch control, not an optional optimization.
- The CLI intentionally writes an operator-selected evidence path with no-overwrite semantics. Do not expose CLI arguments to untrusted remote users.
- Native SS58 and EVM account balances are distinct observations. A funded native address must not be treated as a funded EVM signer without an organizer-supported mapping or funding procedure and a fresh EVM balance query.
- Fresh EVM estimation on 2026-10-30 returned `466496802196` gas for an empty self-transaction and `623906712614` gas for the 39-byte payload. At gas price `26385`, the payload maximum was `164.6177861232039 tPOT`. The similarly high empty-transaction baseline indicates runtime gas/weight accounting rather than a payload-only error; FIRMA blocks it above the 1 tPOT ceiling.
- Native `system.remarkWithEvent` estimation for the supplied account and exact preflight payload returned `1490370719921` base units (`0.01490370719921 tPOT`) at finalized block `255734`. Estimates can change and are always recomputed before confirmation.
- A native sidecar is not self-authenticating. `VERIFIED` requires the canonical extrinsic, signer, exact call payload, `ExtrinsicSuccess`, and finality; missing history or events remains `UNAVAILABLE`.

## Privacy boundary

The read-only workflows send public inputs or user-selected evidence to the stateless API only after the user starts the relevant action. Preparing a new proof also sends the selected public wallet account, but signing material never reaches the server. Native signing and submission occur through the injected SubWallet extension in the browser; the complete report remains off-chain while the public commitment and normal transaction data become permanent chain evidence.

FIRMA has no application database, user accounts, analytics, or intentional secret collection. Hosting providers, RPC services, browsers, and wallet extensions remain separate parties with their own logging and retention behavior. The complete disclosure is in [PRIVACY.md](PRIVACY.md).

## Publication gate

Before sharing a public URL, stage Vercel Firewall rules for `POST /api/verify`, `POST /api/check-report`, and `POST /api/onchain-proof`, observe them in log mode, test enforcement on a preview, and only then publish the production rate limits. See `DEPLOYMENT.md`. Vercel's automatic DDoS mitigation does not replace these endpoint-specific usage controls.

## Responsible extension

The only authorized write surface is the optional contractless testnet commitment described above. Any broader write-conformance suite must use disposable funded accounts/assets, explicit organizer authorization, transaction budgets, idempotent cleanup where possible, and separate user confirmation. Contract deployment remains separately gated and is not part of this workflow.

