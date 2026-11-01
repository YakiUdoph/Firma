# Production readiness review

Audit date: 2026-10-31 (Atlantic/Cape Verde)

## Release decision

FIRMA's verifier produced a fresh local 9/9 `PASS` report at finalized block `263091`, and its first genuine native anchor transaction has now been independently verified locally. Transaction `0x3b2f4eac…1750702` was canonically included and successfully executed at finalized block `263713` with the exact report commitment. FIRMA is still not cleared for public promotion: the corrected proof-verifier path has not been deployed to a protected preview, endpoint behavior has been intermittent, and the project-specific Vercel firewall configuration could not be inspected with the available authorization.

A read-only GET on 2026-10-30 confirmed the public URL still served the earlier read-only UI: it had no anchoring controls and its CSP `connect-src` did not include the Portaldot WebSocket endpoint. A fresh GET on 2026-10-31 could not resolve the public hostname from the local environment, so no current deployed-UI or deployed-API acceptance result is claimed. The native SubWallet implementation remains local until a separately authorized push and deployment.

A later read-only Vercel metadata inspection on 2026-10-31 found the `firma` project configured as Node.js 24.x and its current production deployment `READY`. That deployment came from branch `fix/two-release-blockers-20261029` at commit `f3ed348`, not from this working tree. The inspection did not change the project and does not establish acceptance of the local finalization changes.

Core verification remains read-only. The new optional testnet anchor can request one browser-wallet transaction only after exact field/fee review and explicit confirmation. Server-side signing, custody, raw signed transactions, transfers, approvals, automatic submission, automatic resubmission, and deployment remain absent.

## Verification completed

| Check | Result |
|---|---|
| Current automated checks | `npm test`: 158 tests passed; 0 failed on 2026-10-31, including bounded native proof connection, mismatch/finality, duplicate-request, and real-Chrome coverage |
| Current configured check | `npm run check` succeeded, including syntax checks and 158 tests |
| Latest native-anchor recheck | Final bounded attempt at 2026-10-31 14:45 UTC returned 10 `VERIFIED`, 0 `MISMATCH`, and 0 `UNAVAILABLE`; finalized head 265219; fresh artifact preserved separately |
| Static production build | `npm run build` succeeded and regenerated `dist/` |
| Production function smoke | Fresh 2026-10-31 run returned HTTP 200 and `UNKNOWN` at finalized block 263141 after EVM identity exhausted bounded transport retries; historical 2026-10-30 smoke was 9/9 PASS at block 259055 |
| Dependency audit | `npm audit --omit=dev --audit-level=high`: 0 reported vulnerabilities |
| Deployed frontend | HTTP 200 in 0.971 s |
| Deployed asset 2 verification | HTTP 200; 9 PASS at block 130112 in 8.097 s |
| Deployed asset 806707 verification | HTTP 200; 9 PASS at block 130114 in 7.939 s |
| Deployed identity | Runtime `portaldot-v3/3002`; EVM chain ID 420420777 |
| Deployed API errors | GET returned 405; malformed JSON returned 400 |
| Local real-browser verification | Asset 2 Passed with 9 technical PASS checks at block 130100 |
| Responsive browser review | Chrome at 1440, 768, and 375 px; no horizontal overflow |
| Embedded secret/path scan | No known credential signatures or workstation paths in changed files |
| Verifier integrity | Existing `PASS`/`FAIL`/`UNKNOWN` tests remain passing; anchoring uses separate `VERIFIED`/`MISMATCH`/`UNAVAILABLE` results |
| Fresh final live verification | First run preserved as `UNKNOWN`; fixed bounded-retry run was 9/9 `PASS` at finalized block 263091; untouched reports saved separately |
| Fresh native authorization | Exact package saved for the 2026-10-31 PASS report; original package fee `0.0149036592115 tPOT` at block 263114; latest local real-Chrome re-estimate `0.01490365603012 tPOT` at block 263607; prepared, not signed or submitted |
| First genuine native anchor | `VERIFIED` locally: transaction `0x3b2f4eac…1750702`, block 263713, index 1, exact signer/call/payload, `ExtrinsicSuccess`, and canonical finality; investigation artifact preserved separately |
| Final interface review | Three-workflow navigation, experimental EVM proof hidden by disclosure, long checks collapsed; real Chrome and accessibility suite passed; no overflow at 1440, 768, or 375 px |

