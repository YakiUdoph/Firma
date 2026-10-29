# Deployment guide

## Recommended platform

Use Vercel with `portaldot-investigation` as the project root. The repository already separates the static site (`dist`) from the Node.js functions (`api/verify.mjs` and `api/check-report.mjs`) and declares the production settings in `vercel.json`.

This deployment shape is appropriate because the UI is static, verification is stateless, and every request must make short-lived read-only HTTPS and WebSocket calls. The configured function ceiling is 60 seconds; the verifier also enforces shorter operation-level timeouts. Independent report checks have a 55-second request deadline and reserve a bounded cleanup window before the platform ceiling. A historical Substrate timeout may open one fresh session and retry the same imported block, but it does not reset that deadline.

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
4. Confirm the build uses the configured Node.js 24 runtime and runs `npm run build`. CI must continue testing both Node.js 22 and 24.
5. Run the acceptance checks in `PRODUCTION_READINESS.md` against the protected URL.
6. Review `firma.verification.timing.v1` function logs for bounded stage timings, timeout categories, retry counts, and request duration. These diagnostics contain categories and counts, not endpoint URLs or credential-bearing error text.

## Platform rate limiting

The application includes bounded best-effort limiters, but serverless instances do not share that memory. The existing `firma` project has one live, valid custom firewall rule named `FIRMA API Rate Limit`:

- path starts with `/api/`, covering both API routes;
- fixed window of 60 seconds;
- limit of 10 requests per IP;
- platform `rate_limit` action;
- no draft or pending firewall changes.

Inspect it read-only before every release with a reviewed, pinned Vercel CLI:

```powershell
npx --yes vercel@65.7.0 project inspect --non-interactive
npx --yes vercel@65.7.0 firewall status --json
npx --yes vercel@65.7.0 firewall rules list --expand --json
```

The legacy Seawall configuration endpoint may return `404 Seawall Config not found` even while the first-class firewall interface reports the live rule. Use `vercel firewall status` and `vercel firewall rules list` as the configuration evidence. Do not stage, publish, disable, or reorder firewall rules during an application release without separate authorization.

## Post-deployment acceptance

Run from a separate network where possible:

```powershell
$body = @{ assetId = 2 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://<protected-preview>/api/verify" -ContentType "application/json" -Body $body
```

The response must have `verdict.overall` equal to `PASS`, chain ID `420420777`, runtime `portaldot-v3/3002`, and nine named checks. Record the deployed timestamp and observed block number; do not reuse the local block numbers as deployment proof.

Also verify HTTP 405 for GET on the API, HTTP 400 for malformed input, HTTP 413 for an oversized body, and HTTP 429 under the reviewed rate rule.

Verify the report workflow separately: export the exact browser-generated JSON, upload that same file, confirm structural and evidence consistency, reproduce its historical claims, and require an independently obtained commitment before calling it authenticated. A self-computed commitment is only an identifier for the uploaded contents.

If a default project alias was manually restored to an earlier deployment, Vercel may mark that alias as pinned so later production deployments do not move it automatically. Treat that warning as release state: inspect the alias target before and after preview work, and do not unpin, reassign, or promote it without explicit production authorization.

## Monitoring and maintenance

- Review bounded `firma.verification.timing.v1` logs after preview validation and after release. Logs contain request IDs, stage durations, retry counts, verdict counts, and sanitized categories—not endpoint credentials or raw error strings.
- Treat a new genesis hash, runtime-code hash, version tuple, missing required pallet, or missing query surface as unsupported. Update the reviewed support profile only after a separate chain/runtime audit and new live evidence.
- Run `npm audit --omit=dev` and the Node.js 22/24 CI matrix on dependency updates. Avoid broad upgrades unrelated to a confirmed advisory or platform requirement.
- If paid log retention or external error monitoring is unavailable, preserve sanitized deployment logs during an incident and use bounded Vercel runtime-log queries. Never add RPC URLs containing credentials to an incident artifact.
- Record the current production deployment ID and commit before promotion so rollback targets are explicit.

## Rollback

If the preview exposes secrets, paths, stack traces, excessive latency, or inconsistent parity results, do not promote it. Keep the last known-good deployment, save sanitized logs, reproduce locally, and issue a normal corrective commit. If a production release later regresses, use the recorded known-good deployment as the rollback candidate and verify domain assignment after rollback. Do not weaken the runtime gate or convert UNKNOWN into PASS to make a release appear successful.
