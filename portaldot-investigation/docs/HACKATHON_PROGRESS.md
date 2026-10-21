# Hacker House progress

## 2026-10-20 — investigation and read-only MVP

- Verified both organizer-provided endpoints and EVM chain ID `420420777`.
- Decoded runtime metadata and identified Assets, Revive, asset-precompile, permit, and native-call interfaces.
- Confirmed five native/EVM balance pairs with the exploratory probes.
- Audited named Hacker House projects and broader adjacent tooling.
- Chose the narrow interop-assurance opportunity; rejected generic explorer, assistant, dashboard, deployer, and workflow directions.
- Implemented a pinned-block verifier, JSON evidence format, CLI exit codes, local evidence viewer, bounded networking, and fixture-only test suite.
- Produced successful live evidence for an asset with metadata and an asset without metadata.

## 2026-10-20 — production-readiness pass

- Added a stateless production API entrypoint and Vercel configuration.
- Added a reproducible static production build.
- Removed machine-specific stack traces from exported evidence and regenerated live reports.
- Bounded every Substrate query and disconnect path.
- Suppressed parity conclusions outside the verified runtime envelope.
- Added bounded request maps, body limits, concurrency caps, and server timeouts.
- Expanded the suite from 14 to 22 passing tests, including production-handler, invalid-payload, and limiter behavior.
- Confirmed unreachable endpoints become `UNKNOWN` with exit code `2`.
- Re-ran both live asset checks successfully at finalized blocks `121096` and `121099`.

## 2026-10-21 â€” final validation

- Re-ran the clean install, 22-test check suite, production build, and production dependency audit successfully.
- Re-ran asset 2 with nine PASS checks at finalized block `129347` and asset 806707 with nine PASS checks at block `129350`.
- Confirmed unreachable endpoints produce nine UNKNOWN checks and CLI exit code `2`.
- Started the loopback web server, rendered the landing page in headless Chrome, and received a nine-check PASS response from the local API at block `129376`.
- Confirmed invalid non-object JSON returns HTTP 400 and a path-traversal probe returns HTTP 404.

## Before October 24 check-in

- Record a short demo of the CLI and browser report using a fresh evidence filename.
- Ask organizers to confirm whether the inline asset-precompile address convention is intended as stable V3 API.
- Publish the repository only when the team chooses; no push or deployment was performed here.

## Before November 6

- Add runtime-fingerprint allowlist configuration and report diffing across runtime upgrades.
- Add a compact Markdown/JUnit renderer.
- Expand account samples without scanning unbounded storage.
- Consider controlled write/event conformance only after separate authorization, test funding, and a safety plan.

