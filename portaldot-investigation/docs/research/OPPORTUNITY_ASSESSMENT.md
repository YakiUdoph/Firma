# Opportunity assessment

> Historical product research prepared before the read-only MVP was completed. Candidate descriptions are proposals, not claims that SDK, CI-manifest, transfer, permit, or transaction functionality exists in production. The statement that V3 had three live assets refers to the October 20 snapshot; a bounded October 26 audit observed 21 asset IDs.

Only three candidates are included because the evidence supports these three. Candidate 1 is the only immediate build recommendation.

## Candidate 1 — Portaldot Interop Assurance Kit

One sentence: a runtime-adaptive SDK/CLI and CI gate that proves native assets and their EVM ERC-20/permit surfaces agree, and produces a signed-off compatibility manifest for each runtime version.

1. **Who has the problem?** Portaldot V3 asset issuers, Solidity teams, wallets, exchanges, indexers, and middleware teams integrating both Substrate and EVM APIs.
2. **What goes wrong?** The same asset is addressed by a numeric native ID, a derived H160 precompile, and mapped accounts. Metadata can be missing, runtime upgrades can change call layouts, permit domains can be misconfigured, and event/balance/allowance behavior can diverge. Integrators may show the wrong asset, wrong decimals, wrong account, or trust ERC-20 semantics that were never tested.
3. **Evidence.** The October 20 V3 snapshot contained three assets, 864 account mappings, asset precompiles, permit state, custom signed extensions, and two RPC surfaces. Five balances matched exactly across surfaces. A bounded October 26 audit later observed 21 live asset IDs; neither count is a permanent chain fact. Asset `806707` simultaneously demonstrated a useful edge case: working supply/balances but metadata calls revert. Upstream has an unresolved 2026 issue alleging dust/event invariant problems; that issue is a test target, not a Portaldot finding.
4. **Existing solutions.** Upstream asset precompiles provide the functionality. Polkadot JS, ethers, Foundry, and block explorers can inspect one surface. FailLens diagnoses Substrate errors. Reviewed Portaldot dashboards expose assets. None provides a V3-specific, cross-surface invariant manifest and CI gate.
5. **Remaining limitation.** The current evidence verifies reads only. Write/event/permit invariants need a funded controlled asset and explicit authorization.
6. **What is different?** It is not a token checker or dashboard. It continuously derives the runtime version and address/account mappings, executes a defined conformance suite, reconciles native storage with ABI results/events, and emits a portable JSON attestation plus integration code/constants. It should fail closed when the runtime changes.
7. **Why V3 is necessary.** The product's central object is V3's shared state across `Assets`, `Revive`, `AssetsPrecompiles`, permit storage, H160/AccountId mapping, and EVM JSON-RPC. On a single-interface chain there is no cross-surface invariant to prove.
8. **Buildable before Oct 24.** A read-only MVP can discover runtime/pallet versions, enumerate assets and mappings, derive confirmed precompile addresses, compare native/EVM supply/balances/metadata, check permit domain/nonce reads, and export a red/amber/green JSON/Markdown manifest. The scripts in this investigation are already a proof of the core read path. Keep the UI minimal or absent.
9. **Realistic before Nov 6.** Add an organizer-funded disposable asset; controlled native-to-EVM and EVM-to-native transfers; event and approval reconciliation; one permit test; runtime-upgrade diffing; a GitHub Action; published TypeScript library; evidence bundle and 3-minute demo. Do not promise broad XCM or production security certification.
10. **Risks.** Unknown signed extensions, write-path authorization/funding, incorrect event interpretation, upstream semantic bugs, runtime upgrades, false confidence from incomplete tests, and the danger of branding an experimental conformance report as an audit. Security output must clearly state coverage and block number/spec version.

Recommendation: **BUILD**, conditional on securing a funded canary account by Oct 21–22. If funding is unavailable, ship the read-only verifier but describe it as a compatibility manifest, not a complete conformance certification.

## Candidate 2 — EVM-signed Native Actions SDK

One sentence: allow a MetaMask/EVM user to invoke a small, policy-controlled set of native Portaldot actions without switching to a Substrate wallet, using V3's Ethereum transaction origin and native-call interface.

