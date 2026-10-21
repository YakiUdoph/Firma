# FIRMA

FIRMA is a read-only interoperability verifier for Portaldot V3. It answers a narrow but consequential question: **does one native asset have the same observable state through the Substrate and EVM interfaces at the same finalized block?**

It is not an explorer, wallet, token checker, deployment tool, or audit. It never creates, signs, simulates, or submits a transaction.

## What the MVP proves

For a native asset ID and EVM account, FIRMA:

1. reads a finalized block from the Substrate endpoint;
2. fingerprints the runtime and metadata at that block;
3. requests the exact same block number from the EVM endpoint;
4. verifies the expected EVM chain ID;
5. reads native supply, metadata, Revive account mapping, and account balance;
6. reads ERC-20 `totalSupply`, `balanceOf`, `name`, `symbol`, and `decimals` through `eth_call` at the pinned height;
7. compares base-unit values as arbitrary-precision integers; and
8. emits a machine-readable report with `PASS`, `FAIL`, or `UNKNOWN` for every check.

`FAIL` means FIRMA proved a contradiction. A timeout, missing historical block, unsupported runtime, unavailable endpoint, or undecodable response is `UNKNOWN` (“Couldn't Verify”), not a failure.

## Quick start

Requirements: Node.js 22 or newer and internet access to the organizer-provided test endpoints.

```powershell
npm ci --ignore-scripts
npm test
node bin/firma.mjs --help
node bin/firma.mjs --output evidence\my-run.json
```

The output file is created with no-overwrite semantics. Choose a new filename for every run.

Known missing-metadata edge case:

```powershell
node bin/firma.mjs --asset 806707 --account 0x81ed1dfbec067703fdca3daa7efcbeff4ba101ec --output evidence\asset-806707.json
```

## Local web interface

```powershell
npm start
```

Open `http://127.0.0.1:4173`. The browser talks only to the local FIRMA server. The server fixes the chain endpoints in configuration, validates inputs, allows one active run per client, and limits clients to five runs per minute.

## Production build and deployment

```powershell
npm run check
npm run build
```

The production target is a static frontend plus one stateless Node.js function. Vercel is the recommended host because this request/response architecture fits Vercel Functions; FIRMA does not require an always-on WebSocket server. The function opens a bounded outbound Substrate WebSocket only while processing a verification.

Set the Vercel project Root Directory to `portaldot-investigation`. No secret is required. Optional environment overrides are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Platform-level rate limiting must be staged and reviewed before making the URL public.

## CI use

```powershell
node bin/firma.mjs --json --output evidence\ci-report.json
```

Exit codes:

| Code | Meaning |
|---:|---|
| `0` | All required checks passed |
| `1` | At least one mismatch was proven (`FAIL`) |
| `2` | No mismatch was proven, but evidence was incomplete (`UNKNOWN`) |
| `64` | Invalid input or an evidence file would be overwritten |
| `70` | Unexpected internal error |

See [the repository workflow](../.github/workflows/firma.yml) for a runnable GitHub Actions example.

## Verified live results

On 2026-10-20, the completed implementation produced:

- `PASS` for asset `2` at finalized block `121096`, including exact supply (`15000000000000000000`), mapped-account balance, and metadata parity.
- `PASS` for asset `806707` at finalized block `121099`, including exact supply/balance parity and consistent absence of metadata.

The complete, raw request/response evidence is in [evidence](evidence/). These are historical observations, not promises about future runtime state.

## Repository map

```text
bin/firma.mjs          CLI and CI exit-code contract
src/verifier.mjs       Pinned read-only evidence collection
src/evaluate.mjs       Pure PASS / FAIL / UNKNOWN policy
public/                Beginner-friendly report UI
test/                  Offline fixtures and edge-case tests
api/verify.mjs         Production serverless API entrypoint
scripts/               Production build and function smoke check
evidence/              Successful live JSON evidence
docs/                  Architecture, security, and progress notes
raw/                   Original investigation evidence
*.md                   Original feasibility/originality investigation
```

## Boundaries

- Portaldot V3 runtime support is deliberately explicit. A different runtime is `UNKNOWN` until its mapping conventions are verified.
- The product verifies reads only. It makes no claim about transfers, approvals, permits, events, gas, fees, dust, or signed origins.
- The precompile address convention is scoped to the runtime evidence documented in this repository.
- Public-search results cannot establish that no private or unpublished competitor exists.

Read [docs/SECURITY.md](docs/SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before extending the verifier.

Hackathon materials:

- [Production readiness report](docs/PRODUCTION_READINESS.md)
- [Deployment instructions](docs/DEPLOYMENT.md)
- [October 24 check-in](docs/OCTOBER_24_CHECKIN.md)
- [Three-minute demo script](docs/DEMO_SCRIPT.md)
- [Development history](docs/DEVELOPMENT_HISTORY.md)