Historical deployed checks demonstrate that outbound WSS and HTTPS connectivity has worked from the production function. The fresh local production-handler smoke does not establish current full availability because its EVM stage was inconclusive.

## UI repairs made

- Put the working verification form near the top of the page.
- Reduced oversized hero typography and unused vertical space while preserving the dark/lime identity.
- Rebuilt the four-step explanation as readable two-column cards with a one-column mobile layout.
- Explained the core task in plain English and moved protocol terminology into expandable details.
- Added human labels—Passed, Failed, Couldn't verify—without changing technical `PASS`, `FAIL`, or `UNKNOWN` evidence.
- Preserved validation, raw evidence, copy/download actions, focus handling, and keyboard use.
- Added four UI regression tests.

## Verifier behavior and connection fix

Same-finalized-block comparison, runtime compatibility gate, account mapping, exact integer handling, all nine checks, the evidence schema, error classifications, and application rate/concurrency limits are unchanged. Substrate initialization now uses FIRMA's configured explicit retry count instead of the provider's internal reconnect loop: 0–2 retries, per-attempt timeout, failed-provider cleanup, and 250/500 ms backoff. Exhaustion still yields `UNKNOWN` and never becomes `PASS`.

The browser-native path separately failed because its CSP blocked Polkadot's WebAssembly crypto initialization. Local Chrome evidence showed the WebSocket and preparation API succeeded before the CSP error. Local and production CSP definitions now permit only `'wasm-unsafe-eval'` in addition to self-hosted scripts; ordinary `'unsafe-eval'` remains forbidden. Browser-native connection/runtime initialization is limited to two attempts with 20-second per-stage timeouts, later RPC stages have 12-second timeouts, and every failure restores the estimate control with a visible no-transaction message. A live browser-module recheck subsequently completed at block `263607` with the reviewed runtime and an account-specific fee, without invoking the signer.

## Security status and remaining blockers

1. `https://firma-lemon.vercel.app/` is publicly reachable without deployment authentication.
2. The in-process limiter is instance-local: five requests per minute per client and four active requests per instance.
3. Basic Vercel project/deployment metadata is readable, but the active project firewall configuration has not been retrieved or accepted. No custom WAF or platform rate limit is claimed.
4. The finalized UI and native proof changes exist only in the current local working tree until a reviewed commit, push, protected preview, and deployment are approved.
5. The organizer's native-asset address convention remains an external assumption. FIRMA proves read parity for the supplied addresses; it does not independently establish the convention as canonical.
6. The supplied SS58 account was freshly observed with exactly `500 tPOT` usable balance at finalized block `263114`. Native `system.remarkWithEvent` is available and the exact fresh payload estimated `0.0149036592115 tPOT`.
7. Fresh EVM probes showed a high runtime baseline: `466496802196` gas empty and `623906712614` gas with the payload, or `164.6177861232039 tPOT` at the observed gas price. The EVM client blocks any maximum above 1 tPOT; native is the practical route.
8. One genuine contractless native anchor transaction is independently verified. No registry deployment or contract address exists; publication must describe the native remark accurately and must not imply a deployed contract.
9. Multiple code-1006 and DNS/transport failures remain truthfully `UNKNOWN`. Raw WebSocket and staged probes also succeeded during the same review window, so the failures are intermittent; their initiating network component is not established.
10. The 2026-10-31 PASS and UNKNOWN reports are both preserved and must not be conflated. The PASS report's native transaction and sidecar are now independently verified, but that does not upgrade the older UNKNOWN report or prove every report claim merely because its commitment is on-chain.
11. The current public deployment could not be freshly inspected because its hostname did not resolve locally. No claim is made that the local SubWallet changes or current CSP are deployed.

## Protected-preview gate

Before wider promotion:

- push the reviewed commits with a normal, non-force push after approval;
- create a protected preview rather than altering the public production deployment;
- repeat both assets and error cases against that exact preview;
- inspect the preview on desktop, tablet, and narrow mobile;
- grant the Vercel connection access to the owning team;
- inspect the active firewall configuration;
- stage a path-specific `/api/verify` platform rate rule in log mode, review legitimate traffic, and enable it only after separate approval.
- stage equivalent reviewed limits for `/api/check-report` and `/api/onchain-proof`;
- test the wallet confirmation flow with a disposable funded EVM account, first rejecting a request and then stopping before any real submission unless the owner separately authorizes it.

No DoraHacks submission or public production change is authorized by this review.
