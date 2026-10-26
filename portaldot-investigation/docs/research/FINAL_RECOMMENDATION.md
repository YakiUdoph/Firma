# Final recommendation

> Historical product decision from the initial investigation. Future SDK, transaction, event, permit, and on-chain work described here was not implemented by the production application.

## Decision

**BUILD FIRMA, the focused read-only Portaldot Interop Assurance Kit**, with medium confidence. It is a differentiated, evidence-backed opportunity: a CI-grade compatibility/conformance layer for one logical asset across Portaldot V3's native and EVM surfaces.

The MVP now exists and passed live, same-height verification for two assets. This raises technical-feasibility confidence for the read-only scope. It does not change the low confidence around future write/event/permit conformance, which remains untested and outside this build.

Do not position it as an explorer, wallet assistant, token checker, transaction debugger, deployment dashboard, visual workflow builder, monitoring dashboard, or audit. Its value is reproducible cross-surface invariants and runtime-versioned evidence.

## Weighted assessment

Scores are intentionally conservative. Each category is scored out of 10 and converted using the supplied weights.

| Candidate | Feasibility 30% | Innovation 30% | Ecosystem 20% | Business 20% | Weighted total | Confidence | Decision |
|---|---:|---:|---:|---:|---:|---|---|
| Interop Assurance Kit | 8 (`24`) | 8 (`24`) | 9 (`18`) | 6 (`12`) | **78/100** | Medium | **BUILD** |
| EVM-signed Native Actions SDK | 5 (`15`) | 9 (`27`) | 9 (`18`) | 7 (`14`) | **74/100** | Low–medium | **INVESTIGATE FURTHER** |
| V3 Migration Evidence Pack | 8 (`24`) | 6 (`18`) | 8 (`16`) | 4 (`8`) | **66/100** | Medium | **REJECT standalone** |

The totals are prioritization aids, not predictions of judging outcomes.

## VERIFIED FACTS

- Both organizer-provided endpoints were reachable during the investigation.
- EVM chain ID is `420420777` on both `eth_chainId` and `net_version`.
- The live Substrate runtime is `portaldot-v3` spec version `3002`, with metadata v14 and 69 pallets.
- Native token properties are `tPOT`, 14 decimals, SS58 42.
- `Assets`, `Revive`, `AssetsPrecompiles`, `AssetsPrecompilesPermit`, `MetaTx`, and `VerifySignature` are present.
- `Revive.allowEVMBytecode=true`, `autoMap=true`, and the permit chain ID matches the EVM chain ID.
- Native assets `1`, `2`, and `806707` were readable.
- ERC-20 metadata/supply calls worked for assets with metadata.
- Five live native balances matched five EVM `balanceOf` results exactly after account mapping.
- EIP-2612 nonce/domain and ERC-20 allowance reads returned ABI-valid data for asset `2`.
- No asset-conversion pool and no used permit nonce were present at the observed block.
- No transaction or deployment was submitted.

## INFERENCES

- The chain is designed for meaningful native/EVM composition rather than merely hosting two unrelated interfaces.
- Integrators need runtime-aware mapping and conformance tooling because the address formula, account mapping, metadata edge cases, custom signed extensions, and dual event models are easy to mishandle.
- A focused assurance kit is more original relative to reviewed public Portaldot work than another UI, assistant, explorer, deployer, or flow builder.
- The read-only core can be demonstrated by the Oct 24 check-in. A credible write-conformance claim by Nov 6 is feasible only if funded test access is obtained promptly.

## UNKNOWNS

- Whether ERC-20 writes, approvals, permits, and events remain exactly consistent with native storage under all edge cases.
- Whether the upstream dust/event issue applies to Portaldot's pinned code.
- Whether `eth_substrate_call` and `MetaTx.dispatch` are usable by ordinary funded accounts with the expected fee/origin behavior.
- Exact custom signed-extension schemas needed for safe signing.
- Faucet/funding process and ordinary-user permissions.
- Runtime-upgrade schedule before the deadlines.
- Full public/private competitor set.

## COMPETITOR OVERLAP

- PDK/FailLens owns much of error diagnosis and developer-loop tooling.
- PortalPilot owns conversational simulation/assistant/explorer territory.
- PortalHouse owns broad dashboard/token-studio territory.
- InkPort owns a legacy Solidity-to-seal0 translation path.
- PortalModeler owns visual workflow territory.

Candidate 1 should therefore remain headless-first and evidence-first: TypeScript library + CLI + GitHub Action + machine-readable manifests. A small report viewer is acceptable, but the product must not drift into the crowded dashboard category.

## Build gates

1. **Now:** proceed with the read-only manifest/conformance MVP.
2. **By Oct 21–22:** obtain organizer confirmation of asset-precompile conventions, a funded test account, and permission for controlled writes.
3. **By Oct 24:** demonstrate live discovery plus native/EVM read parity, metadata failure handling, runtime fingerprinting, and CI output.
4. **After check-in:** perform a narrowly scoped write matrix on a disposable asset.
5. **By Nov 6:** ship write/event/permit reconciliation only if the matrix passes. Otherwise retain a truthful read-only compatibility product and publish failed/unknown checks.

## Stop conditions

Reconsider the build if organizers cannot provide safe test funds, if the runtime will change materially before judging without stable metadata access, or if a public team reveals an already-working V3 cross-surface conformance product. Do not compensate by expanding into an explorer or wallet assistant.

