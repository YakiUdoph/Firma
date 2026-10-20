# Reproducible read-only commands

## FIRMA pinned verifier (implemented 2026-10-20)

```powershell
Set-Location 'C:\Users\PC\Desktop\PROJECTS\Firma\Firma-1\portaldot-investigation'
npm ci --ignore-scripts
npm run check
node bin/firma.mjs --output evidence\live-asset-2-final.json
node bin/firma.mjs --asset 806707 --account 0x81ed1dfbec067703fdca3daa7efcbeff4ba101ec --output evidence\live-asset-806707.json
```

Actual completed outcomes:

- asset `2`: `PASS`, pinned finalized block `120873`;
- asset `806707`: `PASS`, pinned finalized block `120878`, with absent metadata consistently reported on both surfaces;
- test suite: 14 tests passed, 0 failed at the implementation checkpoint.

Exact JSON-RPC requests, responses, timestamps, runtime metadata hash, storage keys, and decoded values are in `evidence/*.json`. Exit codes are `0` PASS, `1` FAIL, and `2` UNKNOWN.

All commands below are read-only with respect to Portaldot. They write only local evidence files. Run from PowerShell in the repository root.

## Prerequisites

```powershell
Set-Location 'C:\Users\PC\Desktop\PROJECTS\Firma\Firma-1\portaldot-investigation'
npm ci --ignore-scripts
```

Node `v24.18.0` was used. The lockfile pins the Polkadot libraries used to decode metadata.

## EVM baseline

Single chain-ID request using a file avoids Windows PowerShell/curl quote loss:

```powershell
curl.exe --silent --show-error --max-time 20 `
  -H 'Content-Type: application/json' `
  --data-binary '@requests\eth_chainId.json' `
  'https://test-evm-rpc-v3.portaldot.dev'
```

Actual response on 2026-10-20:

```json
{"jsonrpc":"2.0","id":1,"result":"0x190f1ca9"}
```

Run and save the full read-only batch:

```powershell
npm run probe:evm
```

This invokes `eth_chainId`, `web3_clientVersion`, `net_version`, latest-block reads, sync status, gas price, fee history, a zero-address balance/code read, an empty `eth_call`, and `rpc_modules`. Exact input and output are saved to `raw/evm-probe.json`.

## Substrate identity, methods, and metadata

```powershell
npm run probe:substrate
npm run decode:metadata
```

The first command sends these exact WebSocket JSON-RPC methods with empty params:

```text
system_chain
system_name
system_version
system_properties
state_getRuntimeVersion
chain_getHeader
chain_getFinalizedHead
rpc_methods
state_getMetadata
```

It saves the raw metadata and a response summary under `raw/`. The second command decodes metadata locally; it makes no network request.

## Metadata-driven state reads

```powershell
npm run probe:state
```

This reads runtime constants, call metadata, existing asset definitions/accounts/metadata, asset-conversion pools, precompile mappings, permit nonces, and Revive account mappings. It does not compose or submit an extrinsic.

## EVM/native asset comparison

```powershell
npm run probe:assets
```

This performs only `eth_call` against derived candidate asset precompiles. It reads ERC-20 name, symbol, decimals, supply, balance, allowance, nonce, and domain separator. Results are saved to `raw/evm-asset-probe.json`.

## Initial errors, preserved for reproducibility

The first sandboxed curl attempt returned:

```text
curl: (7) Failed to connect to test-evm-rpc-v3.portaldot.dev:443 ... Could not connect to server
```

After network permission was granted, this PowerShell pattern reached the server but produced malformed JSON at the native-process boundary:

```powershell
$body='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
curl.exe -H 'Content-Type: application/json' --data-raw $body `
  'https://test-evm-rpc-v3.portaldot.dev'
```

Actual server response:

```json
{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}
```

Using `--data-binary @file` or the Node scripts fixes the quoting issue.

## Safety boundary

Do not add `eth_sendRawTransaction`, `author_submitExtrinsic`, signing seeds, or mutating ERC-20 calls to these probes. The write-path verification proposed in the reports requires a separately authorized and funded test procedure.

