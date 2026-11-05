# FIRMA

FIRMA is a Portaldot V3 interoperability verifier. It checks whether a native asset presents the same observable state through Portaldot's Substrate and EVM-compatible interfaces at one finalized block, exports inspectable evidence, reproduces supported historical reports, and can optionally record a deterministic report commitment through the user's SubWallet.

**Public application:** <https://firma-lemon.vercel.app/> returned HTTP 200 on 2026-10-31, but it is an earlier read-only build. It can demonstrate asset and report checking; it does not contain the completed native save-proof workflow described below. The existing local release candidate is the only verified route for evaluating all three workflows. It has not been published.

## How to test FIRMA

This walkthrough uses real repository evidence and the exact controls in the current candidate. Asset checks, report checks, and checks of an existing proof are read-only and require no wallet. Network access is required because FIRMA reads the configured Portaldot V3 test endpoints.

### 1. Start the complete candidate locally

Requirements: Node.js 22 or newer, npm, and network access to the configured Portaldot endpoints. No environment variable is required for the default testnet configuration.

```powershell
cd portaldot-investigation
npm ci --ignore-scripts
npm start
```

Open <http://127.0.0.1:4173>. Keep the terminal running while you use the browser. The public URL above is useful for the older read-only experience, but use this local route to test every workflow documented here.

### 2. Check an asset - no wallet

The **Check an asset** screen is already filled with the preserved example:

- Asset ID: `2`
- Account: `0x578f0a6155551b3b7c7ff255ea7dc2b08968e380`

Leave those values in place and select **Check asset**. FIRMA chooses one finalized native block, requests that same height through the EVM interface, recognizes the reviewed runtime, and compares mapping, supply, balance, and metadata. The result begins with **Passed**, **Failed**, or **Couldn't verify**, followed by the exact block, individual checks, and exportable JSON.

The preserved report [`final-live-2026-10-31-02.json`](portaldot-investigation/evidence/final-live-2026-10-31-02.json) records 9 `PASS`, 0 `FAIL`, and 0 `UNKNOWN` at block 263091 for these inputs. That is historical evidence, not a promise that a fresh request will return the same result. A new contradiction is `FAIL`; unavailable, incomplete, or unsupported evidence is `UNKNOWN`.

### 3. Recheck the preserved report - no wallet

Go to **Check a report** and:

1. Under **Upload report**, choose [`evidence/final-live-2026-10-31-02.json`](portaldot-investigation/evidence/final-live-2026-10-31-02.json).
2. To authenticate the exact file as well as reproduce its claims, paste this independently recorded commitment into **Expected commitment**: `0x8f9117121abb546b289a38f1d8afe73b379e41beb3d73895ecc2d7b5ebfabc6d`.
3. Select **Check evidence**.

FIRMA validates the complete `firma.report.v1` file, leaves its original verdict unchanged, and asks the endpoints for the saved historical state. The technical checks use `VERIFIED`, `MISMATCH`, and `UNAVAILABLE`. If the required history is still available and agrees, the UI reports the claims as reproduced and the supplied commitment as authenticated. If history has been pruned or an endpoint cannot answer, FIRMA reports `UNAVAILABLE` instead of silently substituting current state.

### 4. Check the recorded Portaldot proof - no wallet and no fee

Go to **Save or check proof** and:

1. Under **Original FIRMA report**, choose [`evidence/final-live-2026-10-31-02.json`](portaldot-investigation/evidence/final-live-2026-10-31-02.json).
2. Under **Native proof file**, choose [`evidence/native-anchor-sidecar-2026-10-31-3b2f4eac7f1e.json`](portaldot-investigation/evidence/native-anchor-sidecar-2026-10-31-3b2f4eac7f1e.json).
3. Select **Check saved proof**.

This read-only check recomputes the report commitment and inspects canonical chain inclusion, signer, call, payload, execution, and finality. The recorded transaction is `0x3b2f4eac7f1e2b2cd87493ff9d60e5326584840d8572570c5f21c06ee1750702`, in block 263713, using `system.remarkWithEvent`. The previously performed independent verification recorded 10 `VERIFIED`, 0 `MISMATCH`, and 0 `UNAVAILABLE`; inspect its unchanged [`final verification artifact`](portaldot-investigation/evidence/native-anchor-final-verification-2026-10-31-144509Z.json). A new check is deployment- and network-dependent, so report only what the current response shows.

You do not need a wallet or funds to evaluate this existing proof. Creating another proof is optional and is not part of the judge walkthrough. It requires SubWallet, a selected Portaldot V3 testnet account with enough native balance for the displayed maximum fee, and explicit approval after FIRMA shows the exact chain, account, call, commitment, payload, zero value, and maximum fee. FIRMA provides no faucet or test account and never submits or retries automatically.

### If the network is unavailable

