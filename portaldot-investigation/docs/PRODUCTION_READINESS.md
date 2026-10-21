# Production readiness review

Audit date: 2026-10-21 (Atlantic/Cape Verde)

## Release decision

FIRMA is ready for a protected Vercel preview. It is not yet cleared for an unrestricted public release because the deployed function, outbound WebSocket access, and platform-level rate limit have not been verified on Vercel.

The product remains read-only. It does not request a wallet, sign messages, submit transactions, deploy contracts, or require private keys.

## Verification completed

| Check | Result |
|---|---|
| Clean dependency install | `npm ci --ignore-scripts` succeeded |
| Automated checks | 22 tests passed; 0 failed |
| Static production build | `npm run build` succeeded |
| Dependency audit | 0 known production vulnerabilities |
| Live default verification | PASS at Substrate block 121096 |
| Live absent-metadata verification | PASS at Substrate block 121099 |
| Unreachable-network behavior | Overall UNKNOWN; all nine checks UNKNOWN; exit code 2 |
| Fresh live CLI recheck (2026-10-21) | Asset 2: 9 PASS at block 129347; asset 806707: 9 PASS at block 129350 |
| Local browser/API smoke check (2026-10-21) | Page rendered in headless Chrome; API: 9 PASS at block 129376 |
| Production-function adapter smoke (2026-10-21) | HTTP 200 and PASS at block 129401; request ID returned |
| Embedded secret scan | No embedded credentials found |
| Product write-operation scan | No signing, wallet, transaction-submission, or deployment path found |

The two generated evidence records were replaced during this review. The previous records included local stack paths in captured connection errors. Public errors are now sanitized, and the regenerated records contain no workstation paths.

## Repairs made

- Bounded every Substrate identity, metadata, storage, and disconnect operation with a timeout.
- Sanitized public errors so stack traces and local filesystem paths are not written to evidence.
- Made unsupported runtimes suppress dependent parity checks instead of reporting misleading PASS results.
- Added bounded per-IP and global concurrency controls for the local and serverless APIs.
- Added request-size limits, server timeouts, generic unexpected-error responses, and security headers.
- Added a Vercel Web API function, reproducible static build, environment validation, and a live function smoke test.
- Corrected the metadata digest to hash decoded metadata bytes rather than the printable hex string.
- Pinned CI actions by commit SHA and restricted workflow permissions to read-only repository contents.
- Added failure-path, rate-limit, request-validation, and unsupported-runtime tests.
- Classified syntactically valid non-object JSON request bodies as HTTP 400 instead of HTTP 500.

## Remaining release blockers

1. No Vercel project or public URL has been created, by design.
2. The Vercel-built function bundle and its outbound HTTPS/WSS connectivity have not been tested in a protected preview.
3. The in-process limiter is instance-local. A platform firewall rate limit must be staged and reviewed before public promotion.
4. Automated browser pixel/layout review was unavailable in this environment; the static page and API behavior were tested, but responsive visual QA still needs a human pass.
5. The organizer's native-asset address convention remains an external assumption. FIRMA proves read parity for the supplied addresses; it does not independently prove that the mapping convention is canonical.

## Public release gate

Proceed only after all of the following pass on a protected preview:

- landing page and evidence views render on desktop and mobile;
- `POST /api/verify` returns a PASS result for asset 2;
- malformed, oversized, and excess requests fail with the documented status codes;
- function duration stays below 60 seconds in repeated trials;
- no credentials, internal paths, or stack traces appear in responses or logs;
- the platform firewall rule is first observed in log mode, then enabled with a reviewed threshold.
