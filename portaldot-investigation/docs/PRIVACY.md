# Privacy and data handling

Effective 2026-10-31 for the current FIRMA release candidate. This notice describes the implemented application, not a promise about an older deployment or a future hosting configuration.

## Project contact

FIRMA is an open-source hackathon project. Privacy questions may be sent to `justremotegigs@gmail.com`.

## What FIRMA processes

FIRMA has no user accounts or application database. It does not intentionally use analytics, advertising trackers, cookies, `localStorage`, or `sessionStorage`.

The browser sends only the information needed for the action a user chooses:

- **Check an asset:** the public asset ID and public EVM account are sent to `/api/verify`.
- **Check a report:** the complete selected report text and an optional public commitment are sent to `/api/check-report` only after the user selects **Check evidence**.
- **Prepare a proof:** the complete report text and selected public wallet account are sent to `/api/onchain-proof` so the server can validate the report and prepare a deterministic, zero-value transaction.
- **Check a proof:** the complete report text plus the selected public sidecar or public transaction hash are sent to `/api/onchain-proof` only after the user selects **Check saved proof**.

The server uses fixed, operator-controlled Portaldot RPC endpoints for these checks. Those endpoint operators can observe normal network-request information and the public chain queries made by FIRMA.

## Optional browser wallet authorization

The verification and existing-proof checks above do not connect a wallet. A wallet is involved only when a user deliberately chooses to create a new proof.

For the preferred native route, the browser asks the installed SubWallet extension for public accounts. The user selects an account, and FIRMA checks the Portaldot V3 testnet runtime, usable balance, exact `system.remarkWithEvent` call, deterministic payload, zero transferred value, and account-specific maximum fee. Only after those fields are displayed and the user explicitly confirms does the browser ask SubWallet to sign and submit the transaction.

The optional EVM compatibility route similarly uses an injected browser wallet for a zero-value transaction and applies its documented chain and fee checks. It is secondary to the native route.

Wallet signing and submission remain between the browser, the injected wallet, and the Portaldot network. FIRMA's server does not receive a recovery phrase, private key, seed, wallet password, or signed raw transaction. FIRMA cannot submit, replace, or retry a transaction automatically. The wallet extension and its RPC provider may process the selected public account, network requests, transaction details, fee estimates, and approval outcome under their own privacy practices.

The resulting proof sidecar is separate from the original report. Anchoring does not alter the report or its verdict. The blockchain stores the versioned commitment payload, transaction signer, and normal public execution data; it does not store the complete FIRMA report.

## Browser memory, exports, and clipboard

Selected files and current results are held in page memory for the active browser session. FIRMA writes a report, proof sidecar, or verification result to the user's device only when the user chooses an export action. It writes JSON to the clipboard only when the user selects the copy control. Closing or reloading the page clears the application's in-memory state, subject to ordinary browser behavior.

## Rate limiting and diagnostics

The local and production HTTP adapters derive a bounded client key from request metadata for a five-request-per-minute, in-memory limiter. That limiter is instance-local and is not an identity system. Diagnostic records are bounded and are used to describe RPC operations and failures; the application does not intentionally log complete uploaded reports, wallet secrets, or raw signed transactions.

## Retention and third parties

FIRMA itself defines no persistent application database or retention schedule. Hosting platforms, RPC providers, wallet extensions, browsers, and network intermediaries may keep access, security, or operational logs under their own policies. This project cannot promise that those third parties retain nothing.

Public blockchain transactions are intentionally permanent and independently visible. Anyone can inspect the public signer, call, payload, fee-related chain data, block, and transaction hash after submission.

## User responsibility and limits

Do not upload or enter recovery phrases, private keys, seed phrases, wallet passwords, credentials, personal documents, or other secrets. FIRMA does not need them.

FIRMA is a narrowly scoped testnet evidence tool. This notice does not claim regulatory compliance, legal advice, zero retention by third parties, or anonymity. Read [SECURITY.md](SECURITY.md) for technical controls and limitations and [ARCHITECTURE.md](ARCHITECTURE.md) for the trust boundaries.
