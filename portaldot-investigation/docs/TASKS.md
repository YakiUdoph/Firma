# Finalization tasks

Created on 2026-10-31 for the current release review. Earlier work is preserved in [`history/HACKATHON_PROGRESS.md`](history/HACKATHON_PROGRESS.md) and repository history.

## Completed locally

- [x] Independently verify the existing native anchor transaction and preserve fresh evidence.
- [x] Confirm the bounded native connection fix and reviewed call-index check.
- [x] Audit documentation, experimental code, temporary files, dependencies, and evidence.
- [x] Remove confirmed disposable diagnostic scripts.
- [x] Simplify navigation around the three final workflows.
- [x] Hide experimental EVM proof input behind progressive disclosure.
- [x] Collapse long technical check lists while retaining complete evidence.
- [x] Preserve native wallet confirmation, one-shot submission, and duplicate prevention.
- [x] Add the requested governance documents without replacing canonical technical records.
- [x] Add an executable judge walkthrough for the complete local candidate and label the older public deployment accurately.
- [x] Adapt PR #7's useful privacy provisions to the implemented optional browser-only wallet authorization and native anchoring flow.
- [x] Reproduce PR #8's Linux RPC-test cancellation and keep the pending mock request alive until the real `AbortSignal.timeout()` abort, without changing production timeout behavior.
- [x] Reproduce the hosted export/import rejection, keep API request correlation out of `firma.report.v1`, and preserve strict rejection of unknown or tampered report fields.

## Validation completed in this review

- [x] Run the complete configured test, syntax, browser, accessibility, build, and dependency-audit checks after all edits.
- [x] Inspect the final local interface at desktop, tablet, and mobile widths with no horizontal overflow.
- [x] Complete the final secret and release-configuration review.
- [x] Run the final `git diff --check` after documentation status updates.
- [x] Capture a timestamped pre-cleanup Git/file/worktree inventory.
- [x] Hash the primary tree and audit exact and near duplicates.
- [x] Audit every dependency, current workflow, Vercel configuration, and significant experimental component.
- [x] Consolidate current public/developer README responsibilities and organize historical/research documentation.
- [x] Remove the unreferenced generated logo and exclude regenerated historical screenshots from the release diff.
- [x] Audit all local/remote branches without deleting or rewriting history.
- [x] Complete post-cleanup full regression validation and final inventory.
- [x] Repeat the repaired RPC failure test 25 times on Linux Node 22, then pass the complete tests, syntax checks, browser/accessibility coverage, build, and full-tree and production-only audits in an isolated Ubuntu Node 22 environment.
- [x] Round-trip an exact exported verification response through Check a Report, revalidate the preserved authentic report, and pass all 163 tests plus syntax, build, and both dependency audits.

## Owner-authorized work still required

- [ ] Review and approve the local export/import compatibility fix.
- [ ] Push the approved fix to the existing PR #8 release branch.
- [ ] Test the exact preview, including production routes, CSP, and wallet compatibility.
- [ ] Approve production promotion only after preview acceptance.
- [ ] Publish or update the demo video and pitch deck.
- [ ] Submit to the competition and confirm acceptance.
