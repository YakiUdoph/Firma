# Architecture

```mermaid
flowchart LR
    B[Public browser] --> F[Static frontend]
    F --> A[POST /api/verify]
    A --> V[Input validation + limits]
    U[CLI or local server] --> V
    V --> S[Substrate collector]
    S -->|finalized hash + height| C[Shared block context]
    C --> E[EVM read-only collector]
    S --> N[Native asset + Revive mapping evidence]
    E --> R[ERC-20 eth_call evidence]
    N --> P[Pure verdict engine]
    R --> P
    C --> P
    P --> J[JSON evidence + exit code]
    J --> U
    J --> A
    A --> F
```

## Trust boundaries

- The Substrate and EVM endpoints are independent external inputs. Agreement is measured; neither endpoint is assumed truthful merely because it responded.
- The finalized Substrate height defines the comparison context. EVM must serve that exact height or cross-surface checks become `UNKNOWN`.
- Runtime metadata and the `:code` storage hash are fetched at the pinned Substrate block. Support requires an exact reviewed profile: genesis hash, finalized runtime-code hash, runtime and metadata versions, EVM chain ID, required pallets, and required `Assets`/`Revive` query surfaces.
- The raw metadata SHA-256 is exported as block-specific evidence but is not used as an approval key. Portaldot V3 metadata contains a block-varying `Revive.EthBlockBuilderIR` fallback even when the runtime code is unchanged.
- Revive's `OriginalAccount` storage is the authority for the EVM-to-native account mapping. FIRMA does not hash, truncate, or guess an AccountId.
- JSON-RPC response data remains in the exported report so a result is inspectable rather than merely asserted.

## Read-only call surface

EVM: `eth_chainId`, `web3_clientVersion`, `eth_getBlockByNumber`, and `eth_call`.

Substrate: system identity, genesis hash, finalized head/header, runtime version, runtime metadata, the finalized `:code` storage hash, and storage queries for `Assets` and `Revive`. The implementation never accesses `api.tx`, `author_submitExtrinsic`, transaction broadcast APIs, signing APIs, or wallet extensions.

## Deployment shape

- `public/` is copied to `dist/` as immutable build output.
- `api/verify.mjs` is a stateless Node.js Vercel Function using the Web Request/Response API.
- The function owns no durable state and closes its outbound Substrate connection after each request.
- Application limits protect each warm instance. A platform firewall rule is required for a global public rate limit because function memory is not shared across instances.
- `server.mjs` remains the loopback-only local development adapter; it is not the production entrypoint.

