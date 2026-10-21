# October 24 check-in

## One-sentence product description

FIRMA gives operators and auditors a reproducible, read-only proof that a Portaldot native asset and its EVM-facing representation agree at one observed chain state.

## Consequential problem

Native-to-EVM asset integrations can display plausible values while reading different identifiers, metadata, balances, or supply. Generic explorers show individual facts, but they do not produce one bounded verdict with the underlying evidence and explicit UNKNOWN behavior.

## Working prototype

- Browser interface for asset and account verification.
- CLI with stable PASS, FAIL, and UNKNOWN exit semantics.
- Live Substrate metadata and storage reads.
- Live EVM JSON-RPC reads for chain identity, the pinned block, ERC-20 metadata, balances, and supply.
- Evidence export with timestamps, block context, endpoint identity, raw observations, and nine check results.
- Runtime compatibility gate that prevents unsupported metadata from producing confident parity claims.

## Proof available now

- Asset 2 fixture: PASS, block 121096, runtime `portaldot-v3/3002`, chain ID 420420777.
- Asset 806707 absent-metadata fixture: PASS, block 121099, same runtime and chain.
- Unreachable local endpoints: UNKNOWN for all checks and process exit code 2.
- 22 automated tests and a clean production dependency audit.

These are time-stamped observations, not guarantees about future network state.

## Why Portaldot V3 is necessary

The demonstration depends on Portaldot V3 exposing both Substrate native-asset storage and an EVM representation whose read results can be compared. Without both surfaces, FIRMA would be a generic single-runtime checker and its core parity verdict would not exist.

## Differentiation

FIRMA is not an explorer, wallet assistant, transaction debugger, deployment dashboard, token checker, workflow builder, monitoring dashboard, or escrow product. Its unit of value is an evidence-backed cross-runtime invariant verdict. The competitor audit found adjacent developer kits, assistants, modelers, and deployment tools, but no verified reviewed project with the same bounded native/EVM parity-evidence workflow. That does not imply private or unpublished competitors do not exist.

## Contract and transaction status

Not applicable by design. FIRMA is a read-only verification product. It has not deployed a contract, submitted a transaction, requested funds, or used a private key.

## Check-in status

The local prototype, evidence, tests, architecture, security notes, and demo script are ready. A public live URL is still outstanding and requires explicit approval to push the reviewed commits and create a protected Vercel preview. Public promotion additionally requires deployed smoke tests and a reviewed platform firewall rule.
