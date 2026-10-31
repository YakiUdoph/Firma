# FIRMA Phase 7E independent verification release audit

Audit date: 2026-10-23

Audited head: PR #5 (`feat/phase-7d-independent-evidence`)

Comparison bases: PR #4 (`review/premium-verification-workspace`) and `origin/main`
Recommendation after corrections: **PASS**

No merge, production deployment, wallet connection, signature, transaction, or contract deployment was performed.

## Release-blocking findings and corrections

| Severity | Finding and reproduction evidence | Source | Correction and validation |
| --- | --- | --- | --- |
| HIGH | A target block was treated as finalized whenever `chain_getBlockHash(height)` returned a hash. A best-chain block above the finalized head could therefore make historical claims `VERIFIED`. Live reproduction observed best block `158535` while finalized was `158533`; the EVM block was retrievable. | `src/verifier.mjs`, `src/independent-verifier.mjs` | The collector now rejects any requested height above the latest finalized head as `HistoricalFinalityUnavailable`; the independent verifier also checks the reproduced block number against the reproduced finalized head. In a second live connection, target `158535` remained above finalized `158534`, EVM history was available, and FIRMA returned `{ available: false, finalized: false }`. Unit regression: “a retrievable block newer than the finalized head is UNAVAILABLE.” |
| MEDIUM | Some preserved evidence was excluded from comparison: native asset/mapping/balance storage keys and successful EVM raw return bytes could be changed while their semantic claim still read `VERIFIED`. | `src/independent-verifier.mjs` | These fields are now part of the independently compared claim. Adversarial storage-key and raw-byte mutations return `MISMATCH`. |
| MEDIUM | The serverless report API called `request.text()` before applying the actual byte limit. A request without a trustworthy `Content-Length` could be fully buffered before the 1 MiB rejection. | `api/check-report.mjs` | Added bounded stream reading that cancels as soon as the byte limit is exceeded and returns HTTP 413. Regression covers an oversized request without a declared length. |
| MEDIUM | The report API had per-RPC deadlines but no explicit end-to-end deadline or timeout response class. A slow verifier could run into the platform limit and surface an ambiguous failure. | `api/check-report.mjs`, `server.mjs` | Added a 55-second verification deadline and explicit HTTP 504 response. Injected never-resolving verifier regression passes. |
| LOW | Core schema validation rejected unknown top-level fields but allowed unknown nested evidence fields. Such fields were preserved without being part of the supported claim set. | `src/report-import.mjs` | Added allowlists for imported evidence, runtime, fingerprint, asset, mapping, balance, EVM block/calls, and evidence input structures. Nested extra-claim regression is rejected before RPC work. |
| LOW | Browser coverage exercised only `VERIFIED`; visual or accessibility regressions in `MISMATCH` and `UNAVAILABLE` were not caught. | `test/browser.test.mjs` | Real Chrome now exercises all three states and captures separate negative-state screenshots. Keyboard and axe checks remain enabled. |

No confirmed release-blocking defect remains after these corrections.

## Justification for every independent `VERIFIED` claim

| Claim | Independent evidence required before `VERIFIED` |
| --- | --- |
| Native network identity | Configured Substrate endpoint independently returns chain identity and properties, and the target passes the historical-finality gate. Imported endpoint URLs are ignored. |
| EVM network identity | Configured EVM endpoint independently returns `eth_chainId`; the imported URL is ignored. |
| Native finalized block reference | `chain_getFinalizedHead` and its header establish a finalized height at or above the target; `chain_getBlockHash(target)` and `chain_getHeader(hash)` reproduce the exact number/hash. Merely retrievable best-chain data is insufficient. |
| EVM historical block reference | `eth_getBlockByNumber` at the exact imported height reproduces the reported EVM number and hash. No latest-state fallback is used. |
| Runtime version and metadata | `state_getRuntimeVersion(hash)`, `state_getMetadata(hash)`, the metadata SHA-256, pallets, and query surfaces are independently collected at the reproduced native block hash. |
| Genesis and runtime-code fingerprint | Genesis is independently read with block 0; `state_getStorageHash(:code, targetHash)` reproduces the runtime code hash at the exact target. |
| Asset identifiers | Historical native asset ID and the deterministic EVM precompile address derived from that ID are both reproduced. |
| Native asset existence and supply | Historical `Assets.Asset` state, storage key, existence, ID, and base-unit supply are reproduced through `api.at(targetHash)`. |
| Runtime account mapping | Historical `Revive.OriginalAccount` existence, H160, AccountId, and storage key are reproduced. |
| Native account balance | Historical `Assets.Account` existence, exact arbitrary-precision balance, and storage key are reproduced. |
| Native asset metadata | Historical metadata existence, storage key, name, symbol, and decimals are reproduced. |
| EVM `totalSupply` | Exact-block `eth_call` reproduces decoded value and raw return bytes. |
| EVM `balanceOf` | Exact-block `eth_call` for the imported H160 reproduces decoded value and raw return bytes. |
| EVM `name`, `symbol`, and `decimals` | Each exact-block `eth_call` independently reproduces decoded values and raw bytes; recognized metadata absence is compared as an explicit semantic result. |
| Nine original verdict checks | The existing `evaluateSnapshot` logic is rerun against the independently collected snapshot. A verdict check is `UNAVAILABLE` if its required historical inputs are unavailable. Imported asset-verdict semantics were not changed. |
| Deterministic report commitment | RFC 8785 canonicalization plus the Phase 7B domain-separated SHA-256 commitment is recomputed over the preserved import. This is a deterministic file-integrity verification, not blockchain evidence and not proof of an on-chain commitment. |

