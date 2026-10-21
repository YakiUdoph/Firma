# October 24 prototype check-in

Verified on 2026-10-21 (Atlantic/Cape Verde).

## Product and links

FIRMA checks whether the same token information agrees across Portaldot V3's native Substrate interface and Ethereum-compatible interface at one finalized block. It is read-only.

- Public source: https://github.com/YakiUdoph/Firma
- Current live deployment: https://firma-lemon.vercel.app/
- Vercel Root Directory: `portaldot-investigation`

The live deployment is publicly reachable. It still serves the previously published UI until the reviewed local commits are pushed and Vercel redeployment is separately approved.

## Architecture

```text
Browser
  -> POST /api/verify { assetId, account }
  -> stateless Node.js function
     -> Portaldot native WSS endpoint
     -> Portaldot EVM HTTPS endpoint
  <- one JSON evidence report
  -> Passed / Failed / Couldn't verify + raw/exportable evidence
```

The verifier pins both reads to the same finalized height, gates comparisons on a supported runtime fingerprint, preserves exact integers, applies the documented account mapping, and evaluates nine named checks. `PASS`, `FAIL`, and `UNKNOWN` remain in the evidence schema.

## Genuine development history

The existing six commits and dates were preserved without rewriting:

1. `1f00d64` — docs: capture Portaldot V3 feasibility evidence
2. `4e326f8` — feat: add pinned native EVM verifier and CI verdicts
3. `c73ea52` — feat: add evidence viewer and operator documentation
4. `c2e9b98` — fix: harden verifier for production
5. `647e048` — docs: prepare hacker house release package
6. `d81e06a` — chore: finalize release validation

The verified local UI improvement is commit `92f77ed` (`feat: improve prototype verification experience`). It has not been pushed at the time of this report.

## Implemented prototype

- A faster first-time journey with the working form near the top of the page.
- Plain-language Passed, Failed, and Couldn't verify results while retaining technical statuses.
- Responsive four-step explanation and expandable technical details.
- Input validation, keyboard focus, evidence inspection, JSON copy, and JSON download.
- Read-only native WSS and EVM HTTPS verification at the same finalized block.
- Runtime compatibility gate, exact integer comparisons, bounded retries/timeouts, and nine named checks.
- CLI and serverless API with stable error classifications.

## Fresh deployed evidence

These requests ran against `https://firma-lemon.vercel.app/api/verify`; they are observations, not fixtures or promises about future chain state.

| Request | HTTP | Duration | Finalized block | Runtime | Chain ID | Result |
|---|---:|---:|---:|---|---:|---|
| Asset `2`, documented default account | 200 | 8.097 s | 130112 | `portaldot-v3/3002` | 420420777 | 9/9 PASS |
| Asset `806707`, account `0x81ed1dfbec067703fdca3daa7efcbeff4ba101ec` | 200 | 7.939 s | 130114 | `portaldot-v3/3002` | 420420777 | 9/9 PASS |

Both reports passed: Substrate endpoint, EVM endpoint, expected EVM chain ID, runtime support, shared block context, total supply parity, runtime account mapping, account balance parity, and metadata parity. Successful endpoint checks demonstrate that the deployed function reached the native WSS and EVM HTTPS services.

Additional deployed behavior:

- frontend `GET /`: HTTP 200 in 0.971 s;
- unsupported `GET /api/verify`: HTTP 405 in 3.319 s;
- malformed JSON POST: HTTP 400 in 0.919 s;
- responses included request IDs and the configured CSP, `no-referrer`, `nosniff`, and Permissions Policy headers.

Raw live responses were inspected during acceptance testing but are not committed here. No credentials, private keys, transaction hashes, or workstation paths were introduced.

## Quality evidence

- `npm run check`: 26 tests passed, 0 failed.
- `npm run build`: passed and produced `dist`.
- `npm audit --omit=dev`: 0 known vulnerabilities.
- Real Chrome, local updated UI: verified at 1440 px, 768 px, and 375 px widths.
- At all three widths, document `scrollWidth` equaled `clientWidth`; no horizontal overflow was detected.
- A real browser verification of asset 2 produced Passed, block 130100, runtime `portaldot-v3/3002`, chain ID 420420777, and 9/9 technical PASS results. Focus moved to the verdict and no console errors were observed.

## Current limitations and security status

- The public URL is currently unrestricted; it is not a protected preview.
- The application limiter is in-process and instance-local: five requests per minute per client and four active requests per instance. It is not a substitute for a platform-wide rule.
- Project-specific Vercel firewall configuration could not be read: the available Vercel connection returned HTTP 403 for the owning team, and the local CLI has no credentials. No custom platform rate limit is therefore claimed.
- The updated UI has been validated locally but is not on the live URL until push/redeployment approval.
- Portaldot network state can change. Unsupported runtimes, endpoint failures, timeouts, or undecodable responses intentionally become `UNKNOWN` / Couldn't verify.
- FIRMA verifies the documented address convention and read parity; it does not independently prove that the convention is canonical.

Before wider promotion, use a protected preview to validate the new commit, grant read access to inspect the Vercel firewall, stage a path-specific `/api/verify` rate rule in log mode, review legitimate traffic, and only then enable a conservative blocking threshold.

## Contract and transaction status

No smart contract address or transaction hash applies. FIRMA deploys no contract and submits no transaction; it performs read-only RPC calls and never requests a wallet or private key.

## Reproduce

```powershell
cd portaldot-investigation
npm ci --ignore-scripts
npm run check
npm run build
npm audit --omit=dev
npm start
```

Open `http://127.0.0.1:4173`, keep the documented asset 2 defaults, and select **Verify on Portaldot V3**. Use **View raw evidence**, **Copy JSON**, and **Download JSON** to inspect or export the report.

## Check-in decision

The local prototype and the currently deployed verifier behavior are demonstrated. FIRMA is not yet ready for public promotion because the improved commit is not deployed to a protected preview and the project-specific firewall configuration remains unverified. No DoraHacks submission has been made.
