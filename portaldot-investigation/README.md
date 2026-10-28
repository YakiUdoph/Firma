# FIRMA

FIRMA is a read-only interoperability verifier for Portaldot V3. It answers a narrow but consequential question: **does one native asset have the same observable state through the Substrate and EVM interfaces at the same finalized block?**

- Source: https://github.com/YakiUdoph/Firma
- Live deployment: https://firma-lemon.vercel.app/

It is not an explorer, wallet, token checker, deployment tool, or audit. It never creates, signs, simulates, or submits a transaction.

## What the MVP proves

For a native asset ID and EVM account, FIRMA:

1. reads a finalized block from the Substrate endpoint;
2. identifies the runtime from the chain genesis and the finalized block's runtime `:code` hash, and records the raw metadata hash as evidence;
3. requests the exact same block number from the EVM endpoint;
4. verifies the expected EVM chain ID;
5. reads native supply, metadata, Revive account mapping, and account balance;
6. reads ERC-20 `totalSupply`, `balanceOf`, `name`, `symbol`, and `decimals` through `eth_call` at the pinned height;
7. compares base-unit values as arbitrary-precision integers; and
8. emits a machine-readable report with `PASS`, `FAIL`, or `UNKNOWN` for every check.

`PASS` means all nine required comparisons agreed using observations collected at one finalized block. It is not a guarantee that the asset, endpoints, or chain are safe. `FAIL` means FIRMA proved a contradiction. A timeout, missing historical block, unsupported runtime, unavailable endpoint, or undecodable response is `UNKNOWN` (“Couldn't verify”), not a failure.

The account address is the account whose balance and Revive mapping FIRMA checks. It is not an asset contract address. FIRMA derives the asset's EVM precompile address from the native asset ID and records both values separately in the evidence.

## Quick start

Requirements: Node.js 22 or newer and internet access to the organizer-provided test endpoints.

```powershell
npm ci --ignore-scripts
npm test
node bin/firma.mjs --help
node bin/firma.mjs --output evidence\my-run.json
```

The repository pins the Solidity registry source to LF so its committed artifact is reproducible on Windows and Unix-like systems. A Windows checkout created before that Git attribute was added must re-check out that source file (after preserving any local work), or use a fresh worktree, before running the artifact test.

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

The production target is a static frontend plus two stateless Node.js functions: one creates reports and one independently checks imported reports. Vercel is the recommended host because this request/response architecture fits Vercel Functions; FIRMA does not require an always-on WebSocket server. Each function opens bounded outbound RPC connections only while processing a request.

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

Historical evidence committed on 2026-10-20 includes:

- `PASS` for asset `2` at finalized block `121096`, including exact supply (`15000000000000000000`), mapped-account balance, and metadata parity.
- `PASS` for asset `806707` at finalized block `121099`, including exact supply/balance parity and consistent absence of metadata.

The complete, raw request/response evidence is in [evidence](evidence/). These are historical observations, not promises about future runtime state.

Fresh deployed acceptance checks on 2026-10-21 also returned 9/9 PASS for asset `2` at block `130112` and asset `806707` at block `130114`, both on runtime `portaldot-v3/3002` and chain ID `420420777`. See the [October 24 check-in](docs/OCTOBER_24_CHECKIN.md) for durations, validation results, and current deployment limitations.

## Repository map

```text
bin/firma.mjs          CLI and CI exit-code contract
src/verifier.mjs       Pinned read-only evidence collection
src/evaluate.mjs       Pure PASS / FAIL / UNKNOWN policy
public/                Beginner-friendly report UI
test/                  Offline fixtures and edge-case tests
api/verify.mjs         Production serverless API entrypoint
api/check-report.mjs   Independent historical report checker
scripts/               Production build and function smoke check
evidence/              Successful live JSON evidence
docs/                  Architecture, security, and progress notes
raw/                   Original investigation evidence
*.md                   Original feasibility/originality investigation
```

## Boundaries

- Portaldot V3 runtime support is deliberately fail-closed. The chain genesis, finalized runtime-code hash, version tuple, EVM chain ID, required pallets, and required query surfaces must match the reviewed support profile. Missing or different identity evidence is `UNKNOWN`.
- The raw metadata SHA-256 remains in every report for inspection, but it is not an approval key because a Revive storage fallback makes the raw metadata bytes vary across blocks without changing the runtime code.
- The product verifies reads only. It makes no claim about transfers, approvals, permits, events, gas, fees, dust, or signed origins.
- The precompile address convention is scoped to the runtime evidence documented in this repository.
- Public-search results cannot establish that no private or unpublished competitor exists.
- Public endpoints can rate-limit requests or prune historical state. FIRMA reports those observations as `UNKNOWN` or an unavailable independent check; it does not substitute current state.

## Why check an exported report?

An exported report preserves the block, evidence, and original verdict. The **Check a report** interface re-reads the saved finalized block and compares the new historical observations with the imported claims while leaving the original report unchanged. A verified reproduction increases confidence that the evidence can be retrieved again; a mismatch or unavailable historical read is shown separately and never rewrites the original verdict. Reproduction still depends on the configured endpoints and is not independent provider consensus or a cryptographic state proof.

Read [docs/SECURITY.md](docs/SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before extending the verifier.

Hackathon materials:

- [Production readiness report](docs/PRODUCTION_READINESS.md)
- [Deployment instructions](docs/DEPLOYMENT.md)
- [October 24 check-in](docs/OCTOBER_24_CHECKIN.md)
- [Three-minute demo script](docs/DEMO_SCRIPT.md)
- [Development history](docs/DEVELOPMENT_HISTORY.md)

