# Product design

Created on 2026-10-31 to describe the final interface. It records current decisions and does not claim to have guided earlier development.

## Experience goal

A first-time reviewer should understand within 30 seconds that FIRMA compares one Portaldot asset across two interfaces at one finalized block and exposes evidence instead of asking for trust.

## Information architecture

The primary navigation exposes three tasks:

1. **Check an asset**
2. **Check a report**
3. **Save proof**

Each workflow presents its main outcome first. Network details, individual checks, raw JSON, experimental EVM anchoring, and other protocol detail remain behind labeled disclosures.

## Result language

Asset verification uses **Passed**, **Failed**, and **Couldn't verify** while preserving `PASS`, `FAIL`, and `UNKNOWN` in technical evidence. Historical and anchoring verification uses **Verified**, **Mismatch**, and **Unavailable** while preserving the technical statuses.

Counts always come from the current response. Historical examples must be labeled and never presented as live metrics.

## Visual system

- Warm paper background, dark ink, emerald success, red contradiction, and amber uncertainty.
- Editorial serif display type with compact sans-serif controls and monospace evidence.
- One dominant action per workflow; secondary evidence actions remain visually quieter.
- Minimal motion, disabled under reduced-motion preferences.
- Responsive layouts at 980, 700, and 470 pixel breakpoints.

## Accessibility

Use native forms and details elements, visible focus, live regions for loading/results, alert regions for errors, descriptive labels, keyboard-operable controls, and no color-only status communication.

## Wallet safety

The native confirmation must show chain, genesis, account, call, commitment, payload, zero value, and maximum fee before enabling the wallet request. Simplification must never remove this confirmation.
