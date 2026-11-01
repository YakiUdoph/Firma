# Repository cleanup audit

This document records the reproducible repository inventory captured before the definitive cleanup and the verified result afterward. It is an audit record created on 2026-10-31; it does not claim to have governed earlier development.

## Pre-cleanup inventory

Captured at `2026-10-31T14:08:39-01:00` from the Git root containing `AGENTS.md`, with application root `portaldot-investigation/`. The machine-specific checkout path is intentionally not published.

- Branch: `feat/phase-1-investigation-guidance`
- Commit: `9ee9ea4ffac50b7701baa75acb8334ecdc3bc6c3`
- Remote: `origin` -> `https://github.com/YakiUdoph/Firma.git`
- Remote default branch: `main`
- Tracked paths: 97
- Material untracked paths: 32
- Staged paths: 0
- Modified tracked paths: 27
- Deleted tracked paths: 0
- Ignored generated/cache roots present: `portaldot-investigation/node_modules/`, `portaldot-investigation/dist/`, and `review-artifacts/`
- Tracked review artifacts: 5
- Primary-tree exact duplicate groups by SHA-256: none

The tracked diff contained 1,576 insertions and 91 deletions plus three modified PNG files. The three PNGs were regenerated browser-test outputs rather than assertions. The untracked `public/firma-logo.png` was 1,906,593 bytes and had no source, style, build, test, or documentation reference.

## Initial classification

| Classification | Paths | Basis |
|---|---|---|
| KEEP | `api/`, `bin/`, `browser/`, `public/`, `scripts/`, `src/`, `test/`, `test-support/`, `package*.json`, `server.mjs`, `vercel.json` | Current application, CLI, browser-only wallet boundary, build, APIs, and regression coverage. |
| KEEP | `evidence/`, `raw/`, `requests/` | Unique historical reports, exact native-anchor evidence, and reproducible read-only investigation inputs. |
| KEEP | Seven governance documents and current security/deployment/submission documents | Current requirements, trust boundaries, release gates, and competition evidence. |
| CONSOLIDATE | Root-level investigation Markdown and dated historical records | Unique content, but not current application entry points; organize under intentional research/history paths and replace repeated current instructions with canonical links. |
| REMOVE | `public/firma-logo.png` | Unreferenced 1.9 MB generated image; not part of the rendered product. |
| REMOVE | Modified `review-artifacts/phase-7d-check-report.png`, `phase-7e-mismatch.png`, `phase-7e-unavailable.png` from the release diff | Browser tests overwrite them; they are not test assertions. Preserve the committed historical versions rather than publish regenerated replacements. |
| REVIEW | Ignored material beneath `review-artifacts/` | Includes seven large validation checkouts and three registered Git worktrees. It must not be recursively deleted as ordinary generated output. |
| REVIEW | Local and remote branches | Several branches contain commits absent from `origin/main`; public PRs #2 and #7 remain open. No branch deletion is authorized. |

## Structural decision gate

The Vercel project and GitHub Actions currently treat `portaldot-investigation/` as the application root. Moving the application to the Git root would require a coordinated Vercel Root Directory change, CI path changes, deployment acceptance, and likely resolution of open PR #7, which already reorganizes documentation on a separate branch. Remote infrastructure changes are outside this cleanup authorization. The cleanup therefore evaluates the nested root deliberately and will retain it unless all external assumptions can be changed without deployment risk.

## Final result

Completed on 2026-10-31. The primary source tree is release-organized and validated, but remote integration and deployment gates remain owner work. The recommendation is **CLEAN WITH EXCEPTIONS**, not an authorization to commit, push, or deploy.

### Before and after

Before cleanup, the repository mixed current application code, five investigation probes, six research/history notes, and five tracked review artifacts across the application and repository roots. Browser tests also rewrote three historical screenshots. After cleanup, the intended structure is:

```text
./
|-- .github/workflows/
|-- AGENTS.md
|-- README.md                  # public/judge entry point
`-- portaldot-investigation/  # deliberate application root
    |-- api/ bin/ browser/ public/ src/
    |-- scripts/research/     # original investigation probes
    |-- test/ test-support/
    |-- evidence/ raw/ requests/
    |-- experimental/onchain-proof/
    `-- docs/
        |-- current governance and operating documents
        |-- history/review-artifacts/
        `-- research/
