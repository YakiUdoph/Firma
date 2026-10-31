# Engineering and evidence rules

Created on 2026-10-31 as a concise index of final rules. `../AGENTS.md`, `SECURITY.md`, and `ARCHITECTURE.md` remain authoritative for operational and trust-boundary detail.

## Verdict integrity

- Missing, unsupported, timed-out, undecodable, or ambiguous evidence is `UNKNOWN` or `UNAVAILABLE`.
- `FAIL` or `MISMATCH` requires an observed contradiction.
- Never substitute current state for unavailable historical state.
- Never weaken the reviewed runtime identity gate.
- Never modify an original report or its verdict during reproduction or anchoring.

## Network and evidence

- Pin native and EVM reads to the same finalized block.
- Preserve raw RPC observations and exact base-unit integers.
- Treat imported endpoint URLs and sidecar finality fields as claims, not configuration or proof.
- Keep evidence filenames unique and do not overwrite historical artifacts.

## Wallet and transaction safety

- Verification is read-only by default.
- Signing is browser-only, native-first, and requires exact user review plus explicit confirmation.
- Never request, store, print, or log a private key, seed, recovery phrase, or signed raw transaction.
- Never automatically sign, submit, retry, replace, or broaden a transaction.
- Never deploy a contract when a contractless native remark satisfies the requirement.

## Release integrity

- Do not claim a command, browser flow, preview, deployment, or competition requirement passed unless observed.
- Do not commit, push, deploy, publish, promote, or alter infrastructure without explicit authorization.
- Fixtures are tests, not live-chain evidence.
- Preserve genuine evidence and clearly distinguish historical observations from fresh ones.
