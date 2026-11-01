# FIRMA application guide

The repository-level [README](../README.md) is the public product overview. This document is the concise developer and operator guide for the application rooted in this directory.

FIRMA provides three workflows:

1. **Check an asset** at one finalized Portaldot V3 block through the native and EVM-compatible interfaces.
2. **Check a report** by validating and independently reproducing supported historical claims.
3. **Save or check proof** by optionally anchoring a verified report through the user's SubWallet or by independently checking existing native evidence.

Verification uses `PASS`, `FAIL`, and `UNKNOWN`; historical and proof reproduction uses `VERIFIED`, `MISMATCH`, and `UNAVAILABLE`. Missing or inconclusive evidence never becomes success.

## Requirements

- Node.js 22 or newer
- npm
- Network access only when running live verification or proof checks
- SubWallet only for the optional, explicitly confirmed native anchoring flow

No secret, private key, recovery phrase, or server-side signer is required or accepted.

The default configuration needs no environment variables. Operators may override `FIRMA_SUBSTRATE_ENDPOINT`, `FIRMA_EVM_ENDPOINT`, `FIRMA_EXPECTED_CHAIN_ID`, `FIRMA_TIMEOUT_MS`, and `FIRMA_RETRIES`; defaults and validation requirements are listed in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Never place wallet secrets or signing credentials in environment variables.

## Install and validate

Run all commands from this directory:

```powershell
npm ci --ignore-scripts
npm test
npm run check
npm run build
npm audit --omit=dev
```

`npm run check` includes syntax validation and the complete test suite. `npm run build` copies the static application to `dist/` and bundles the browser-only native wallet adapter.

## Local application

```powershell
npm start
```

Open `http://127.0.0.1:4173`. The local server binds only to loopback, fixes RPC endpoints in operator configuration, validates input, bounds request bodies and concurrency, and serves the same three API shapes used in production.

## CLI verification

```powershell
node bin/firma.mjs --help
node bin/firma.mjs --output evidence\my-run.json
```

Evidence output has no-overwrite semantics. Always choose a new filename. `npm run verify` is a live read-only operation; do not describe a historical or fixture result as fresh.

CLI exit codes:

| Code | Meaning |
|---:|---|
| `0` | All required checks passed |
| `1` | At least one contradiction was demonstrated (`FAIL`) |
| `2` | No contradiction was demonstrated, but evidence was incomplete (`UNKNOWN`) |
| `64` | Invalid input or existing output path |
| `70` | Unexpected internal failure |

## Native proof workflow

The preferred optional write is a zero-value `system.remarkWithEvent` transaction containing the versioned FIRMA report commitment. Preparation is restricted to an independently verified `PASS` report and the reviewed Portaldot V3 runtime.

Before the wallet request, the browser displays and rechecks:

- chain and genesis;
- selected SS58 account;
- runtime profile and call index;
- deterministic commitment and complete payload;
- zero transferred value; and
- account-specific maximum fee.

Submission is browser-only, one-shot, and never retried automatically. The resulting `firma.anchor.native.v1` sidecar is separate from the original report. Independent checking retrieves canonical block, extrinsic, event, execution, and finality evidence instead of trusting the sidecar.

The demonstrated transaction and final evidence are indexed in [evidence/README.md](evidence/README.md). No registry contract was deployed. The EVM proof route and registry package remain secondary experimental compatibility material.

## Project layout

```text
api/                         Stateless production HTTP handlers
bin/firma.mjs                CLI and exit-code contract
browser/native-wallet.mjs    Browser-only SubWallet integration
docs/                        Current product, release, history, and research records
evidence/                    Preserved reports and anchor evidence
experimental/onchain-proof/  Undeployed EVM/registry compatibility experiment
public/                      Static user interface
raw/ and requests/           Dated investigation inputs and observations
scripts/                     Build, smoke, and authorization utilities
src/                         Verification and proof logic
test/ and test-support/      Offline, browser, security, and protocol coverage
server.mjs                   Loopback development adapter
vercel.json                  Production function and security-header configuration
```

The nested application root is intentional. GitHub Actions and the existing Vercel project both use `portaldot-investigation/`. Moving it requires a coordinated infrastructure change and deployment acceptance; it is not a cosmetic file move.

## Deployment

Vercel should keep this directory as the project Root Directory. The build command is `npm run build`, output is `dist`, and production APIs are:

- `api/verify.mjs`
- `api/check-report.mjs`
- `api/onchain-proof.mjs`

No secret is required. Optional operator-controlled RPC overrides and the protected-preview/promote/rollback procedure are defined in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Platform firewall review remains a publication gate.

## Evidence and limitations

- Reads are pinned to one finalized height and runtime support is fail-closed.
- Exact supplies and balances remain decimal strings backed by `BigInt`.
- RPC responses are inspectable observations, not cryptographic state proofs.
- A matching anchored commitment proves inclusion of the report hash, not authorship or the truth of every report claim.
- Endpoint history, availability, and runtime compatibility can be incomplete; those cases remain `UNKNOWN` or `UNAVAILABLE`.

## Documentation ownership

- [PRD](docs/PRD.md): product scope and acceptance criteria
- [DESIGN](docs/DESIGN.md): user experience and accessibility
- [ARCHITECTURE](docs/ARCHITECTURE.md): current system and trust boundaries
- [RULES](docs/RULES.md): engineering and evidence constraints
- [PRIVACY](docs/PRIVACY.md): request, browser, wallet, and third-party data handling
- [SECURITY](docs/SECURITY.md): controls and limitations
- [TASKS](docs/TASKS.md): current actionable work
- [PROGRESS](docs/PROGRESS.md): current implementation state
- [DEPLOYMENT](docs/DEPLOYMENT.md): release and rollback procedure
- [SUBMISSION](docs/SUBMISSION.md): competition package and owner checklist
- [REPOSITORY_AUDIT](docs/REPOSITORY_AUDIT.md): cleanup inventory and before/after evidence
- [history](docs/history/): dated records that no longer define current behavior
- [research](docs/research/): original Portaldot investigation and reproducibility material

Read [docs/PRIVACY.md](docs/PRIVACY.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing verification or wallet behavior.
