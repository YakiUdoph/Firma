# Deployment guide

## Recommended platform

Use Vercel with `portaldot-investigation` as the project root. The repository separates the static site (`dist`) from the stateless functions (`api/verify.mjs`, `api/check-report.mjs`, and `api/onchain-proof.mjs`) and declares the production settings in `vercel.json`.

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

Do not add wallet mnemonics, private keys, RPC write credentials, or signing services. The optional anchor is signed and submitted only by the visitor's injected SubWallet or EVM wallet after in-page confirmation. The production CSP must retain `wss://test-node-v3.portaldot.dev` in `connect-src` so the browser can independently verify the native runtime, estimate the account-specific fee, submit through the injected signer, and observe finality.

## Protected preview procedure

1. Review and push the local commits to the intended Git remote.
2. Import the repository into Vercel and set the Root Directory to `portaldot-investigation`.
3. Keep Deployment Protection enabled for the first preview.
4. Confirm the build uses Node.js 22 or newer and runs `npm run build`.
5. Run the acceptance checks in `PRODUCTION_READINESS.md` against the protected URL.
6. Review function logs for timeouts, sanitized error messages, and request duration.

### Reviewed CLI sequence

Run from `portaldot-investigation/` only after confirming authentication, team, project, commit, and environment. Do not pass tokens on the command line.

```powershell
vercel project inspect --non-interactive
vercel deploy
vercel inspect <preview-url>
vercel logs <preview-url>
```

The preview is for acceptance testing. To release the exact production-configured build without immediately assigning production domains, stage it and then promote that same deployment after acceptance:

```powershell
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod --skip-domain
vercel inspect <staged-production-url>
# Run the complete acceptance suite against <staged-production-url>.
vercel promote <staged-production-url>
```

Do not promote an ordinary preview URL as the final release: promotion rebuilds previews with production environment variables, so it would not serve the exact tested preview build. Promotion requires separate owner authorization.

## Platform rate limiting

The code includes bounded best-effort limiters, but serverless instances do not share that memory. Before public promotion, add Vercel Firewall rules for all three POST APIs. `/api/check-report` and `/api/onchain-proof` accept larger reports and perform historical network reads, so they require distinct reviewed limits.

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

For native anchoring acceptance, use SubWallet with the intended testnet SS58 account. Generate a fresh report and confirm the UI displays the exact genesis, account, `system.remarkWithEvent`, commitment, versioned payload, zero value, and maximum fee. Reject the wallet request once to confirm no transaction is submitted. A real transaction requires separate owner authorization; record its genuine extrinsic hash only after SubWallet returns it and finality is observed. Import the untouched report and `firma.anchor.native.v1` sidecar into **Check saved proof** and require `VERIFIED` only after signer, call, payload, execution event, canonical inclusion, and finality checks succeed.

The EVM route remains an optional compatibility check for separately funded 0x accounts. Its client-side 1 tPOT maximum-fee ceiling must remain enabled. Do not weaken the ceiling to accommodate the currently observed approximately 164.6 tPOT estimate.

## Rollback

If the preview exposes secrets, paths, stack traces, excessive latency, or inconsistent parity results, do not promote it. Keep the last known-good deployment, save sanitized logs, reproduce locally, and issue a normal corrective commit. Do not weaken the runtime gate or convert UNKNOWN into PASS to make the demo appear successful.

After an authorized production promotion, rollback commands are:

```powershell
vercel ls
vercel rollback <known-good-production-deployment-url-or-id>
```

Rollback disables automatic production assignment until a later explicit `vercel promote` restores it. Confirm the target project before either command and re-run post-deployment acceptance after rollback.
