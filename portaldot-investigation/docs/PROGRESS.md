# Finalization progress

Created on 2026-10-31 as the concise current-state record. It does not replace the dated records under [`history/`](history/).

## Current product

All three final workflows are implemented locally: live same-block asset verification, independent historical report reproduction, and optional native report anchoring with independent proof checking. Technical verdict semantics remain unchanged.

## Transaction status

At `2026-10-31T14:45:09.159Z`, a bounded read-only verification returned 10 `VERIFIED`, 0 `MISMATCH`, and 0 `UNAVAILABLE` for transaction `0x3b2f4eac7f1e2b2cd87493ff9d60e5326584840d8572570c5f21c06ee1750702`. The transaction is extrinsic 1 in canonical block 263713, executed as `system.remarkWithEvent`, carries the expected payload, and was below finalized head 265219. The fresh artifact is `evidence/native-anchor-final-verification-2026-10-31-144509Z.json`.

## Finalization changes

- Added explicit navigation for Check an asset, Check a report, and Save proof.
- Moved experimental EVM proof input behind a labeled disclosure.
- Collapsed long check lists behind live-count disclosures while retaining JSON evidence.
- Removed three untracked one-off diagnostic scripts after confirming their observations were already preserved.
- Retained the registry experiment, native anchoring, historical evidence, and all supporting tests because they contain unique reproducibility or security value.
- Made the repository README the authoritative public entry point and reduced the application README to development/operation guidance.
- Added a judge-ready, executable walkthrough for all three workflows using the preserved report and native proof; the older public deployment is clearly separated from the complete local candidate.
- Adapted the accurate privacy provisions from PR #7 to the implemented stateless APIs and optional browser-only native/EVM wallet authorization without merging the branch wholesale.
- Organized dated records under `docs/history/` and original investigation material under `docs/research/` without deleting unique content.
- Retained the application in `portaldot-investigation/` because CI and the existing Vercel project use it as their configured root; migration requires an authorized infrastructure change.
- Removed an unreferenced 1.9 MB logo and restored three browser-generated screenshots to their committed historical versions.

## Release boundary

The local worktree is not a production release. No commit, push, preview, production deployment, infrastructure change, video publication, or hackathon submission is authorized or claimed.

## Remote integration preparation

On 2026-10-31, an isolated, uncommitted candidate was prepared from refreshed `origin/main` at `7fadf8d1c6bc660a72bcc4ba9f134ed19b33abcd`. The candidate preserves the five local branch commits and the complete cleanup/native-anchor working tree, retains the bounded diagnostics from remote main, and selectively incorporates PR #2's fail-closed unavailable-balance explanation and regression tests. PR #7 was not merged because its older read-only-only product description conflicts with the completed, separately authorized native anchoring workflow; its useful privacy provisions were rewritten in `docs/PRIVACY.md` to match the current browser-only wallet and native anchoring behavior. The original source worktree remains unchanged and recoverable.

## Validation

- `npm test`: 161 passed, 0 failed, including real Chrome and accessibility coverage.
- `npm run check`: syntax checks and 161 tests passed.
- `npm run build`: succeeded and generated `dist/`.
- `npm audit --omit=dev`: zero vulnerabilities reported.
- `npm ci --ignore-scripts`: succeeded. The development-only `solc@0.8.38 -> follow-redirects@1.16.1` advisory (`GHSA-mrwp-f3q8-3g9p`) was resolved with the permitted patch update to `follow-redirects@1.16.2`; post-fix full-tree and production-only audits both report zero vulnerabilities.
- Markdown links: 29 files and 79 local targets checked, with 0 missing.
- Local start check: `npm start` served all three workflow controls at `http://127.0.0.1:4173`.
- Responsive review: 1440, 768, and 375 pixel widths had matching document/client widths and no horizontal overflow.
- Secret/signing audit: no embedded credential or server-side signing path found; wallet writes remain browser-only and explicitly confirmed.
- Final `git diff --check` completed without whitespace errors; Git reported only expected LF-to-CRLF working-copy warnings on Windows.
