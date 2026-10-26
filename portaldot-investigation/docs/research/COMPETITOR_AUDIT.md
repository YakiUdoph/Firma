# Competitor and prior-art audit

> Historical research. Repository and event observations were time-specific and should be rechecked before making current competitive or competition claims.

Research date: 2026-10-20. Internet access was available. This audit separates repository/site claims from facts independently observed here. Repositories and private or unpublished work may exist outside search indexing; absence from this list is not proof of absence.

## Named projects

| Project | Documented capability | What was independently observed | Overlap with proposed direction |
|---|---|---|---|
| [Portaldot Dev Kit / FailLens](https://github.com/PugarHuda/portaldot-dev-kit) | Error decoding, doctor/debug/simulate/send/watch tools, Python and TypeScript packages; README claims 184 pytest and 141 vitest cases in current v0.2. | Public repo exists with Python/TS/test/site directories and published-package links. Its tests and node-backed claims were not run in this investigation. | Strong overlap with generic diagnostics and metadata tooling. Little documented overlap with cross-surface native/EVM asset invariants. A new product should integrate or emit FailLens-compatible errors, not recreate it. |
| [PortalPilot](https://github.com/ismailridwans/portalpilot) | Natural-language chain reads/actions, dry-run, fee preview, transfers/batches/remarks, explorer, and an SDK. README distinguishes live reads from local-node writes. | Public repo with app/API/SDK/scripts exists. The live URL could not be fetched by the research browser. No write flow was run. | High overlap with wallet assistant, explorer, transaction simulation, and generic SDK ideas. Avoid these categories. No documented V3 native-asset/ERC-20 conformance layer. |
| [PortalHouse](https://github.com/Investorquab/portaldot-hackathon-2026-portalhouse-investorquab) | Seven-module dashboard: explorer, token studio, contract deploy, bounty board, AI assistant, profile. It targets older spec version `1002`. | Public repo and a reachable Vercel HTML shell were observed. README claims of working writes were not independently executed. README itself says real ink! integration was a next-phase item. | High overlap with dashboards, token creation, explorers, wallet/profile, and assistant features. It does not document invariant checks between native assets and V3 ERC-20 precompiles. |
| [InkPort](https://github.com/freedanjeremiah/portaldot-hackathon-2026-inkport-dmk) | Translates a Solidity subset to raw seal0 Rust/Wasm for a legacy `pallet-contracts` endpoint; README claims 30 deployed/tested contracts. | Public repo, deployment-address file, and live informational site were observed. The claimed deployments/tests were not replayed. Its documented target is a different endpoint and rent-era runtime. | Overlaps contract language/toolchain and migration concerns. It does not target the verified V3 Revive asset/account interoperability. Its old-runtime assumptions must not be projected onto V3. |
| [PortalModeler](https://github.com/DanhCaTuanNgoc/portaldot-hackathon-2026-PortalModeler-Tuanngoc) | Visual node workbench for local balance, fee estimate, transfer, contract state, and artifact export; primary proof is a local POT transfer. | Public repo documentation was reviewed; local proof was not run. | Direct overlap with the excluded visual workflow/deployment tooling categories. No reason to compete here. |

## Additional public submission found

| Project | Documented capability | Verification status | Relevance |
|---|---|---|---|
| [World Cup Copilot](https://github.com/MaxxxDong/portaldot-hackathon-2026-world-cup-copilot-max) | Browser/AI context feeding a three-outcome fan market; README provides local/dev-chain transaction evidence and explicitly says public native POT access was not confirmed. | Repository/docs found; its hosted local-chain proof and writes were not replayed. | Consumer prediction-market direction, not interop assurance. Demonstrates that teams already occupy generic escrow/market territory. |

## Established upstream capabilities and adjacent work

- The [Polkadot SDK asset-precompile implementation](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/frame/assets/precompiles/src/lib.rs) exposes ERC-20 metadata, balances, approvals, transfers, EIP-2612 nonces/permit, and maps EVM addresses to runtime accounts. This is implementation infrastructure, not a Portaldot-specific product or operational conformance service.
- The [Polkadot SDK kitchen-sink runtime documentation](https://paritytech.github.io/substrate/master/src/kitchensink_runtime/lib.rs.html) contains a closely matching pallet layout and asset-precompile prefix pattern. This was used only to form probe hypotheses; successful live ABI responses, not the similarity alone, are the confirmation.
- The public [Revive compiler repository](https://github.com/paritytech/revive) warns that PVM/Revive semantics differ from Ethereum in material ways. This supports the need for compatibility testing but does not prove a Portaldot defect.
- A September 2026 [open Polkadot SDK issue about ERC-20 precompile dust/event behavior](https://github.com/paritytech/polkadot-sdk/issues/13201) describes a potentially serious upstream invariant failure. It was not reproduced here and must not be attributed to Portaldot without a controlled write test.
- A [Polkadot forum discussion on Revive precompiles](https://forum.polkadot.network/t/state-of-precompiles-in-revive-ecosystem/17778) shows active ecosystem interest in exposing native runtime functionality to Solidity and notes fragmented tooling. Forum discussion is context, not proof of Portaldot behavior.

### Additional originality re-check before implementation

Re-checked 2026-10-20 immediately before building FIRMA:

| Project | Documented capability | Verified scope in this audit | Remaining distinction |
|---|---|---|---|
| [Parity EVM Test Suite](https://github.com/paritytech/evm-test-suite) | Deno suite for Ethereum JSON-RPC behavior across PVM, EVM, and geth targets. | Public repository and documented configuration reviewed; it was not run against Portaldot. | Tests EVM/RPC compatibility, not pinned Portaldot native Assets/Revive versus EVM asset state or CI `UNKNOWN` semantics. |
| [Chopsticks](https://github.com/AcalaNetwork/chopsticks) | Forks Substrate state locally for dry-runs, replay, XCM tests, and EVM tracing. | Public documentation reviewed; no fork was created. | General test environment, not a live dual-surface conformance report. It could become a future FIRMA backend. |
| [Smart Bench](https://github.com/paritytech/smart-bench) | Benchmarks ink!/Wasm and Solidity/EVM contracts on Substrate targets. | Public README reviewed; benchmarks were not executed. | Performance/load benchmarking rather than native-vs-EVM asset invariant verification. |
| [Official ERC-20 precompile guide](https://docs.polkadot.com/smart-contracts/precompiles/erc20/) | Documents asset addresses and ERC-20 operations on Polkadot Hub. | Documentation reviewed. Its claims were not projected onto Portaldot; Portaldot was probed separately. | Documentation is prior art, but it does not provide Portaldot runtime fingerprinting, mapping evidence, same-block comparison, or CI verdicts. |
| [Frontier](https://github.com/polkadot-evm/frontier) | Ethereum compatibility and RPC infrastructure for Substrate. | Repository/README reviewed; no conclusion that Portaldot V3 uses Frontier was made. | Infrastructure rather than a Portaldot V3 conformance product; V3 evidence points to Revive interfaces. |

This expanded search still found no documented direct equivalent to FIRMA. That is a bounded public-search conclusion, not proof that private, unpublished, or unindexed work does not exist.

## Public-event context

The public [Portaldot Hacker House listing](https://www.hackathonradar.com/database/hackathon/portaldot-hacker-house-2026) describes V3 as supporting EVM and Wasm, emphasizes multi-chain/middleware/tooling, and uses the same 30/30/20/20 judging weights supplied in the task. This is a third-party event listing, not a network specification.

## Originality conclusion

Public Portaldot projects already cover the excluded categories thoroughly. The defensible gap is narrower: runtime-adaptive proof that one logical asset behaves consistently across Portaldot V3's native and EVM read surfaces, with machine-readable evidence suitable for CI and integration gates. None of the reviewed Portaldot or adjacent projects documents that exact product. This is not a claim that no unpublished competitor exists.

