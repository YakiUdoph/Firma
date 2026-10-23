# Portaldot V3 deployment gate

This package is experimental and is not imported by FIRMA's server, verifier, API, or browser application.

## Preconditions

Deployment remains prohibited until every item is recorded in an approval ticket:

1. A newly created disposable wallet is funded with testnet tPOT through a verified Portaldot V3 route.
2. The wallet shows chain ID `420420777` and the RPC is `https://test-evm-rpc-v3.portaldot.dev`.
3. `npm ci`, `npm run proof:build`, `npm run proof:test`, `npm test`, and `npm run build` pass.
4. Two clean builds produce byte-identical creation and deployed bytecode hashes.
5. `npm run proof:estimate -- <public-wallet-address>` succeeds against the funded address.
6. A human establishes a tPOT spending ceiling from the estimate plus an explicit safety margin and records it.
7. The exact creation bytecode, compiler settings, expected runtime hash, wallet address, and ceiling receive explicit deployment approval.

## Key boundary

FIRMA must never ask for, receive, store, or log a private key or recovery phrase. Create and retain the disposable account entirely inside a reputable browser or hardware wallet. Do not paste secrets into source files, environment variables, shell commands, deployment services, or support messages.

## Approved execution shape

After the gate is satisfied, use a browser-wallet or hardware-wallet deployment tool that:

- sends the exact `bytecode` from `artifacts/FirmaEvidenceRegistry.json` with no constructor arguments and zero value;
- confirms chain ID `420420777` immediately before signing;
- shows the destination as contract creation, the gas limit, maximum fee, and zero transferred value;
- refuses to sign when the estimated maximum exceeds the approved ceiling;
- returns the real transaction hash and receipt without logging signed raw transaction bytes.

After finality, run `npm run proof:verify-code -- <contract-address>`. Record the transaction, receipt, EVM block hash, corresponding finalized Substrate block hash, contract address, code-verification result, gas used, effective gas price, and any storage deposit. A failed bytecode comparison blocks all commitment transactions.

## Recovery

- Wallet rejection: stop; nothing is retried automatically.
- Estimate failure or insufficient funds: stop before signing.
- Pending transaction: track the original hash; do not submit a replacement without separate approval.
- Revert: retain the receipt and diagnose before any retry.
- Runtime fingerprint change: rerun the compatibility audit.
- Duplicate commitment: query `get(bytes32)` and use the existing record; do not pay twice.
