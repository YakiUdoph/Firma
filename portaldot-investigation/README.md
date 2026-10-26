# FIRMA developer guide

FIRMA is a read-only, block-pinned verifier for one Portaldot V3 native asset and its EVM-compatible view. The [repository README](../README.md) explains the product and user problem; this guide covers development and operation.

- Source: https://github.com/YakiUdoph/Firma
- Live application: https://firma-lemon.vercel.app/

## Requirements

- Node.js 22 or newer
- npm
- Network access to the configured Portaldot V3 Substrate and EVM endpoints for live reads

No secret, wallet, private key, or seed phrase is required.

## Installation

Run application commands from this directory:

```powershell
npm ci --ignore-scripts
```

## Local development

```powershell
npm start
```

Open `http://127.0.0.1:4173`. The loopback server serves the static application and the same two API workflows used in production.

## CLI

```powershell
node bin/firma.mjs --help
node bin/firma.mjs --output evidence\my-run.json
node bin/firma.mjs --asset 806707 --account 0x81ed1dfbec067703fdca3daa7efcbeff4ba101ec --output evidence\asset-806707.json
```

The CLI refuses to overwrite an existing evidence file.

Exit codes:

| Code | Meaning |
|---:|---|
| `0` | All required checks passed |
| `1` | At least one contradiction was demonstrated (`FAIL`) |
| `2` | No contradiction was demonstrated, but required evidence was incomplete (`UNKNOWN`) |
| `64` | Invalid input or an evidence file would be overwritten |
| `70` | Unexpected internal error |

## Verification API

`POST /api/verify`

JSON body:

```json
{
  "assetId": "2",
  "account": "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380"
}
```

Both fields are optional; omitted fields use the configured defaults. Inputs are validated as a u32 asset ID and a 20-byte EVM address. A successful response contains a `firma.report.v1` report plus a request ID. The route is read-only, has an 8 KiB request limit, and applies per-instance concurrency and rate limits.

## Independent report-check API

`POST /api/check-report`

The request must use `Content-Type: application/json`:

```json
{
  "reportText": "{...the complete exported FIRMA JSON report...}",
  "expectedCommitment": null
}
```

The API validates the uploaded report, ignores endpoint URLs embedded in it, and re-queries the server-configured endpoints at the report's exact finalized block. Its result is `VERIFIED`, `MISMATCH`, or `UNAVAILABLE`; this is separate from the imported asset report's `PASS`, `FAIL`, or `UNKNOWN` verdict.

The browser accepts report files up to 256 KiB. The server bounds the outer request stream at 1 MiB, allows three checks per minute per instance/client key, caps active checks per instance, and applies a 55-second overall deadline.

## Configuration

Defaults are defined in `src/constants.mjs`. Operators may override them with:

| Variable | Default | Purpose |
|---|---|---|
| `FIRMA_SUBSTRATE_ENDPOINT` | `wss://test-node-v3.portaldot.dev` | Substrate WebSocket endpoint |
| `FIRMA_EVM_ENDPOINT` | `https://test-evm-rpc-v3.portaldot.dev` | EVM JSON-RPC endpoint |
| `FIRMA_EXPECTED_CHAIN_ID` | `420420777` | Expected decimal EVM chain ID |
| `FIRMA_TIMEOUT_MS` | `15000` | Per-operation timeout in milliseconds |
| `FIRMA_RETRIES` | `1` | Bounded EVM retry count |

Remote plaintext endpoints and credential-bearing endpoint URLs are rejected. Public request bodies cannot select endpoints.

## Testing

```powershell
npm test
npm run check
npm audit --omit=dev
```

`npm run check` performs syntax checks and the complete automated test suite. Tests use fixtures unless a test explicitly declares a live-network requirement. `npm run verify` is a live read against configured endpoints and is not part of the default offline suite.

## Production build

```powershell
npm run build
```

The build recreates `dist/` from `public/`. It includes the verification workspace and `/privacy.html`.

## Deployment

Production contains a static frontend and two stateless Node.js functions:

- `api/verify.mjs` creates a new read-only asset report.
- `api/check-report.mjs` independently reproduces an uploaded report.

Both functions are declared in `vercel.json`. See [the deployment guide](docs/DEPLOYMENT.md) for the protected-preview, rate-limit, and acceptance procedure.

## Evidence interpretation

For an asset report:

- `PASS`: all required observations were available and agreed.
- `FAIL`: a contradiction was demonstrated.
- `UNKNOWN`: the proof could not be completed safely.

For independent report checking:

- `VERIFIED`: the supported saved claims were reproduced.
- `MISMATCH`: at least one saved claim disagreed with the independently collected evidence.
- `UNAVAILABLE`: the exact historical evidence could not be safely reproduced.

Committed reports in [`evidence/`](evidence/) are historical observations. Asset `2` is the main successful testnet example. Asset `806707` demonstrates consistent handling of absent metadata. Creation transactions and original creator identities are not known. See the dated [network research](docs/research/NETWORK_FINDINGS.md) for the broader asset observations.

## Limitations

- Runtime support is fail-closed to the reviewed Portaldot V3 identity and runtime-code fingerprint.
- RPC providers may prune history, rate-limit, time out, or return incomplete data; those outcomes remain `UNKNOWN`/`UNAVAILABLE`.
- FIRMA does not establish endpoint honesty, consensus correctness, or cryptographic state proofs.
- Transfers, approvals, permits, events, gas, fees, dust behavior, wallet signing, and transaction submission are outside the production product.
- Experimental on-chain proof code is isolated under `experimental/onchain-proof/`; it is not imported by either production API or the browser and has not been deployed.

Read [architecture](docs/ARCHITECTURE.md), [security](docs/SECURITY.md), and [privacy](docs/PRIVACY.md) before extending the application.