## Adversarial report matrix

The audit mutated each category independently while keeping the report structurally valid. All applicable cases returned `MISMATCH`; internally inconsistent reports were rejected before RPC work.

- Native and EVM network identity
- Native and EVM block hashes
- Runtime version and runtime code hash
- Asset precompile identifier
- Runtime account mapping
- Native balance and its storage key
- Native and EVM metadata
- Successful EVM raw return bytes
- Imported check status, counts, and overall verdict
- Expected deterministic commitment

Malformed JSON, duplicate keys, prototype-related keys, excessive size, extra nested claims, mismatched evidence inputs, incomplete fingerprints, and non-finalized original context fail safely.

## API and operational audit

- Report payload: 256 KiB UTF-8 maximum; outer request: 1 MiB bounded stream maximum.
- Methods/content: POST and JSON required; other methods return 405, other content types 415.
- Rate limit: three checks per minute per bounded client key; fourth request returns 429 with `Retry-After`.
- Concurrency: maximum three active report checks per serverless instance; excess returns 503.
- Deadline: 55 seconds; deadline returns 504.
- Malformed or invalid imports: 400.
- Expected endpoint unavailability: HTTP 200 with independent result `UNAVAILABLE`, never `VERIFIED`.
- Unexpected implementation errors: sanitized 500 response with a request ID.
- The limiter is intentionally in-memory and per instance. It is not a globally coordinated abuse-control system.
- The deadline stops response waiting but does not propagate cancellation into every WebSocket operation; underlying RPC calls remain bounded by their own configured deadlines.

## Production and original-flow boundaries

- Production functions remain exactly `api/verify.mjs` and `api/check-report.mjs`.
- Production entry points do not import `proof-transaction.mjs`, contract build/deployment scripts, `submitReportCommitment`, `sendTransaction`, or Ethereum send methods.
- Experimental proof helpers remain reachable only through explicit local imports/npm scripts. Nothing in the browser or production HTTP routes can invoke them.
- Relative to PR #4, `api/verify.mjs` and `src/evaluate.mjs` are unchanged. The existing asset form, endpoint, and `PASS`/`FAIL`/`UNKNOWN` semantics remain intact.
- A fresh live report produced the original asset verdict `PASS` before independent verification.

## Real Portaldot V3 evidence

Default 15-second RPC deadline:

- Original report succeeded at finalized block `158500`.
- Independent historical Substrate metadata exceeded 15 seconds.
- Result: `UNAVAILABLE` with 10 verified, 0 mismatch, 16 unavailable. This was correct fail-closed behavior.
- A subsequent default-timeout attempt produced incomplete Substrate evidence and was rejected by strict import rather than treated as verified.

Supported 30-second RPC deadline retry:

| Observation | Result |
| --- | --- |
| Original asset verdict | `PASS` |
| Imported finalized block | `158525` / `0x98c2b0f61094759fd10010208f95a6b375521ca67f57827d95a293cdf62b87c4` |
| Independently observed finalized head | `158527` / `0x1828a9457f032616f40123c6dc22f663d2fb9b0ab1dbdbda1a946af4a02a8cbe` |
| Exact EVM block | `158525` / `0x73bccf016ebcd2e7adcc031d15f1c7cbdbcd489b88c44cf082972cc8576ddf32` |
| Genesis hash | `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd` |
| Runtime code hash | `0xedc03c9dc81d39fea5c02893cc34cf2ec898d55d7ee8f8e89eb27597a724c7c2` |
| Independent result | `VERIFIED` |
| Counts | 26 verified, 0 mismatch, 0 unavailable |
| Commitment | `0xd51e40b2b422cefbb5cb8f8ad5a1c316b8217e4d201b01fa71c4f6d2a2abc9c9` |
| Completed | `2026-10-23T09:31:22.567Z` |

Finality distinction probe:

- Best block observed: `158535` / `0xe0a82448e8aac78fecee4daa7df58eb1a916a746d3f1ee8358c9004e69658114`.
- Finalized head initially observed: `158533` / `0x947468cdec46157786185858d344913b244528eabff4c429ae1e0d86719ffd8f`.
- During the verifier's new connection, finality advanced to `158534`; requested block `158535` remained unfinalized while its EVM block was retrievable.
- FIRMA classified the target `UNAVAILABLE` with `HistoricalFinalityUnavailable`.

## Automated validation

- `npm run check`: **86 passed, 0 failed, 0 skipped**; all syntax checks passed.
- `npm run build`: passed.
- Chrome upload/result checks: `VERIFIED`, `MISMATCH`, and `UNAVAILABLE` passed.
- Accessibility: zero serious or critical axe violations; keyboard focus order passed.
- Production-route isolation regression passed.

Screenshots:

- [Mismatch](./phase-7e-mismatch.png)
- [Unavailable](./phase-7e-unavailable.png)

## Remaining limitations

1. Public RPC latency is variable. The default 15-second evidence deadline can yield honest `UNAVAILABLE`; the supported 30-second retry succeeded. This is an availability limitation, not evidence of a mismatch.
2. Historical retention is provider-dependent and can change. FIRMA never substitutes latest state.
3. Older reports without the required runtime fingerprint and finalized-head context are rejected as incomplete.
4. A recomputed commitment proves report integrity only; it does not prove on-chain publication.
5. The independent workflow verifies listed read observations, not write behavior, events, permits, fees, or transactions.

## Final recommendation

**PASS** — PR #5 is suitable for review and release after the corrections in this audit. No production deployment or merge is authorized by this recommendation.
