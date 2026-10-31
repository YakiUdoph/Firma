# Portaldot V3 capability map

## Confirmed working

### Native assets are exposed to EVM reads

This is the strongest result of the investigation. Portaldot V3 exposes native `pallet-assets` assets as ERC-20-compatible precompiles using this confirmed address layout for the observed `Assets` instance:

```text
address = u32 asset_id (big endian)
        || 12 zero bytes
        || 0x0001
        || 2 zero bytes
```

Examples:

| Native asset | ERC-20 precompile | Confirmed reads |
|---:|---|---|
| `1` | `0x0000000100000000000000000000000000010000` | name `example asset for testnet`, symbol `TST`, decimals `18`, supply `0` |
| `2` | `0x0000000200000000000000000000000000010000` | name `test asset`, symbol `TEST`, decimals `18`, supply `15000000000000000000` |
| `806707` | `0x000c4f3300000000000000000000000000010000` | supply `1000000007`; metadata calls revert because native metadata is absent |

Five `balanceOf` calls were compared with the corresponding native `Assets.Account` entries after resolving each H160 through `Revive.OriginalAccount`. All five values matched exactly:

| Asset | H160 holder | Native value | EVM `balanceOf` |
|---:|---|---:|---:|
| 2 | `0x578f0a6155551b3b7c7ff255ea7dc2b08968e380` | `15000000000000000000` | `15000000000000000000` |
| 806707 | `0x6e285606e63c3359b58e6d106e92d92cd8f7a23a` | `7` | `7` |
| 806707 | `0x553d36d0af8dec5704849a87f8a79689511199f1` | `2` | `2` |
| 806707 | `0x81ed1dfbec067703fdca3daa7efcbeff4ba101ec` | `999997495` | `999997495` |
| 806707 | `0x162c454a039b4c5c7c1d16868fa1a8d68568957b` | `2503` | `2503` |

This demonstrates one shared asset state exposed through two interfaces; it is not evidence of a bridge or wrapped-token copy.

### ERC-20 permit read surface exists

On asset `2`, read-only `nonces(address)`, `DOMAIN_SEPARATOR()`, and `allowance(address,address)` calls all returned ABI-valid results. The observed nonce and allowance were zero; a non-zero domain separator was returned. Live metadata also contains `AssetsPrecompilesPermit.Nonces` and chain ID `420420777`.

This confirms the read surface. It does **not** prove that a submitted EIP-2612 permit succeeds.

### Account interoperability exists

`Revive.OriginalAccount` maps H160 addresses to native AccountId values. The live state contained 864 mappings. `Revive.autoMap` was true. Metadata documents:

- `map_account` (a no-op when auto-map is enabled),
- `unmap_account`,
- `batch_map_accounts`, and
- `dispatch_as_fallback_account` for AccountId32 fallback accounts.

This confirms a concrete address-translation layer, not just two unrelated RPC endpoints.

### EVM transactions can target native runtime calls in principle

Live metadata exposes `Revive.eth_substrate_call`. Its own runtime docs say it executes a Substrate runtime call from an Ethereum transaction with a signed origin, and is intended only for the EVM compatibility layer. `MetaTx.dispatch` and `VerifySignature` are also present.

This is confirmed as an available runtime interface, but execution is untested.

### Two contract paths exist

- `Contracts` exposes Wasm contract upload, instantiate, call, code replacement, and migration calls.
- `Revive` exposes EVM-compatible/PVM calls, code upload/instantiate, raw Ethereum transaction handling, and Ethereum block/receipt storage.
- `Revive.allowEVMBytecode` is true.

This differs materially from older Portaldot Season 1 descriptions of a rent-era-only Contracts runtime.

## Confirmed limitations

- `rpc_modules` is unavailable on the EVM endpoint.
- `Revive.debugEnabled` is false; do not design around debug tracing being available.
- No `AssetConversion` pool existed at the observed block, so a real swap path was not available to verify.
- Asset `806707` had supply and holders but no asset metadata; ERC-20 `name`, `symbol`, and `decimals` reverted with `Metadata not found`.
- Candidate prefix-`0x0002` precompile calls returned zero/metadata-not-found responses. They do not establish a useful second asset surface on this live state. The `AssetsPrecompiles` mapping storage exists, but how it is wired into this exact runtime needs source confirmation or a funded controlled test.
- The JS API did not understand the custom signed extensions `AuthorizeCall` and `EthSetOrigin`. Any signer must add exact extension definitions before being trusted.

## Requires authentication, funds, or state changes

These features were not tested because doing so would violate the read-only scope:

- ERC-20 `transfer`, `approve`, `transferFrom`, and `permit`.
- Native asset create/mint/transfer/approval operations.
- `Revive.eth_substrate_call` through a signed Ethereum transaction.
- `MetaTx.dispatch` replay, sponsor, and fee behavior.
- Contract upload, deployment, or calls that mutate state.
- Creating an `AssetConversion` pool or performing a swap.

## Unsupported assumptions

- Pallet presence is not proof that every call is enabled for ordinary users.
- An upstream Polkadot SDK bug or issue is not automatically a Portaldot bug.
- The V3 runtime should not be assumed compatible with old Portaldot nodes or Season 1 contract artifacts.
- A successful ERC-20 read does not prove event parity, allowance semantics, dust behavior, or permit replay protection under writes.
- No public or private-project completeness claim is made; the competitor audit covers only discoverable public material.

## Safe next verification gate

Before building a product around write interoperability, obtain an organizer-funded test account and explicit permission, then run one controlled asset through this matrix:

1. Create/mint natively.
2. Confirm metadata/supply/balance over EVM.
3. Transfer over EVM and confirm native balance plus both event representations.
4. Approve/permit over EVM and confirm native approval storage and nonce consumption.
5. Call one allowlisted native action through an Ethereum-signed transaction and verify origin, fee, replay, and failure behavior.

That gate is not part of this investigation and was not performed.

