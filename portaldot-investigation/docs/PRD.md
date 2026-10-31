# Product requirements

Created on 2026-10-31 to document the final implemented product. This file did not govern earlier development; repository history and [`history/DEVELOPMENT_HISTORY.md`](history/DEVELOPMENT_HISTORY.md) remain the record of that work.

## Product

FIRMA is a Portaldot V3 interoperability verifier. It compares one native asset through the Substrate and EVM-compatible interfaces at the same finalized block, preserves exact evidence, reproduces supported historical reports, and optionally records a deterministic report commitment through the user's SubWallet.

## Users and problem

- Asset operators need to know whether native and EVM-facing observations agree.
- Reviewers need to reproduce a saved report rather than trust a screenshot or badge.
- A report owner may want a finalized, zero-value timestamped commitment without changing the report.

## Final workflows

1. **Check an asset:** compare network identity, runtime support, block context, mapping, supply, balance, and metadata. Output remains `PASS`, `FAIL`, or `UNKNOWN`.
2. **Check a report:** strictly validate an uploaded `firma.report.v1`, reproduce supported claims at its historical block, and output `VERIFIED`, `MISMATCH`, or `UNAVAILABLE` separately from the original verdict.
3. **Save or check proof:** for an independently verified PASS report, review and explicitly authorize one native `system.remarkWithEvent` transaction, or independently check an existing sidecar against canonical execution and finality evidence.

## Acceptance requirements

- Never infer success from missing or inconclusive evidence.
- `FAIL` and `MISMATCH` require demonstrated contradictions.
- Preserve exact integer values, raw observations, report immutability, and fail-closed runtime support.
- Keep signing browser-only, user-authorized, one-shot, and native-first.
- Keep technical evidence available through progressive disclosure and JSON export.
- Remain usable by keyboard, responsive, and compatible with reduced motion.

## Non-goals

FIRMA is not an explorer, custodial wallet, trading product, multi-chain dashboard, contract registry, asset issuer, or audit of all runtime behavior.

## Demonstrated state

The preserved report `evidence/final-live-2026-10-31-02.json` passed 9/9 checks at finalized block 263091. Its native commitment transaction `0x3b2f4eac7f1e2b2cd87493ff9d60e5326584840d8572570c5f21c06ee1750702` was independently verified at block 263713. See `evidence/native-anchor-final-verification-2026-10-31-144509Z.json`.

## Limitations

RPC responses are observable evidence, not cryptographic state proofs. Endpoint history and availability can be incomplete. A matching commitment proves inclusion of the exact report hash, not authorship or the truth of every report claim.