1. **Who has the problem?** Solidity dapps and EVM-native users who need staking, bounties, identity, assets, or other native pallets.
2. **What goes wrong?** Users otherwise need a second address format, wallet, transaction encoding model, and fee mental model. Developers fall back to custodial servers or omit native features.
3. **Evidence.** V3 metadata explicitly exposes `Revive.eth_substrate_call`, whose runtime docs say it dispatches a native runtime call from an Ethereum transaction. `MetaTx`, `VerifySignature`, H160 mappings, auto-map, and custom `EthSetOrigin`/`AuthorizeCall` signed extensions exist.
4. **Existing solutions.** PortalPilot and PortalHouse orchestrate native calls but are assistant/dashboard products and primarily use Substrate tooling. Upstream Revive supplies primitives. General relayers and account-abstraction systems address EVM calls, not this exact V3 native-call boundary.
5. **Remaining limitation.** No signed call was submitted. Fee payer, nonce, origin filters, allowed-call policy, extension encoding, and replay behavior remain unverified.
6. **What is different?** A typed, allowlisted bridge from Ethereum wallet signatures to selected native calls, with human-readable call decoding and policy constraints—not a wallet assistant or arbitrary transaction builder.
7. **Why V3 is necessary?** It depends directly on `eth_substrate_call`, Ethereum-origin handling, account mapping, and V3 runtime call metadata.
8. **Buildable before Oct 24.** Only a technical spike is credible: encode one harmless `Remark.store` or equivalent, estimate it, and—with funds/permission—submit it from an Ethereum account and prove the native event/origin. Without that canary, no honest demo is possible.
9. **Realistic before Nov 6.** A small SDK for two or three allowlisted calls, replay/domain checks, fee preview, safe call decoding, tests, and a demo. A general native-call gateway is too broad for the deadline.
10. **Risks.** Highest-risk candidate: custom signed extensions, arbitrary-call escalation, phishing/opaque SCALE payloads, replay/domain separation, gas-to-weight conversion, fee sponsorship abuse, and runtime drift.

Recommendation: **INVESTIGATE FURTHER**. Promote to build only after a signed canary proves the exact origin and fee path.

## Candidate 3 — V3 Migration Evidence Pack

One sentence: a compatibility scanner and test harness that tells older Portaldot projects exactly what breaks when moving from Season 1/rent-era Contracts assumptions to V3 Contracts or Revive, then generates a reproducible migration evidence pack.

1. **Who has the problem?** Existing Portaldot builders with old Wasm artifacts, hand-built calls, or tools pinned to spec version `1002` and older endpoints.
2. **What goes wrong?** Old projects document rent-era Contracts behavior while V3 live metadata has spec version `3002`, modern `Contracts` calls, `Revive`, EVM bytecode, and new custom extensions. A tool may connect but encode the wrong arguments or target the wrong VM.
3. **Evidence.** PortalHouse documents spec `1002`; InkPort explicitly targets rent-era seal0 at another endpoint; PortalPilot documents legacy calls. Live V3 exposes `Contracts.upload_code` and storage-deposit/WeightV2-style shapes plus `Revive` and EVM JSON-RPC.
4. **Existing solutions.** FailLens/PDK diagnoses transactions; InkPort handles its legacy target; PortalModeler models local flows; upstream compiler/tooling handles general Revive. None of the reviewed projects publishes a V3 migration matrix across both VMs.
5. **Remaining limitation.** Actual legacy artifacts were not compiled or deployed to V3, so incompatibility is inferred from interfaces and project documentation, not demonstrated for every artifact.
6. **What is different?** Artifact/repo inspection plus live metadata comparison and a reproducible compatibility report, not a deployment dashboard.
7. **Why V3 is necessary?** The migration delta is specifically old Portaldot runtime → V3 dual-contract runtime.
8. **Buildable before Oct 24.** Metadata diff, known project-pattern scanner, and a report for sample public repos.
9. **Realistic before Nov 6.** Automated compile/dry-run matrix for selected artifacts, migration recipes, and CI checks. Full source translation is unrealistic and overlaps InkPort.
10. **Risks.** Small addressable market, fast-decaying value after migration, overlap with PDK/InkPort, false positives from source heuristics, and expensive multi-toolchain setup.

Recommendation: **REJECT as a standalone product**. Fold runtime-diff and migration warnings into Candidate 1.

