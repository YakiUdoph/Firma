# Hacker House progress

> Historical dated log. Current product status is maintained in [`../PROGRESS.md`](../PROGRESS.md), and current actions are maintained in [`../TASKS.md`](../TASKS.md). Statements about missing transactions or future gates describe the date and phase in which they were recorded.

## 2026-10-31 — final live verification and release preparation

### First genuine native anchor independently verified

- Preserved the original exported `firma.anchor.native.v1` sidecar as `evidence/native-anchor-sidecar-2026-10-31-3b2f4eac7f1e.json` without changing the original report or sidecar claims.
- Reproduced the initial result through the real local API: 2 `VERIFIED`, 0 `MISMATCH`, and 8 `UNAVAILABLE` because native `ApiPromise` initialization hit its single 15-second deadline. A raw WebSocket read returned the exact canonical block hash in 1.911 seconds during isolation.
- Confirmed and fixed the implementation defect: native proof verification still used the provider's internal reconnect mode instead of FIRMA's existing explicit bounded connection attempts. It now reuses the shared bounded connection helper, preserves cleanup and retry limits, and still returns `UNAVAILABLE` on exhaustion. The verifier also explicitly records and enforces reviewed call index `0x0007`.
- The exact report and sidecar then returned 10 `VERIFIED`, 0 `MISMATCH`, and 0 `UNAVAILABLE`. Live evidence confirmed canonical block `263713` (`0x645b9184…b1b06ab6`), extrinsic index `1`, hash `0x3b2f4eac…1750702`, signer `5En7dwv…Pr4QUz`, `system.remarkWithEvent`, the exact 39-byte payload, scoped `system.ExtrinsicSuccess`, and a finalized head above the transaction block.
- Real Chrome rendered **Verified** through **Check saved proof** with HTTP 200, no console errors, and no page errors. The timestamped artifact is `evidence/native-anchor-investigation-2026-10-31-072856Z.json`.
- Two later bounded read-only rechecks at `2026-10-31T14:38Z` returned 2 `VERIFIED`, 0 `MISMATCH`, and 8 `UNAVAILABLE` because the Substrate WebSocket disconnected during initialization. They produced no contradictory chain evidence and do not replace the earlier successful observation; the separate recheck record is `evidence/native-anchor-recheck-2026-10-31-143830Z.json`.
- A final bounded recheck at `2026-10-31T14:45:09.159Z` succeeded with 10 `VERIFIED`, 0 `MISMATCH`, and 0 `UNAVAILABLE`; the endpoint served the exact canonical block/extrinsic and a finalized head at 265219. The fresh record is `evidence/native-anchor-final-verification-2026-10-31-144509Z.json`.
- Final product cleanup added explicit three-workflow navigation, moved experimental EVM proof input behind disclosure, collapsed long technical check lists, removed three disposable diagnostic scripts, and added concise governance/submission records. The real-Chrome/accessibility suite, 158 tests, configured check, production build, and dependency audit all passed; responsive widths had no horizontal overflow.
- `npm test` and `npm run check` passed 158/158 tests; `npm run build` succeeded; `npm audit --omit=dev` reported zero vulnerabilities. No transaction was signed or submitted during this investigation, and no commit, push, or deployment was performed.

### Native browser fee-estimate repair

- Reproduced the reported native estimate failure in real Chrome after importing and independently verifying `evidence/final-live-2026-10-31-02.json`. The click handler and `/api/onchain-proof` preparation request both ran, and the Portaldot WebSocket opened, but Chrome logged a fatal `@polkadot/wasm-crypto` initialization error because FIRMA's `script-src 'self'` policy did not permit WebAssembly compilation. `ApiPromise.create` then remained pending behind provider reconnect behavior, so no error reached the page.
- Added the narrow CSP capability `'wasm-unsafe-eval'` to the local and production policies. The broader `'unsafe-eval'` remains disallowed. Added two-attempt manual WebSocket/runtime initialization with per-attempt timeouts, provider cleanup, RPC-stage timeouts, and an explicit no-transaction error. The UI now shows a busy state and always resolves to either exact fee details or an actionable error.
- A repeat real-Chrome, read-only browser-module check completed against `wss://test-node-v3.portaldot.dev` with no console/page errors and zero signing calls. At finalized block `263607` (`0x8de3a76c…4b6b88f`), genesis, runtime code, `portaldot-v3/3002`, transaction version `2`, account, `system.remarkWithEvent` call index `0x0007`, commitment, payload, and zero value all matched. The account had `500 tPOT` usable and the current maximum fee was `1490365603012` base units (`0.01490365603012 tPOT`).
- Added regression coverage for stalled WebSocket connection, stalled finalized-head RPC, CSP requirements, visible browser loading/error recovery, and prevention of signing during estimation. `npm test` passed 154/154; `npm run check` passed syntax checks and 154/154 tests; `npm run build` succeeded; and `npm audit --omit=dev` reported zero vulnerabilities.
- The preserved report and its commitment were not modified. No signing request was opened, no transaction was broadcast, and no commit, push, or deployment was performed.

