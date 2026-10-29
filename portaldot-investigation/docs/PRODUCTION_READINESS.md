# Production readiness review

Audit date: 2026-10-29 (Atlantic/Cape Verde)

## Release decision

FIRMA has a local release candidate on `fix/firma-production-readiness`. Production deployment is not authorized. The candidate may be considered for controlled production deployment only after its exact committed tree completes protected-preview validation and the production owner separately authorizes promotion.

The product remains read-only. It has no wallet connection, signing, private-key handling, transaction simulation, transaction submission, contract deployment, or write RPC surface.

## Correctness remediations

- **FIRMA-001 report integrity:** complete request transcripts, block tags, decoded observations, duplicated verdicts, and counts are validated before reproduction. Historical reproduction, deterministic commitment computation, and external commitment authentication are separate outcomes. An unanchored report can be `REPRODUCED`, never `AUTHENTICATED`.
- **FIRMA-002 ABI decoding:** dynamic strings require the canonical offset, exact aligned payload length, zero padding, and strict UTF-8. Malformed metadata becomes unavailable evidence and dependent verdicts become `UNKNOWN`.
- **Response resource bounds:** EVM HTTP responses are streamed under a 512 KiB limit and validated as matching JSON-RPC 2.0 envelopes. Verification requests are limited to 8 KiB; report-check envelopes are limited to 1 MiB and imported reports to 256 KiB.
- **Runtime gate:** the reviewed Portaldot V3 genesis, finalized runtime-code fingerprint, version tuple, chain ID, pallets, and query surfaces remain fail-closed.

## Fresh live acceptance evidence

All live cases below were sequential read-only requests on 2026-10-29. Fault-injection cases are listed separately and are not represented as live observations.

| Case | Block | Result | Evidence |
|---|---:|---|---|
| Asset 2, default mapped account | 236334 | PASS, 9/9 | Native and EVM supply and balance were `15000000000000000000`; metadata matched. |
| Asset 806707, documented mapped account | 236338 | PASS, 9/9 | Supply was `1000000007`; balance was `999997490`; both surfaces consistently lacked metadata. |
| Missing asset 4294967295 | 236342 | UNKNOWN, 5 PASS / 4 UNKNOWN | Native asset did not exist; zero-looking EVM calls were not treated as proof of parity. |
| Mapped zero-balance candidate | 236352 | UNKNOWN | EVM returned zero, but native account storage was absent; FIRMA did not infer a native zero. |
| Reserved unmapped account | 236356 | UNKNOWN | Revive mapping and balance parity were unavailable. |
| Export/import/reproduction | 236334 | REPRODUCED / UNANCHORED | Structure and evidence consistency VALID; 26/26 historical claims VERIFIED; no external commitment supplied. |

Evidence files use unique no-overwrite names under `evidence/production-readiness-20261029-*.json`. They are fresh observations, not fixtures and not promises about later chain state.

## Deterministic fault-injection coverage

Offline tests cover invalid accounts, unavailable endpoints and historical blocks, provider timeouts, missing precompile behavior, runtime/chain mismatch, different block contexts, malformed ABI data, oversized RPC responses, malformed JSON-RPC envelopes, missing/duplicate/fabricated requests, contradictory verdicts, and anchored versus unanchored commitments. These tests are simulated fault injection unless explicitly identified as live above.

## Platform and security evidence

- Vercel project: `firma`, owner `nyaknno-udofias-projects`, Root Directory `portaldot-investigation`, Node.js 24.x.
- Git integration: `YakiUdoph/Firma`.
- Preview Deployment Protection: SSO enabled for all deployments except custom domains.
- Firewall: enabled with one live valid rule, `FIRMA API Rate Limit`, covering `/api/` at 10 requests per 60 seconds per IP with a fixed window. Both API routes are covered; no draft changes exist.
- The legacy Seawall endpoint returned 404, but the first-class firewall status and expanded rules interfaces returned the active configuration. The 404 is not treated as evidence that protection is absent.
- Production dependency audit on the locked graph: zero known vulnerabilities.
- CSP allows same-origin resources only and denies framing, base-URI changes, camera, microphone, geolocation, and payment capabilities.
- Application logging emits bounded timings and sanitized error categories; it does not log endpoint credentials, raw exception strings, or report contents.

## Operations

- CI tests Node.js 22 and 24; the live Vercel project uses Node.js 24.
- Public RPC failures, pruning, and timeouts remain `UNKNOWN` or `UNAVAILABLE`.
- Runtime upgrades are unsupported until the support profile is deliberately re-audited.
- The existing production deployment and custom domain must remain unchanged during preview validation.
- Record the current production deployment and commit before any later promotion, then use that known-good deployment for rollback if required.

## Remaining release gates

1. Commit the fully validated candidate with repository-local identity `YakiUdoph <yakiudoph@gmail.com>`.
2. Deploy that exact candidate to a protected preview without production flags or alias changes.
3. Repeat browser, mobile, accessibility, CSP, API, live verification, report export/import, and historical reproduction checks against that exact preview.
4. Confirm production deployment and domain still resolve to the pre-preview production release.
5. Obtain separate authorization before any production promotion.

A missing or failed gate is a blocker; it must not be converted into a readiness claim.