```

The ignored root `review-artifacts/` remains local-only because it contains large validation snapshots and three registered worktrees; it is not part of the proposed commit. `node_modules/`, `dist/`, and browser-test output remain ignored. The proposed post-commit primary tree has 129 files. SHA-256 hashing of all 129 proposed files found zero exact duplicate groups.

### Cleanup actions

- Submitted no additional transaction during cleanup. The earlier, separately authorized native `system.remarkWithEvent` transaction `0x3b2f4eac7f1e2b2cd87493ff9d60e5326584840d8572570c5f21c06ee1750702` remains preserved and independently verified; no smart contract was deployed for it.
- Removed only `portaldot-investigation/public/firma-logo.png`: an untracked, unreferenced 1,906,593-byte generated image.
- Moved five investigation probes to `scripts/research/` and kept them syntax-checked by `npm run check`.
- Moved four research notes to `docs/research/`, five dated or superseded records to `docs/history/`, and five committed review artifacts to `docs/history/review-artifacts/`.
- Restored the committed screenshot bytes before relocation and changed browser tests to write new captures beneath ignored `review-artifacts/test-output/`.
- Consolidated public product explanation in the root README and scoped the application README to developer/operator use.
- Kept all unique evidence, raw responses, request fixtures, production code, security tests, and reproducibility material.

No source implementation was judged safely dead. Small request-body/JSON helpers are endpoint-specific. Runtime identity and address checks are intentionally repeated across browser/server trust boundaries. Native and EVM result reducers have protocol-specific evidence shapes. Abstracting these would add coupling without removing behaviorally identical code.

### Exact proposed change manifest

Nothing is staged. Compared with `origin/main`, the candidate has 105 substantive status paths: 30 modified tracked files, 19 deleted relocation sources, and 56 untracked files. The untracked set contains the 19 relocation destinations and 37 genuinely new files listed below. Raw `git status` also reports `api/verify.mjs` and `experimental/onchain-proof/contracts/FirmaEvidenceRegistry.sol`; an `--ignore-space-at-eol` comparison confirms those two are line-ending-only entries, so they are not counted as substantive changes.

A future reviewed commit would modify these 30 tracked files:

```text
README.md
portaldot-investigation/README.md
portaldot-investigation/api/check-report.mjs
portaldot-investigation/docs/ARCHITECTURE.md
portaldot-investigation/docs/DEMO_SCRIPT.md
portaldot-investigation/docs/DEPLOYMENT.md
portaldot-investigation/docs/PRODUCTION_READINESS.md
portaldot-investigation/docs/SECURITY.md
portaldot-investigation/evidence/README.md
portaldot-investigation/experimental/onchain-proof/src/proof-transaction.mjs
portaldot-investigation/package-lock.json
portaldot-investigation/package.json
portaldot-investigation/public/app.js
portaldot-investigation/public/index.html
portaldot-investigation/public/styles.css
portaldot-investigation/scripts/build.mjs
portaldot-investigation/server.mjs
portaldot-investigation/src/diagnostics.mjs
portaldot-investigation/src/evaluate.mjs
portaldot-investigation/src/rpc.mjs
portaldot-investigation/src/verifier.mjs
portaldot-investigation/test/browser-server.test.mjs
portaldot-investigation/test/browser.test.mjs
portaldot-investigation/test/check-report-http.test.mjs
portaldot-investigation/test/diagnostics.test.mjs
portaldot-investigation/test/evaluate.test.mjs
portaldot-investigation/test/onchain-proof/proof-transaction.test.mjs
portaldot-investigation/test/production-boundary.test.mjs
portaldot-investigation/test/ui.test.mjs
portaldot-investigation/vercel.json
```

These 19 tracked source paths are deleted because their content is relocated, not discarded:

```text
portaldot-investigation/capability-map.md
portaldot-investigation/competitor-audit.md
portaldot-investigation/decode-metadata.cjs
portaldot-investigation/docs/DEVELOPMENT_HISTORY.md
portaldot-investigation/docs/HACKATHON_PROGRESS.md
portaldot-investigation/docs/OCTOBER_24_CHECKIN.md
portaldot-investigation/evm-asset-probe.mjs
portaldot-investigation/evm-probe.mjs
portaldot-investigation/final-recommendation.md
portaldot-investigation/network-findings.md
portaldot-investigation/opportunity-assessment.md
portaldot-investigation/reproducible-commands.md
portaldot-investigation/state-probe.cjs
portaldot-investigation/substrate-probe.mjs
review-artifacts/phase-7d-check-report.png
review-artifacts/phase-7d-verification.md
review-artifacts/phase-7e-mismatch.png
review-artifacts/phase-7e-release-audit.md
review-artifacts/phase-7e-unavailable.png
```

Their exact 19 destination paths are:

```text
portaldot-investigation/docs/history/DEVELOPMENT_HISTORY.md
portaldot-investigation/docs/history/HACKATHON_PROGRESS.md
portaldot-investigation/docs/history/INITIAL_RECOMMENDATION.md
portaldot-investigation/docs/history/OCTOBER_24_CHECKIN.md
portaldot-investigation/docs/history/OPPORTUNITY_ASSESSMENT.md
portaldot-investigation/docs/history/review-artifacts/phase-7d-check-report.png
portaldot-investigation/docs/history/review-artifacts/phase-7d-verification.md
portaldot-investigation/docs/history/review-artifacts/phase-7e-mismatch.png
portaldot-investigation/docs/history/review-artifacts/phase-7e-release-audit.md
portaldot-investigation/docs/history/review-artifacts/phase-7e-unavailable.png
portaldot-investigation/docs/research/CAPABILITY_MAP.md
portaldot-investigation/docs/research/COMPETITOR_AUDIT.md
portaldot-investigation/docs/research/NETWORK_FINDINGS.md
portaldot-investigation/docs/research/REPRODUCIBLE_COMMANDS.md
portaldot-investigation/scripts/research/decode-metadata.cjs
portaldot-investigation/scripts/research/evm-asset-probe.mjs
portaldot-investigation/scripts/research/evm-probe.mjs
portaldot-investigation/scripts/research/state-probe.cjs
portaldot-investigation/scripts/research/substrate-probe.mjs
```

These 37 files are new product, governance, test, and evidence material rather than relocations:

```text
.gitattributes
AGENTS.md
portaldot-investigation/api/onchain-proof.mjs
portaldot-investigation/browser/native-wallet.mjs
portaldot-investigation/docs/DESIGN.md
portaldot-investigation/docs/PRD.md
portaldot-investigation/docs/PRIVACY.md
portaldot-investigation/docs/PROGRESS.md
portaldot-investigation/docs/REPOSITORY_AUDIT.md
portaldot-investigation/docs/RULES.md
portaldot-investigation/docs/SUBMISSION.md
portaldot-investigation/docs/TASKS.md
portaldot-investigation/evidence/final-live-2026-10-30-01.json
portaldot-investigation/evidence/final-live-2026-10-31-01.json
portaldot-investigation/evidence/final-live-2026-10-31-02.json
portaldot-investigation/evidence/native-anchor-authorization-2026-10-30.json
portaldot-investigation/evidence/native-anchor-authorization-2026-10-31-refresh-01.json
portaldot-investigation/evidence/native-anchor-authorization-2026-10-31.json
portaldot-investigation/evidence/native-anchor-final-verification-2026-10-31-144509Z.json
portaldot-investigation/evidence/native-anchor-investigation-2026-10-31-072856Z.json
portaldot-investigation/evidence/native-anchor-preflight-2026-10-30.json
portaldot-investigation/evidence/native-anchor-recheck-2026-10-31-143830Z.json
portaldot-investigation/evidence/native-anchor-sidecar-2026-10-31-3b2f4eac7f1e.json
portaldot-investigation/evidence/phase-6-live-2026-10-30.json
portaldot-investigation/public/investigation.js
portaldot-investigation/public/onchain.js
portaldot-investigation/scripts/prepare-native-authorization.mjs
portaldot-investigation/src/native-anchor.mjs
portaldot-investigation/src/onchain-anchor.mjs
portaldot-investigation/test/investigation-guidance.test.mjs
portaldot-investigation/test/native-anchor.test.mjs
portaldot-investigation/test/native-wallet.test.mjs
portaldot-investigation/test/onchain-anchor.test.mjs
portaldot-investigation/test/onchain-proof-http.test.mjs
portaldot-investigation/test/onchain-wallet.test.mjs
portaldot-investigation/test/rpc-failure.test.mjs
portaldot-investigation/test/substrate-connection.test.mjs
```

### Dependencies, experiments, and generated material

Every declared package has a direct production, build, test, or reproducible-research use. No dependency was removed. `npm audit --omit=dev` reported zero vulnerabilities. Native anchoring is active. The contractless EVM proof path is supported but secondary. The undeployed registry contract remains explicitly experimental and tested. Original network probes remain historical/reproducible research. No generated build output, dependency cache, browser-test capture, local worktree, or validation snapshot is proposed for publication.

### Branch and deployment review

- `main` is the remote default branch, but the current local branch is `feat/phase-1-investigation-guidance` at `9ee9ea4ffac50b7701baa75acb8334ecdc3bc6c3`, two commits behind and five commits ahead of `origin/main` before the working-tree changes.
- Public PR #7 (`phase/8ab-docs-privacy`) and PR #2 (`review/unknown-balance-explanation`) remain open. A refreshed 2026-10-31 GitHub inspection reported both mergeable, though mergeability is transient. The isolated integration candidate selectively retains PR #2's fail-closed evidence improvement; PR #7 should be superseded rather than merged wholesale because its older no-wallet/no-transaction product description conflicts with the completed native anchoring workflow. Several other branches contain stacked commits not reachable from `origin/main`; therefore no branch was deletion-safe without owner reconciliation.
- The current Vercel production deployment is READY from `fix/two-release-blockers-20261029` at `f3ed348`, not from this working tree. The nested application root matches the current CI/deployment model. Root migration is intentionally deferred because it requires coordinated external configuration and preview acceptance.
- The deployment runbook requires a protected preview, route/CSP/wallet acceptance, explicit promotion, and rollback readiness. None of those remote actions were performed.

### Security and governance review

No credential, recovery phrase, private key, seed, signed raw transaction, sensitive filename, or machine-specific checkout path was found in the proposed 129-file tree or the reviewed reachable history. Public transaction hashes, block numbers, accounts, fees, and report commitments are intentional evidence. Browser signing remains explicit and one-shot; the server has no custody or signing path. Technical `PASS`, `FAIL`, and `UNKNOWN` behavior and beginner-facing wording remain covered by tests.

The seven governance documents exist: repository `AGENTS.md` plus `docs/PRD.md`, `DESIGN.md`, `RULES.md`, `TASKS.md`, `PROGRESS.md`, and `ARCHITECTURE.md`. No standalone file titled “Serial Hackathon Winner Playbook” exists in this checkout or reviewed history; the identifiable product, evidence, security, demo, and submission requirements are preserved across those governance files, `DEMO_SCRIPT.md`, and `SUBMISSION.md`.

### Validation evidence and exceptions

- `npm test`: 161 passed, 0 failed, including real Chrome and accessibility checks.
- `npm run check`: all configured syntax checks, including relocated research probes, and 161 tests passed.
- `npm run build`: succeeded.
- `npm audit --omit=dev`: zero vulnerabilities.
- `npm ci --ignore-scripts`: succeeded. The initial full-tree audit identified high-severity `GHSA-mrwp-f3q8-3g9p` in development-only `solc@0.8.38 -> follow-redirects@1.16.1`. Because `solc` permits `follow-redirects ^1.12.1`, the safe in-range update to patched `1.16.2` changed one transitive package without changing the declared dependency graph. The post-fix full-tree and production-only audits both reported zero vulnerabilities.
- Responsive checks at 1440, 768, and 375 pixels found no horizontal overflow.
- All 29 Markdown files in the final documentation scan had resolvable local links: 79 local targets checked, 0 missing.
- `git diff --check` reported no whitespace errors; Windows emitted only expected LF-to-CRLF working-copy warnings.

Release exceptions requiring owner action are branch/PR reconciliation, review and staging of this exact manifest, protected-preview acceptance, and explicit authorization for commit/push and any later production promotion. Platform firewall settings were not independently verified. These exceptions do not justify changing source files or remote state during this audit.
