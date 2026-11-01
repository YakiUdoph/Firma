# Hackathon submission package

Prepared on 2026-10-31. This is a truthful draft, not confirmation that a submission was published or accepted.

## Project facts

- **Project:** FIRMA
- **Track selected by the owner:** Node Operations & Tooling
- **One-line overview:** FIRMA verifies whether Portaldot native and EVM-compatible asset observations agree at one finalized block, reproduces historical reports, and checks finalized report commitments.
- **Repository:** https://github.com/YakiUdoph/Firma
- **Application:** https://firma-lemon.vercel.app/ (HTTP 200 confirmed on 2026-10-31; this is the older read-only build, not the complete local candidate)
- **Native network:** PortaldotV3 Test
- **Native endpoint:** `wss://test-node-v3.portaldot.dev`
- **EVM endpoint:** `https://test-evm-rpc-v3.portaldot.dev`
- **EVM chain ID:** `420420777`
- **Contract address:** Not applicable; no contract was deployed.

## Demonstrated evidence

- Same-block asset report: `evidence/final-live-2026-10-31-02.json`, 9/9 `PASS` at block 263091.
- Native transaction: `0x3b2f4eac7f1e2b2cd87493ff9d60e5326584840d8572570c5f21c06ee1750702`.
- Canonical location: block 263713, hash `0x645b9184955d4d3d02626b29a12f7522f8b631dc13a0046f0319fe6bd1b06ab6`, extrinsic 1.
- Call: signer `5En7dwvXVjsHA8AEjWwdLNFf1TnxiiRSE3VUXiX7S9Pr4QUz`, `system.remarkWithEvent`, call index `0x0007`, zero value.
- Commitment: `0x8f9117121abb546b289a38f1d8afe73b379e41beb3d73895ecc2d7b5ebfabc6d`.
- Independent result: 10 `VERIFIED`, 0 `MISMATCH`, 0 `UNAVAILABLE` at `2026-10-31T14:45:09.159Z`; finalized head 265219.
- Evidence: `evidence/native-anchor-final-verification-2026-10-31-144509Z.json`.

## Judge walkthrough

Use the local candidate for the complete evaluation. It requires Node.js 22 or newer, npm, and network access to the configured Portaldot V3 test endpoints. No environment variable or wallet is needed for the steps below.

```powershell
cd portaldot-investigation
npm ci --ignore-scripts
npm start
```

Open <http://127.0.0.1:4173>. The public application above can demonstrate the earlier asset and report experience, but it does not contain the completed native proof workflow.

| Action | Required input | Expected behavior | Verified repository evidence | Wallet | Limitation |
|---|---|---|---|---|---|
| Check an asset | Asset `2`; account `0x578f0a6155551b3b7c7ff255ea7dc2b08968e380` | Reads both interfaces at one finalized height and reports `PASS`, `FAIL`, or `UNKNOWN` per check | [`final-live-2026-10-31-02.json`](../evidence/final-live-2026-10-31-02.json) records 9/9 `PASS` at block 263091 | No | A fresh result depends on current endpoints and runtime support; the historical result is not a live guarantee |
| Export or inspect the result | A completed asset check | **Export evidence** downloads `firma.report.v1`; **Show complete JSON** displays the same evidence | The preserved report above is a genuine prior export | No | Exporting does not create an on-chain proof |
| Recheck a report | The preserved report; optional commitment `0x8f9117121abb546b289a38f1d8afe73b379e41beb3d73895ecc2d7b5ebfabc6d` | Strictly validates the file, preserves its verdict, and reproduces supported claims at the saved block | The report contains the inputs, raw observations, nine checks, verdict, and limitations | No | Pruned or unreachable historical state is `UNAVAILABLE`, not a mismatch |
| Check the native proof | Preserved report plus [`native-anchor-sidecar-2026-10-31-3b2f4eac7f1e.json`](../evidence/native-anchor-sidecar-2026-10-31-3b2f4eac7f1e.json) | Recomputes the commitment and checks canonical inclusion, signer, call, payload, success, and finality | [`native-anchor-final-verification-2026-10-31-144509Z.json`](../evidence/native-anchor-final-verification-2026-10-31-144509Z.json) records 10 `VERIFIED`, 0 `MISMATCH`, 0 `UNAVAILABLE` | No | A new check still depends on endpoint history and availability |
| Create a new proof | Independently verified `PASS` report; SubWallet; selected funded Portaldot V3 testnet account | Shows chain, account, call, commitment, payload, zero value, and maximum fee before one explicit wallet request | The existing transaction below demonstrates the flow | Yes | Optional; fee-bearing; judges do not need to do this; no faucet or test account is supplied |