Keep the preserved JSON files for inspection and try the read-only action again later. Do not interpret a timeout, pruned historical block, unavailable endpoint, or unsupported runtime as a contradiction. FIRMA returns `UNKNOWN` for an inconclusive asset check and `UNAVAILABLE` for an inconclusive historical or proof check. The [evidence index](portaldot-investigation/evidence/README.md) explains which artifacts are historical observations and which are prepared authorizations or independent checks.

## The problem

One Portaldot asset can be observed through two interfaces. A matching badge or screenshot does not show that both observations used the same finalized block, recognized the same runtime, mapped the same account, or compared exact integer values. FIRMA performs those checks explicitly and keeps missing evidence distinct from a demonstrated contradiction.

## Three workflows

1. **Check an asset** — compare network identity, runtime support, block context, mapping, supply, balance, and metadata across both interfaces.
2. **Check a report** — strictly validate an exported `firma.report.v1` file and reproduce supported claims at its historical block without changing the original verdict.
3. **Save or check proof** — optionally record a verified report commitment with one explicitly confirmed native testnet transaction, or independently check an existing proof against canonical execution and finality evidence.

Asset checks retain technical `PASS`, `FAIL`, and `UNKNOWN` results. Historical and proof checks use `VERIFIED`, `MISMATCH`, and `UNAVAILABLE`. Missing, timed-out, unsupported, or ambiguous evidence never becomes success.

## What the results mean

FIRMA checks whether two ways of reading the same Portaldot asset agree at one finalized block. `PASS` means every required comparison had evidence and agreed. `FAIL` means FIRMA observed a specific contradiction. `UNKNOWN` means it could not safely decide. These results cover the recorded network identity, block context, mapping, supply, balance, and metadata reads; they do not audit transfers, fees, events, permits, endpoint honesty, or consensus.

A saved report contains the inputs, endpoint observations, runtime identity, exact block context, individual checks, verdict, and limitations. Rechecking it lets another reviewer validate the file and ask for the same historical state. `VERIFIED` means a supported claim was reproduced, `MISMATCH` means available evidence contradicted it, and `UNAVAILABLE` means the required evidence could not currently be obtained. Unavailability is not evidence that the report is dishonest.

An on-chain commitment is a timestamped fingerprint of the complete report. It lets a reviewer show that the exact file matches a finalized transaction without putting the full report on-chain. The wallet authorizes one zero-value transaction and pays the network fee shown before confirmation; the report itself remains off-chain. A matching proof establishes inclusion of the report hash, not authorship, real-world identity, or the truth of every claim in the report.

## Why Portaldot matters

FIRMA relies on Portaldot V3's shared native/EVM state: native `Assets` storage, `Revive` account mapping, ERC-20-compatible asset reads, finalized Substrate context, and EVM JSON-RPC access. It is an operations and evidence tool for this dual-interface boundary, not a bridge, explorer, wallet, trading product, or general smart-contract auditor.

## Verified functionality

- Same-finalized-block native/EVM asset comparison.
- Fail-closed recognition of the reviewed Portaldot V3 genesis and runtime code.
- Exact base-unit arithmetic without JavaScript floating-point conversion.
- Strict report parsing, duplicate-key rejection, historical reproduction, and immutable original reports.
- Browser-only SubWallet signing after chain, account, call, payload, zero value, and maximum-fee review.
- One-shot submission and duplicate-attempt prevention.
- Independent proof verification of signer, call, payload, execution result, canonical inclusion, and finality.
- Responsive, keyboard-accessible browser flows with inspectable and downloadable JSON evidence.

The latest completed integration-candidate suite recorded 161 passing tests, a successful configured check and production build, and zero production dependency vulnerabilities. See [current progress](portaldot-investigation/docs/PROGRESS.md) for the dated result; CI must still validate the eventual pushed commit.

## Native transaction evidence

One separately authorized Portaldot V3 testnet commitment is preserved:

- Transaction: `0x3b2f4eac7f1e2b2cd87493ff9d60e5326584840d8572570c5f21c06ee1750702`
- Block: `263713`
- Extrinsic index: `1`
- Call: `system.remarkWithEvent`
- Report commitment: `0x8f9117121abb546b289a38f1d8afe73b379e41beb3d73895ecc2d7b5ebfabc6d`
- Final independent result: 10 `VERIFIED`, 0 `MISMATCH`, 0 `UNAVAILABLE`, with `ExtrinsicSuccess` and observed finality

Inspect the [final verification artifact](portaldot-investigation/evidence/native-anchor-final-verification-2026-10-31-144509Z.json) and [evidence index](portaldot-investigation/evidence/README.md). No registry contract was deployed. Recording a commitment proves inclusion of the exact report hash; it does not prove authorship or every claim inside the report.

## Architecture

```text
Browser / CLI
  -> bounded stateless verifier
     -> finalized Portaldot Substrate reads
     -> EVM reads pinned to the same height
  -> pure verdict policy
  -> JSON report

Optional native proof
  -> server prepares a PASS-only commitment
  -> browser verifies runtime and estimates the selected account
  -> user reviews and explicitly confirms in SubWallet
  -> separate sidecar records the finalized result
  -> independent verifier re-reads canonical chain evidence
```

