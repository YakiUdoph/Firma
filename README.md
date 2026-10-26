# FIRMA

FIRMA is a read-only Portaldot V3 interoperability verifier. It checks whether one native asset has the same observable supply, metadata, account mapping, and balance through Portaldot's Substrate and Ethereum-compatible interfaces at one finalized block.

It is built for asset issuers, Solidity teams, wallets, exchanges, indexers, and middleware developers who need to integrate both interfaces without accidentally comparing different blocks or treating missing evidence as success.

## The problem FIRMA solves

On Portaldot V3, one asset can appear as a numeric native asset ID, an ERC-20-compatible precompile address, and a balance held through a mapped account. A value from one interface is not useful evidence of parity unless the other interface is read at the same finalized height and the runtime assumptions are known.

FIRMA pins the comparison to a finalized block, recognizes the reviewed V3 runtime, reads both interfaces, and exports the observations and verdicts as inspectable JSON. Portaldot V3 is essential to the product because its shared native Assets, Revive account mapping, and EVM precompile state are the relationship FIRMA verifies.

## What works today

- Verify one asset ID and one public 0x account at a finalized block.
- Compare native and EVM supply, balance, name, symbol, and decimals.
- Verify the Revive mapping between the EVM address and native account.
- Return a technical `PASS`, `FAIL`, or `UNKNOWN` for every check.
- Export a versioned JSON evidence report.
- Upload a saved report and independently reproduce its supported observations at the original block.

`PASS` means every required observation was available and agreed. `FAIL` means FIRMA demonstrated a contradiction. `UNKNOWN` means FIRMA could not safely complete the proof—for example because an endpoint timed out, history was unavailable, or the runtime was unsupported.

## Try the live application

Open [firma-lemon.vercel.app](https://firma-lemon.vercel.app/).

The default example uses asset ID `2`, a Portaldot V3 testnet asset whose October 26, 2026 audited snapshot had metadata `TEST`, 18 decimals, and a supply of 15 tokens. FIRMA did not create this asset. Its creation transaction and original creator are unknown.

1. Keep the example values or enter another u32 asset ID and public 0x account.
2. Select **Check asset**.
3. Inspect the beginner-facing result and open individual technical evidence rows.
4. Select **Export evidence** to save the JSON report.
5. Under **Check a report**, upload that report to reproduce its supported observations independently.

Uploaded reports are sent to FIRMA's server for validation and historical RPC reads. Read the [privacy notice](portaldot-investigation/docs/PRIVACY.md) before uploading evidence.

## Run locally

Requirements: Node.js 22 or newer and network access to the configured Portaldot V3 test endpoints.

```powershell
cd portaldot-investigation
npm ci --ignore-scripts
npm run check
npm start
```

Open `http://127.0.0.1:4173`.

For the CLI:

```powershell
node bin/firma.mjs --help
node bin/firma.mjs --output evidence\my-verification.json
```

Evidence files use no-overwrite semantics. Choose a new output name for each run.

## Evidence and reproducibility

Committed reports in [`portaldot-investigation/evidence/`](portaldot-investigation/evidence/) are dated historical observations, not claims about permanent chain state. Investigation artifacts are retained under `raw/`, and dated development/audit records are retained under `docs/history/` and `review-artifacts/`.

The application README explains the [CLI, APIs, configuration, tests, and evidence format](portaldot-investigation/README.md).

## Current limits

FIRMA does not connect wallets, sign messages, submit transactions, transfer assets, deploy contracts, or hold private keys. It does not prove transfer, approval, permit, event, gas, fee, dust, endpoint-honesty, or consensus behavior. A report is inspectable RPC evidence, not a cryptographic state proof or security audit.

The example assets are testnet observations. Current owner, issuer, admin, or freezer fields do not establish an asset's original creator or creation transaction.

## Documentation

- [Developer and operating guide](portaldot-investigation/README.md)
- [Architecture and trust boundaries](portaldot-investigation/docs/ARCHITECTURE.md)
- [Security and limitations](portaldot-investigation/docs/SECURITY.md)
- [Privacy](portaldot-investigation/docs/PRIVACY.md)
- [Deployment](portaldot-investigation/docs/DEPLOYMENT.md)
- [Research](portaldot-investigation/docs/research/)
- [Historical records](portaldot-investigation/docs/history/)

