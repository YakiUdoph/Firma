# Development history

> Historical record. Counts and release statements below describe the dated validation runs, not the current suite or deployment.

## Preserved repository history

| Commit | Purpose |
|---|---|
| `1f00d64` | Captured the initial Portaldot V3 feasibility evidence and investigation reports. |
| `4e326f8` | Added the pinned native/EVM verifier, fixtures, tests, and CI verdicts. |
| `c73ea52` | Added the evidence viewer, operator documentation, and browser experience. |

## Production-readiness pass — 2026-10-20

The production review hardened timeouts, runtime gating, error sanitization, API limits, CI permissions, static building, and the serverless adapter. It also expanded the test suite to 20 cases, regenerated evidence without workstation paths, and prepared deployment and October 24 judge materials.

See the Git log after this review for the exact production-readiness commit identifiers.

## Final validation — 2026-10-21

The final pass corrected non-object JSON error classification and documentation drift, expanded the suite to 22 tests, and repeated the build, dependency audit, live CLI, failure-mode, local API, and headless-browser checks. The fresh live observations were PASS for asset 2 at block 129347, PASS for asset 806707 at block 129350, and PASS through the local API at block 129376.

## Release history

No remote push or deployment was performed during this audit. No smart contract was deployed and no blockchain transaction was submitted.
