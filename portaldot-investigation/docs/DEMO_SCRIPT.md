# Three-minute demo script

## 0:00–0:25 — The problem

“Portaldot exposes a native Substrate asset and an EVM-facing representation. A value can look correct on either side while the two surfaces disagree. FIRMA turns that ambiguity into a reproducible PASS, FAIL, or UNKNOWN verdict without asking for a wallet.”

Show the landing page and point out that all operations are read-only.

## 0:25–1:05 — Verify the default asset

Use asset ID 2 and the prefilled holder/address values. Start verification.

While it runs, explain that the service checks endpoint identity, runtime compatibility, native storage, the pinned EVM block and ERC-20 reads, then compares metadata, holder balance, and total supply.

Show the nine PASS checks. Do not imply the check covers transfers, historical state, or every possible account.

## 1:05–1:40 — Inspect the evidence

Open the evidence view. Highlight:

- timestamps and observed block;
- runtime and chain ID;
- native and EVM raw observations;
- named check results;
- explicit assumptions and endpoint provenance.

Explain that a future or unsupported runtime produces UNKNOWN instead of a false green result.

## 1:40–2:15 — Show the edge case

Load the asset 806707 evidence record. Explain that absent optional metadata is handled as a defined state rather than converted into an empty-string coincidence.

Point to the captured absent-value observations and the corresponding parity checks.

## 2:15–2:40 — Reproducibility

Show the CLI command and exit contract:

- 0: every check passed;
- 1: a proven mismatch failed;
- 2: the verifier could not reach a defensible conclusion.

Mention the 22 tests, sanitized evidence, bounded requests, and clean dependency audit.

## 2:40–3:00 — Close

“FIRMA does not move assets. It gives integrators, operators, and reviewers a compact answer to a narrower but consequential question: do these two Portaldot V3 asset surfaces agree right now, and can I inspect the proof?”

End on the result summary. If the live network is unavailable, use the committed evidence and say clearly that it is a prior time-stamped observation.