### Final live verification and release preparation

- Preserved the first fresh run as `evidence/final-live-2026-10-31-01.json`. It is honestly `UNKNOWN` (2 PASS, 0 FAIL, 7 UNKNOWN) after the Substrate WebSocket closed with code 1006 before finalized/runtime evidence was available.
- Confirmed that the failure is intermittent: a raw WebSocket request returned `chain_getFinalizedHead`, and the bounded isolation probe completed every Substrate stage plus a full 9/9 `PASS` at finalized block `263073`. Public DNS returned both A and AAAA records, although local DNS and IPv6 reachability were inconsistent during the investigation. This evidence does not establish whether the remote peer, Cloudflare path, local resolver, or another network layer initiated the abnormal close.
- Replaced the Polkadot provider's initialization-time internal reconnect loop with FIRMA's configured explicit 0–2 retries. Every attempt has the existing timeout, failed providers are disconnected, backoff is bounded to 250/500 ms, and exhaustion remains a connection error that produces `UNKNOWN`; no verdict rule was relaxed.
- Ran the fixed verifier with two retries and saved the untouched 9/9 `PASS` report as `evidence/final-live-2026-10-31-02.json` at finalized block `263091` (`0x4e341a47…c65c0f14`). Runtime `portaldot-v3/3002`, runtime-code hash `0xedc03c9d…24c7c2`, genesis `0xd4f9acbc…5283bd`, and EVM chain ID `420420777` matched the reviewed profile.
- Added a reproducible, no-overwrite, read-only native authorization generator. `evidence/native-anchor-authorization-2026-10-31.json` commits to the fresh PASS report with commitment `0x8f911712…bfabc6d`, payload `0x4649524d4100028f9117121abb546b289a38f1d8afe73b379e41beb3d73895ecc2d7b5ebfabc6d`, and `system.remarkWithEvent` call index `0x0007`.
- Fresh account-specific preparation revalidated the reviewed genesis/runtime, account `5En7dwvXVjsHA8AEjWwdLNFf1TnxiiRSE3VUXiX7S9Pr4QUz`, zero value, `500 tPOT` usable balance, and maximum fee `1490365921150` base units (`0.0149036592115 tPOT`) at finalized block `263114`.
- `npm test` passed 152/152; `npm run check` passed all syntax gates and 152/152 tests; `npm run build` succeeded; the Chrome accessibility/wallet test passed; and `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities.
- The same production handler later returned HTTP 200 with `UNKNOWN` at block `263141` because EVM identity exhausted its bounded transport retries. A direct read of the public Vercel URL also failed local DNS resolution. These fresh failures are release blockers for claiming current deployed acceptance, not contradictions and not test fixtures.
- Supported submission claims: FIRMA performs same-finalized-block native/EVM verification; preserves `PASS`/`FAIL`/`UNKNOWN`; fail-closes on runtime identity; produced the cited fresh PASS report; prepares the cited native authorization package; and keeps signing in the user's browser after exact review. Unsupported claims: a submitted/finalized transaction, transaction hash, deployed registry contract, current updated public deployment, active platform-wide rate limit, or uninterrupted endpoint availability.
- No transaction was signed or broadcast, no transaction hash or receipt exists, no contract was deployed, and no commit, push, preview, or production deployment was performed.

## 2026-10-30 — final live verification and authorization preparation

- Reproduced endpoint availability with a bounded isolation probe. EVM identity and latest-block access succeeded, and Substrate connection, finalized head/header, runtime version/metadata, historical decoration, and relevant storage reads all succeeded. The full isolated verifier returned 9/9 `PASS` at finalized block `258818`.
- Ran a separate genuine verification with a unique no-overwrite filename. `evidence/final-live-2026-10-30-01.json` is an untouched 9/9 `PASS` report at finalized block `258823` (`0xf71ec7a1…b6564`).
- The earlier code-1006 WebSocket closures were not reproduced. Current evidence rules out a deterministic runtime incompatibility but does not establish a root cause; no upstream or FIRMA cause is claimed.
- Prepared `evidence/native-anchor-authorization-2026-10-30.json` for the confirmed native account. The deterministic commitment is `0x2a6b5fba…1cc283`; payload is the 39-byte `FIRMA_NATIVE_REMARK_V1` payload; call is `system.remarkWithEvent` at call index `0x0007`; value is zero.
- Fresh live preflight revalidated genesis `0xd4f9acbc…5283bd`, runtime-code hash `0xedc03c9d…24c7c2`, runtime `portaldot-v3/3002`, transaction version `2`, the exact account, and `500 tPOT` usable balance. Maximum fee was `1490368684627` base units (`0.01490368684627 tPOT`) at finalized block `258847`.
- Added a server-side PASS-only gate to both native and EVM preparation. `UNKNOWN` and `FAIL` reports can no longer reach fee review or wallet confirmation.
- Final validation passed: `npm test` 150/150, `npm run check` including 150/150, `npm run build`, the real-Chrome accessibility/wallet flow, the production function smoke check (9/9 `PASS` at block `259055`), and `npm audit --omit=dev --audit-level=high` with zero reported vulnerabilities.
- No transaction was signed or broadcast, no transaction hash or finality receipt exists, no contract was deployed, and no production deployment was changed.

## 2026-10-30 — native SubWallet evidence anchoring

- Live metadata confirmed PortaldotV3 Test genesis `0xd4f9acbc…83bd`, runtime `portaldot-v3/3002`, transaction version `2`, SS58 format `42`, and both `system.remark` and `system.remarkWithEvent`; FIRMA uses the event-emitting call.
- Implemented SubWallet detection, explicit SS58 account selection, injected-signer compatibility checks, fail-closed genesis/runtime verification, deterministic `FIRMA_NATIVE_REMARK_V1` payloads, signer-specific balance and fee estimation, exact confirmation, one-shot signing, inclusion/finality tracking, duplicate prevention, and a separate `firma.anchor.native.v1` sidecar.
- Implemented independent native verification of the canonical block, extrinsic index/hash, signer, `system.remarkWithEvent`, exact payload, `ExtrinsicSuccess`, and finality. Demonstrated contradictions are `MISMATCH`; unavailable blocks, events, RPC, or finality remain `UNAVAILABLE`.
- Preserved the EVM `firma.anchor.v1` route and added a 1 tPOT maximum-fee safety ceiling. Fresh probes showed `466496802196` gas for an empty self-transaction and `623906712614` gas for the FIRMA payload, yielding `164.6177861232039 tPOT` at gas price `26385`; this is a high runtime gas/weight baseline, not a decimal-conversion error.
- The supplied native account was observed with `50000000000000000` base units (`500 tPOT`) free and zero frozen. The exact fresh preflight payload estimated `1490370719921` base units (`0.01490370719921 tPOT`) at finalized block `255734`.
- Saved `evidence/native-anchor-preflight-2026-10-30.json`. Its honest report result is `UNKNOWN` (2 PASS, 0 FAIL, 7 UNKNOWN) because the report's Substrate collection closed abnormally; its deterministic commitment is `0xa53f237a0a78708e75bf4d5a1c6274b565f7b6675560ed8e9f5a88279b30620d`.
- Final revalidation after the live-only call-index correction completed successfully: `npm test` passed 148/148, `npm run check` passed with 148/148, and `npm run build` produced the native-enabled production bundle.
- No transaction was signed or submitted, no contract was deployed, and no production deployment was changed. Explicit authorization for the exact native preflight remains the next transaction gate.

## 2026-10-30 â€” optional contractless evidence anchoring

- Fixed ethers v6 receipt field compatibility and moved `canonicalize` into runtime dependencies.
- Stabilized the Windows browser-server readiness regression without removing or weakening the test.
- Implemented deterministic zero-value self-transaction preparation with a versioned FIRMA calldata prefix.
- Added browser-only EVM wallet connection, chain/account rechecks, signer-specific balance and fee estimation, exact confirmation details, one-shot submission, and explicit rejection/replacement handling.
- Added a read-only on-chain verifier for transaction, destination, value, calldata, chain identity, successful receipt, canonical inclusion, native finality, report changes, and separate anchoring evidence.
- Added `VERIFIED`, `MISMATCH`, and `UNAVAILABLE` proof UI while preserving report `PASS`, `FAIL`, and `UNKNOWN` semantics and report immutability.
- Live read-only probes confirmed PortaldotV3 Test genesis `0xd4f9acbcâ€¦83bd`, chain ID `420420777`, tPOT with 14 decimals, and exactly `500 tPOT` free on the supplied SS58 account. Contractless gas estimation was supported but returned a high estimate; no EVM signer funding, real transaction, or deployment is claimed.
- No transaction was signed or submitted and no contract was deployed. The exact EVM signing account and its usable balance remain the Phase 7 authorization gate.
- Completed `npm test` and `npm run check` with 135/135 passing tests, including the real Chrome accessibility/wallet flow, and completed `npm run build` successfully.
- Saved a fresh read-only report as `evidence/phase-6-live-2026-10-30.json`. Its honest result is `UNKNOWN` (2 PASS, 0 FAIL, 7 UNKNOWN): EVM identity and chain ID passed, while the Substrate WebSocket closed with code 1006 before finalized/runtime evidence was available.

## 2026-10-20 — investigation and read-only MVP

- Verified both organizer-provided endpoints and EVM chain ID `420420777`.
- Decoded runtime metadata and identified Assets, Revive, asset-precompile, permit, and native-call interfaces.
- Confirmed five native/EVM balance pairs with the exploratory probes.
- Audited named Hacker House projects and broader adjacent tooling.
- Chose the narrow interop-assurance opportunity; rejected generic explorer, assistant, dashboard, deployer, and workflow directions.
- Implemented a pinned-block verifier, JSON evidence format, CLI exit codes, local evidence viewer, bounded networking, and fixture-only test suite.
- Produced successful live evidence for an asset with metadata and an asset without metadata.

## 2026-10-20 — production-readiness pass

- Added a stateless production API entrypoint and Vercel configuration.
- Added a reproducible static production build.
- Removed machine-specific stack traces from exported evidence and regenerated live reports.
- Bounded every Substrate query and disconnect path.
- Suppressed parity conclusions outside the verified runtime envelope.
- Added bounded request maps, body limits, concurrency caps, and server timeouts.
- Expanded the suite from 14 to 22 passing tests, including production-handler, invalid-payload, and limiter behavior.
- Confirmed unreachable endpoints become `UNKNOWN` with exit code `2`.
- Re-ran both live asset checks successfully at finalized blocks `121096` and `121099`.

## 2026-10-22 — fail-closed runtime recognition

- Replaced the permissive name-and-pallet runtime gate with an exact reviewed Portaldot V3 profile.
- Added finalized-block runtime `:code` hashing, genesis identity, version, EVM chain ID, pallet, and query-surface checks.
- Kept raw metadata SHA-256 as exported evidence without using it as the approval key; investigation showed its `Revive.EthBlockBuilderIR` fallback varies by block while runtime code remains identical.
- Added regression coverage for unknown code, wrong genesis or versions, missing query surfaces, metadata fallback drift, and finalized-block collection.
- Passed the 35-test check suite, production build, and production dependency audit with zero reported vulnerabilities.
- Completed a fresh read-only verification with nine PASS checks at finalized block `151221`. The approved runtime-code hash remained `0xedc03c9d…a724c7c2` while the block-specific raw metadata SHA-256 was `1dae6abe…95d53b4f`.

## 2026-10-21 â€” final validation

- Re-ran the clean install, 22-test check suite, production build, and production dependency audit successfully.
- Re-ran asset 2 with nine PASS checks at finalized block `129347` and asset 806707 with nine PASS checks at block `129350`.
- Confirmed unreachable endpoints produce nine UNKNOWN checks and CLI exit code `2`.
- Started the loopback web server, rendered the landing page in headless Chrome, and received a nine-check PASS response from the local API at block `129376`.
- Confirmed invalid non-object JSON returns HTTP 400 and a path-traversal probe returns HTTP 404.

## Before October 24 check-in

- Record a short demo of the CLI and browser report using a fresh evidence filename.
- Ask organizers to confirm whether the inline asset-precompile address convention is intended as stable V3 API.
- Publish the repository only when the team chooses; no push or deployment was performed here.

## Before November 6

- Add report diffing across reviewed runtime upgrades if another runtime profile is ever approved.
- Add a compact Markdown/JUnit renderer.
- Expand account samples without scanning unbounded storage.
- Consider controlled write/event conformance only after separate authorization, test funding, and a safety plan.