The application remains in `portaldot-investigation/` because GitHub Actions and the existing Vercel project deliberately use that directory as the application root. Moving it requires a coordinated Vercel Root Directory change and a separately accepted deployment.

## Local setup

Requirements: Node.js 22 or newer and network access for live Portaldot verification.

```powershell
cd portaldot-investigation
npm ci --ignore-scripts
npm test
npm start
```

Open `http://127.0.0.1:4173`. No wallet is required for asset or report verification. A wallet is requested only if a user deliberately enters the optional save-proof flow and confirms the displayed transaction.

## Tests and builds

Run from `portaldot-investigation/`:

```powershell
npm test
npm run check
npm run build
npm audit --omit=dev
```

`npm run verify` performs a fresh live, read-only verification. Use a unique output filename; FIRMA refuses to overwrite evidence. Historical evidence and fixtures must not be presented as a fresh observation.

## Reproducing the evidence

- Read [the evidence index](portaldot-investigation/evidence/README.md).
- Run the CLI with a new file: `node bin/firma.mjs --output evidence\my-run.json`.
- Import a preserved report through **Check a report** to reproduce supported historical claims.
- Import the untouched report and native sidecar through **Check saved proof** to repeat the read-only canonical proof check.
- Use the [research commands](portaldot-investigation/docs/research/REPRODUCIBLE_COMMANDS.md) only for the dated investigation surfaces they document.

RPC responses are observable evidence, not cryptographic state proofs. Endpoint history and availability may be incomplete, and runtime upgrades fail closed until explicitly reviewed.

## Deployment

The production shape is a static frontend plus three stateless Node.js functions. The Vercel project Root Directory is `portaldot-investigation`; no secret is required. The exact protected-preview, firewall, promotion, acceptance, and rollback procedure is in [DEPLOYMENT.md](portaldot-investigation/docs/DEPLOYMENT.md).

Do not treat the current public URL as proof that this local working tree is deployed. A reviewed push, protected preview, exact-artifact acceptance, and separate promotion approval remain required.

## Security and privacy

- FIRMA never asks for or stores private keys, recovery phrases, seeds, or signed raw transactions.
- Signing remains inside the user's injected wallet.
- No automatic submission, retry, replacement, transfer, approval, or contract deployment is permitted.
- Public request bodies cannot choose RPC endpoints.
- Inputs, request sizes, concurrency, retries, and operation durations are bounded.
- Platform-wide rate limits must be reviewed before public promotion because in-function limits are instance-local.

Read [PRIVACY.md](portaldot-investigation/docs/PRIVACY.md), [SECURITY.md](portaldot-investigation/docs/SECURITY.md), and [ARCHITECTURE.md](portaldot-investigation/docs/ARCHITECTURE.md) before extending the system.

## Competition

FIRMA is prepared for the Portaldot Hacker House 2026 **Node Operations & Tooling** track. The repository does not claim a submitted or accepted entry. The owner must confirm the current DoraHacks requirements, record the accepted deployment, publish the final demo and deck, and retain submission confirmation.

See [SUBMISSION.md](portaldot-investigation/docs/SUBMISSION.md) and [DEMO_SCRIPT.md](portaldot-investigation/docs/DEMO_SCRIPT.md).

## Official Product Demonstration

**Project:** FIRMA  
**Competition:** Portaldot Hacker House 2026  
**Category:** Node Operations & Tooling

### Watch the Demonstration

[Watch FIRMA's Official Demo](https://youtu.be/OkpS4pAajIA?si=g5NUbRaIsm-ISkuz)

### Hackathon Submission

[View FIRMA on DoraHacks](https://dorahacks.io/build/50537)

This demonstration is part of FIRMA's official
Portaldot Hacker House 2026 submission.
## Documentation

- [Application development guide](portaldot-investigation/README.md)
- [Product requirements](portaldot-investigation/docs/PRD.md)
- [Product design](portaldot-investigation/docs/DESIGN.md)
- [Architecture and trust boundaries](portaldot-investigation/docs/ARCHITECTURE.md)
- [Engineering and evidence rules](portaldot-investigation/docs/RULES.md)
- [Privacy and data handling](portaldot-investigation/docs/PRIVACY.md)
- [Security and limitations](portaldot-investigation/docs/SECURITY.md)
- [Current tasks](portaldot-investigation/docs/TASKS.md)
- [Current progress](portaldot-investigation/docs/PROGRESS.md)
- [Production readiness](portaldot-investigation/docs/PRODUCTION_READINESS.md)
- [Repository cleanup audit](portaldot-investigation/docs/REPOSITORY_AUDIT.md)
- [Historical records](portaldot-investigation/docs/history/)
- [Investigation research](portaldot-investigation/docs/research/)