### Exact browser steps

1. **Check the asset.** On **Check an asset**, leave asset ID `2` and the prefilled account unchanged. Select **Check asset**. Read the leading status, then open the comparison rows and **Show complete JSON**. `PASS` means supported evidence agreed, `FAIL` requires a demonstrated contradiction, and `UNKNOWN` means FIRMA could not safely decide.
2. **Export or open a report.** After a live result, select **Export evidence** to save it. To use the known artifact instead, open [`final-live-2026-10-31-02.json`](../evidence/final-live-2026-10-31-02.json) directly from the repository.
3. **Recheck the report.** Go to **Check a report**. Choose the preserved report under **Upload report**, optionally paste the recorded commitment above under **Expected commitment**, and select **Check evidence**. `VERIFIED` means a supported claim reproduced, `MISMATCH` means available evidence contradicted it, and `UNAVAILABLE` means the exact evidence could not currently be recovered.
4. **Check the recorded proof.** Go to **Save or check proof**. Choose the same report under **Original FIRMA report**, choose the preserved sidecar under **Native proof file**, and select **Check saved proof**. This is read-only and spends nothing.
5. **Inspect the independent record.** Open the final verification artifact linked above. It records transaction `0x3b2f4eac7f1e2b2cd87493ff9d60e5326584840d8572570c5f21c06ee1750702`, block 263713, extrinsic 1, `system.remarkWithEvent`, the expected commitment, `ExtrinsicSuccess`, and observed finality.

If a network request times out or historical state is unavailable, retain the displayed `UNKNOWN` or `UNAVAILABLE` result and inspect the preserved artifacts. Do not substitute current state or treat absence as dishonesty. The complete report remains outside the blockchain; the transaction stores only its versioned commitment. A matching proof establishes inclusion of that fingerprint, not authorship or the truth of every report claim.

## Known limitations

- RPC responses are independently repeated observations, not cryptographic state proofs.
- Historical state and endpoint availability can be incomplete or intermittent.
- A matching commitment proves inclusion of the report hash, not authorship or every report claim.
- The public production URL has not been verified to contain the current local finalization changes.
- Application-level rate limits are per serverless instance; platform firewall configuration still requires authorized review.

## Submission requirement status

The public Portaldot ecosystem page links the 2026 event to DoraHacks. Automated access to the event detail page returned HTTP 405 on 2026-10-31, so event-specific requirements must be confirmed by the owner in the logged-in DoraHacks page before submission.

Prepared materials:

- Public repository and judge-facing README: present locally; remote freshness not claimed.
- Runnable application and deployment instructions: present; current production freshness not claimed.
- Testnet transaction evidence: present and independently verified.
- Demo script under three minutes: updated in `DEMO_SCRIPT.md`; recording/public link not present.
- Pitch deck: outline below; published PDF/public link not present.
- Submission confirmation: not performed.

## Pitch deck outline

1. **Problem:** Native and EVM-compatible asset views can diverge or become unavailable, while screenshots and badges are not independently reproducible.
2. **Solution:** FIRMA pins both reads to one finalized block, applies fail-closed runtime recognition, and exports exact evidence.
3. **Check an asset:** Show the nine named checks and honest `PASS`/`FAIL`/`UNKNOWN` policy.
4. **Check a report:** Strict import, historical reproduction, deterministic commitment, and separate `VERIFIED`/`MISMATCH`/`UNAVAILABLE` result.
5. **Portaldot proof:** Native `system.remarkWithEvent`, explicit SubWallet authorization, real transaction, canonical success, and finality verification.
6. **Architecture and evidence:** Static frontend, stateless APIs, bounded native WSS/EVM HTTPS reads, browser-only signing, test and live evidence summary.
7. **Why it matters:** FIRMA gives operators and reviewers an inspectable interoperability check without custody, fabricated certainty, or a new contract.

## Owner checklist

1. Confirm the exact DoraHacks requirements, deadline, team fields, track selection, and public-link rules.
2. Review and approve the final diff, then push normally.
3. Create and verify a protected preview before production promotion.
4. Record/edit the demo from the accepted deployed version and publish it.
5. Produce and publish the pitch deck from the outline above.
6. Complete the DoraHacks form and retain submission confirmation.
