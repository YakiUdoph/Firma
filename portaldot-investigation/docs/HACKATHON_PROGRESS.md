# Hacker House progress

## 2026-10-20 — investigation and read-only MVP

- Verified both organizer-provided endpoints and EVM chain ID `420420777`.
- Decoded runtime metadata and identified Assets, Revive, asset-precompile, permit, and native-call interfaces.
- Confirmed five native/EVM balance pairs with the exploratory probes.
- Audited named Hacker House projects and broader adjacent tooling.
- Chose the narrow interop-assurance opportunity; rejected generic explorer, assistant, dashboard, deployer, and workflow directions.
- Implemented a pinned-block verifier, JSON evidence format, CLI exit codes, local evidence viewer, bounded networking, and fixture-only test suite.
- Produced successful live evidence for an asset with metadata and an asset without metadata.

## Before October 24 check-in

- Record a short demo of the CLI and browser report using a fresh evidence filename.
- Ask organizers to confirm whether the inline asset-precompile address convention is intended as stable V3 API.
- Publish the repository only when the team chooses; no push or deployment was performed here.

## Before November 6

- Add runtime-fingerprint allowlist configuration and report diffing across runtime upgrades.
- Add GitHub Action artifact retention and a compact Markdown/JUnit renderer.
- Expand account samples without scanning unbounded storage.
- Consider controlled write/event conformance only after separate authorization, test funding, and a safety plan.

