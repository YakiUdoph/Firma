# Production readiness review

> Historical record. This review captures the October 21, 2026 release state. Its test count, local-only commit status, and deployment description must not be read as current status.

Audit date: 2026-10-21 (Atlantic/Cape Verde)

## Release decision

FIRMA's verifier is functioning on the current Vercel deployment, and the improved UI is verified locally. It is not cleared for public promotion: the improved commit has not been deployed to a protected preview, the current production URL is publicly reachable, and the project-specific Vercel firewall configuration could not be inspected with the available authorization.

The product remains read-only. It does not request a wallet, sign messages, submit transactions, deploy contracts, or require private keys.

## Verification completed

| Check | Result |
|---|---|
| Automated checks | 26 tests passed; 0 failed |
| Static production build | `npm run build` succeeded |
| Dependency audit | 0 known production vulnerabilities |
| Deployed frontend | HTTP 200 in 0.971 s |
| Deployed asset 2 verification | HTTP 200; 9 PASS at block 130112 in 8.097 s |
| Deployed asset 806707 verification | HTTP 200; 9 PASS at block 130114 in 7.939 s |
| Deployed identity | Runtime `portaldot-v3/3002`; EVM chain ID 420420777 |
| Deployed API errors | GET returned 405; malformed JSON returned 400 |
| Local real-browser verification | Asset 2 Passed with 9 technical PASS checks at block 130100 |
| Responsive browser review | Chrome at 1440, 768, and 375 px; no horizontal overflow |
| Embedded secret/path scan | No known credential signatures or workstation paths in changed files |
| Verifier integrity | No changes to `src`, `api`, CLI, or server verifier paths in the UI commit |

Successful deployed Substrate and EVM endpoint checks demonstrate outbound WSS and HTTPS connectivity from the function. The two complete requests stayed below the configured 60-second function limit.

## UI repairs made

- Put the working verification form near the top of the page.
- Reduced oversized hero typography and unused vertical space while preserving the dark/lime identity.
- Rebuilt the four-step explanation as readable two-column cards with a one-column mobile layout.
- Explained the core task in plain English and moved protocol terminology into expandable details.
- Added human labels—Passed, Failed, Couldn't verify—without changing technical `PASS`, `FAIL`, or `UNKNOWN` evidence.
- Preserved validation, raw evidence, copy/download actions, focus handling, and keyboard use.
- Added four UI regression tests.

## Verifier behavior left unchanged

Same-finalized-block comparison, runtime compatibility gate, account mapping, exact integer handling, all nine checks, the evidence schema, error classifications, bounded timeouts/retries, and application rate/concurrency limits are unchanged.

## Security status and remaining blockers

1. `https://firma-lemon.vercel.app/` is publicly reachable without deployment authentication.
2. The in-process limiter is instance-local: five requests per minute per client and four active requests per instance.
3. The active Vercel firewall configuration could not be retrieved. The Vercel API connection returned 403 for the owning team, while the local Vercel CLI reported no credentials. No custom WAF or platform rate limit is claimed.
4. The updated UI exists only in local commit `92f77ed` until push and deployment are approved.
5. The organizer's native-asset address convention remains an external assumption. FIRMA proves read parity for the supplied addresses; it does not independently establish the convention as canonical.

## Protected-preview gate

Before wider promotion:

- push the reviewed commits with a normal, non-force push after approval;
- create a protected preview rather than altering the public production deployment;
- repeat both assets and error cases against that exact preview;
- inspect the preview on desktop, tablet, and narrow mobile;
- grant the Vercel connection access to the owning team;
- inspect the active firewall configuration;
- stage a path-specific `/api/verify` platform rate rule in log mode, review legitimate traffic, and enable it only after separate approval.

No DoraHacks submission or public production change is authorized by this review.
