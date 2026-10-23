# FIRMA Phase 7D verification record

Checked on 2026-10-23 against FIRMA's configured Portaldot V3 endpoints:

- Substrate: `wss://test-node-v3.portaldot.dev`
- EVM: `https://test-evm-rpc-v3.portaldot.dev`

All network operations were read-only. No wallet, signing, transaction, or contract-deployment path was enabled.

## Fresh export/import round trip

A new FIRMA report was exported to JSON in memory and then independently checked by re-querying its exact finalized height.

| Observation | Result |
| --- | --- |
| Original asset verdict | `PASS` |
| Exact height | `158337` |
| Substrate block hash | `0x2bba3b916a771c95ed7706114ffba9ca5864991aa72dda3cd9fd704981ce589f` |
| EVM block hash | `0x7234f76d391d21abb45a8fe2a2b0c7cc4026acffdea2e6999666111d527b1f7b` |
| Genesis hash | `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd` |
| Runtime code hash | `0xedc03c9dc81d39fea5c02893cc34cf2ec898d55d7ee8f8e89eb27597a724c7c2` |
| Independent result | `VERIFIED` |
| Independent checks | 26 verified, 0 mismatch, 0 unavailable |
| Recomputed commitment | `0x59e0d618f72df0fbdaa179346fb8e54f150074e8a5e9f9992c96d4b89ea132a1` |
| Completed at | `2026-10-23T09:12:45.232Z` |

The two block hashes are expected to differ because they identify the native and Ethereum-compatible representations; FIRMA requires their block numbers to match and checks each saved hash against the corresponding interface.

## Historical RPC capability

- Previously exported block `121096` remained available from both RPC surfaces. Its native hash (`0xa84e7a52830c9c469c2e01f8c029ebe2ff5818d8ab9bda13412fc6d47601fab8`), EVM hash (`0x97e7794f0755fedbd3f7fd8f5f899f701485b3c2a8eaa4487a4f19c65fa6fd28`), runtime metadata, runtime code hash, native storage, and all five EVM calls were reproduced.
- Block `1` also remained available on both surfaces during the test. No archival-pruning boundary was observed between block 1 and the current finalized range.
- Deliberately unavailable height `999999999` returned no block on either surface. FIRMA retained the requested height, returned `HistoricalStateUnavailable` for Substrate, marked the EVM block unavailable, and did not substitute current state.

These observations establish current endpoint behavior, not a permanent archival-retention guarantee. A future provider timeout, pruned state, missing exact EVM block, or unavailable historical call is classified `UNAVAILABLE`, never `VERIFIED`.

## Automated verification

- Full suite: 67 tests discovered; 66 passed and one browser test initially failed because the site's CSP correctly blocked late inline axe injection.
- Browser harness corrected to inject axe before navigation.
- Corrected browser run: 1 passed, 0 failed; Chrome upload/result flow, keyboard focus order, and zero serious/critical axe violations.
- Final `npm run check`: 67 passed, 0 failed, 0 skipped; syntax checks also passed.
- Final `npm run build`: passed and regenerated the static production assets in `portaldot-investigation/dist`.

Screenshot: [phase-7d-check-report.png](./phase-7d-check-report.png)

## Compatibility and trust boundaries

- Imports are limited to 256 KiB of UTF-8 JSON and reject duplicate keys, prototype-related keys, excessive nesting, unsafe numeric values, malformed core fields, inconsistent block/input references, and incomplete runtime fingerprints.
- Reports exported before runtime fingerprints were added are rejected as incomplete rather than silently upgraded or presented as independently verified.
- Endpoint URLs embedded in a report are preserved as imported evidence but never used. The server's configured Portaldot V3 endpoints are the only query targets.
- Recomputing a Phase 7B commitment proves the deterministic hash of the imported report. It does not prove that the commitment was posted on-chain.
- Historical verification covers the report's supported read observations. It does not verify write behavior, events, permits, fees, or transaction execution.
