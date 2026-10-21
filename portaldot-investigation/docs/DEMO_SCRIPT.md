# Three-minute demo script

## 0:00–0:25 — The question

“FIRMA checks whether the same token information agrees across Portaldot’s native and Ethereum-compatible interfaces. It reads both sides at one finalized block and never asks for a wallet.”

Open the page. Point out the public repository link and the read-only label.

## 0:25–1:05 — Run the default check

Keep asset ID `2` and the documented default account. Select **Verify on Portaldot V3**.

While it runs: “FIRMA locks one chain moment, reads both interfaces, compares exact values, and explains the outcome.”

Show **Passed** and the nine technical `PASS` codes. Do not imply that FIRMA tests transfers, historical availability, or every account.

## 1:05–1:40 — Inspect and export proof

Open **View raw evidence**. Highlight the timestamp, finalized block, runtime, chain ID, native/EVM observations, named checks, and endpoint provenance.

Use **Copy JSON** or **Download JSON**. Explain that the exported report is the reproducible artifact, while the large label is the beginner-friendly summary.

## 1:40–2:10 — Explain uncertainty

Open the technical details near the four-step explanation.

“A proven agreement is PASS. A proven mismatch is FAIL. If an endpoint times out, history is missing, or a runtime is unsupported, FIRMA reports UNKNOWN—shown as Couldn't verify—instead of giving a false green result.”

## 2:10–2:35 — Show the metadata edge case

Use asset `806707` with account `0x81ed1dfbec067703fdca3daa7efcbeff4ba101ec` if live conditions and demo time permit. Explain that absent optional metadata is preserved as an explicit state, not silently converted into matching empty text.

If the network is slow, use the fresh check-in evidence and clearly identify it as a time-stamped prior observation.

## 2:35–3:00 — Close

“FIRMA does not move assets or deploy contracts. It answers one operational question: do Portaldot’s two token views agree right now, and can I inspect the proof?”

End on the result and repository link. Do not show or claim a contract address or transaction hash; neither exists in this read-only design.
