# FIRMA repository guidance

## Paths

- Git repository root: the directory containing this file.
- FIRMA application directory: `portaldot-investigation/`.
- Run application commands from `portaldot-investigation/`, not from the repository root.

## Mission and non-negotiable boundaries

FIRMA is a read-only Portaldot V3 interoperability verifier with an optional, separately authorized testnet evidence-anchoring workflow. It checks whether one native asset has the same observable state through the Substrate and EVM interfaces at the same finalized block and emits inspectable evidence. Anchoring must never change the original report or its verification result.

- Wallet connection and signing are permitted only for the optional Portaldot V3 testnet anchoring workflow, only in the user's wallet, and only after the UI shows the exact chain, account, destination, commitment, value, and maximum fee and the user explicitly confirms the wallet request.
- Never request, receive, store, print, or log a recovery phrase, private key, seed, or signed raw transaction. Never implement server-side custody or signing.
- Never submit a transaction automatically, retry a transaction automatically, transfer assets, approve spending, or perform an unrelated on-chain write. Preparing or estimating a transaction is not authorization to submit it.
- Contract deployment requires separate explicit authorization for the exact bytecode, wallet, estimated maximum cost, and target network. Do not deploy a contract when a contractless anchoring transaction satisfies the requirement.
- Never fabricate evidence, results, tests, metrics, RPC responses, block data, or product claims.
- Preserve the technical `PASS`, `FAIL`, and `UNKNOWN` semantics throughout the CLI, API, evidence, tests, and frontend.
- Missing, unavailable, unsupported, ambiguous, or otherwise inconclusive evidence must remain `UNKNOWN`; it must never become `PASS`.
- `FAIL` requires a demonstrated contradiction. An unavailable endpoint, timeout, undecodable response, unsupported runtime, or missing historical state is not a contradiction.
- Keep the runtime-support gate fail-closed. Do not weaken identity or compatibility checks to produce a successful result.
- Preserve the beginner-friendly frontend terms **Passed**, **Failed**, and **Couldn't verify** while retaining the technical statuses in evidence and technical detail.
- Do not commit, push, merge, deploy, publish, or change remote infrastructure without explicit authorization.

## Validation

From `portaldot-investigation/`, use the commands already defined by `package.json`:

```powershell
npm test
npm run check
npm run build
```

`npm run verify` performs a live, read-only verification against configured RPC endpoints. Run it only when live network validation is appropriate; report the observed response truthfully and do not present historical or fixture output as a fresh result.

Do not claim a check passed unless it was actually run and its output supports that claim. Keep generated evidence filenames unique because the CLI deliberately refuses to overwrite an existing evidence file.

## Canonical documentation

- Product scope and operating instructions: `portaldot-investigation/README.md`
- Final product requirements: `portaldot-investigation/docs/PRD.md`
- User-facing design decisions: `portaldot-investigation/docs/DESIGN.md`
- Architecture and trust boundaries: `portaldot-investigation/docs/ARCHITECTURE.md`
- Engineering and evidence rules: `portaldot-investigation/docs/RULES.md`
- Privacy and data handling: `portaldot-investigation/docs/PRIVACY.md`
- Security controls and limitations: `portaldot-investigation/docs/SECURITY.md`
- Deployment procedure and publication gate: `portaldot-investigation/docs/DEPLOYMENT.md`
- Current finalization tasks: `portaldot-investigation/docs/TASKS.md`
- Concise current progress: `portaldot-investigation/docs/PROGRESS.md`
- Repository cleanup inventory and result: `portaldot-investigation/docs/REPOSITORY_AUDIT.md`
- Dated progress history: `portaldot-investigation/docs/history/HACKATHON_PROGRESS.md`
- Prototype check-in evidence: `portaldot-investigation/docs/history/OCTOBER_24_CHECKIN.md`
- Production-readiness status: `portaldot-investigation/docs/PRODUCTION_READINESS.md`
- Original investigation research: `portaldot-investigation/docs/research/`

Update the canonical document above that owns a topic instead of creating additional parallel records. `PROGRESS.md` is the concise current state; `docs/history/HACKATHON_PROGRESS.md` remains the dated historical log. Preserve factual distinctions among verified facts, inferences, unknowns, historical evidence, fixtures, and fresh live observations.
