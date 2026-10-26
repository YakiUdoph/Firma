# Deployment guide

## Recommended platform

Use Vercel with `portaldot-investigation` as the project root. The repository separates the static site (`dist`) from two Node.js functions (`api/verify.mjs` and `api/check-report.mjs`) and declares both in `vercel.json`.

This deployment shape is appropriate because the UI is static, verification is stateless, and every request must make short-lived read-only HTTPS and WebSocket calls. The configured function ceiling is 60 seconds; the verifier also enforces shorter operation-level timeouts.

## Configuration

No secret is required. Defaults point to the organizer-provided Portaldot V3 endpoints.

Optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `FIRMA_SUBSTRATE_ENDPOINT` | `wss://test-node-v3.portaldot.dev` | Substrate WebSocket endpoint |
| `FIRMA_EVM_ENDPOINT` | `https://test-evm-rpc-v3.portaldot.dev` | EVM JSON-RPC endpoint |
| `FIRMA_EXPECTED_CHAIN_ID` | `420420777` | Expected decimal EVM chain ID |
| `FIRMA_TIMEOUT_MS` | `15000` | Per-operation timeout |
| `FIRMA_RETRIES` | `1` | Retry count for transient read failures |

Do not add wallet mnemonics, private keys, RPC write credentials, or signing services. FIRMA does not use them.

## Protected preview procedure

1. Review and push the local commits to the intended Git remote.
2. Import the repository into Vercel and set the Root Directory to `portaldot-investigation`.
3. Keep Deployment Protection enabled for the first preview.
4. Confirm the build uses Node.js 22 or newer and runs `npm run build`.
5. Use the dated checklist in [`history/PRODUCTION_READINESS.md`](history/PRODUCTION_READINESS.md) as a starting point, then validate the current routes and UI against the current commit.
6. Review function logs for timeouts, sanitized error messages, and request duration.

## Platform rate limiting

The code includes bounded best-effort limiters, but serverless instances do not share that memory. Before public promotion, add reviewed Vercel Firewall rules for `POST /api/verify` and `POST /api/check-report`.

Start with a log-only rule and inspect real preview traffic:

```text
vercel firewall rules add "Observe FIRMA verification rate" \
  --condition '{"type":"path","op":"eq","value":"/api/verify"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action log --yes
vercel firewall diff
```

After observing the preview, begin with approximately 20 requests per minute per IP, validate it in preview, and adjust for legitimate demo traffic before enabling it in production. Treat this as an initial operating value, not a proven universal threshold.

## Post-deployment acceptance

Run from a separate network where possible:

```powershell
$body = @{ assetId = 2 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://<protected-preview>/api/verify" -ContentType "application/json" -Body $body
```

The response must have `verdict.overall` equal to `PASS`, chain ID `420420777`, runtime `portaldot-v3/3002`, and nine named checks. Record the deployed timestamp and observed block number; do not reuse the local block numbers as deployment proof.

Also verify HTTP 405 for GET on the API, HTTP 400 for malformed input, HTTP 413 for an oversized body, and HTTP 429 under the reviewed rate rule.

Confirm that `/privacy.html` loads from the exact preview build and that the footer link reaches it. Exercise `/api/check-report` with a valid historical report and confirm that the original verdict remains separate from the independent result.

## Rollback

If the preview exposes secrets, paths, stack traces, excessive latency, or inconsistent parity results, do not promote it. Keep the last known-good deployment, save sanitized logs, reproduce locally, and issue a normal corrective commit. Do not weaken the runtime gate or convert UNKNOWN into PASS to make the demo appear successful.
