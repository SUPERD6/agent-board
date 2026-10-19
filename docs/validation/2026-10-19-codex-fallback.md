# Codex trust fallback implementation checkpoint

Base c5ee776. Only synthetic absolute mock control scripts were run; no real Codex/model/settings/trust mutations.

The native worker now probes exact three-event ownership/trust before acquiring the canonical lock, rechecks source bytes after installation, and retains/restores a managed instruction section until approved. A read-only status projects current approval without AGENTS writes. Existing nonempty override is effective; empty override is left alone. Marker edits preserve outside bytes and refuse malformed/multiple sections. Generated reporting commands use only a positively owned board. Existing reporter/board failures prevent fallback retirement even if definitions were approved.

The existing trust setter remains six-definition-only and was not called. PATH discovery accepts only absolute executable candidates; unsupported Windows shims remain unknown. Each read-only control request is bounded to one second in the worker, with no CODEX_HOME changes.

First focused batch:

ℹ tests 48
ℹ pass 47
ℹ fail 1
ℹ skipped 0
ℹ duration_ms 28930.6916

Its sole failure was the old status migration assertion comparing projected current readiness to stored metadata. The original exact migration assertion now checks the canonical record, with additional assertions for projected unknown approval.

Second focused batch:

ℹ tests 48
ℹ pass 45
ℹ fail 3
ℹ skipped 0
ℹ duration_ms 41844.5062

All three failures were a new fixture ReferenceError: a changed-definition scenario was placed before its config constant. The scenario was moved after positive approval. The slice 10 batch below verifies that correction and the empty-override and owned-artifact retirement safeguards.

Slice 10 first focused batch (`issue-102-slice10-focused-first.log`): 52 tests, 51 passed, one failed, 56.914 seconds. The newly added adversarial fixture changed hooks while the instructions file was read. The original approval snapshot incorrectly retired the fallback. Rechecking the source fingerprint and positively owned board/reporter after reading each instruction file closes this observed window.

Slice 10 final focused batch (`issue-102-slice10-focused-final.log`): 52 tests, 52 passed, zero failed or skipped, 51.336 seconds. This runs all 17 inspector mocks plus fallback, legacy-transaction and bootstrap tests. Empty overrides remain empty; replacing an owned board or reporter retains existing fallback even after approval; changed hook definitions restore fallback in each language.

Strict standalone TypeScript, strict plugin validation, pinned Bun bundle generation/check and whitespace validation passed on the frozen final runtime. The prior pane assertion now expects managed Codex instructions to remain while approval is unknown.

The exact Claude Code 2.1.301 full plugin run (`issue-102-slice10-plugin.log`) finished with 483 passed and five failed, 488 total across nine files, 317.92 seconds. One existing inbox-read fixture timed out at 5016.53 ms against its unchanged 5000 ms limit; its cause remains unproven. Four pane notification assertions expected the old summary-only/silent Codex setup behavior. They are narrowly updated to require exactly one notification containing the original summary and the new unknown-trust notice, or the exact new notice when hook bytes stay unchanged. These four assertion changes still need a fresh plugin run; no runtime change or timeout increase follows this result. Full Node acceptance and exact-head CI also remain pending. No #102 completion claim.

The shared native lock coordinates cooperating installers. A noncooperating external writer can still alter source or instructions after the final comparison and before a write; these checks do not provide a filesystem CAS. Approval discovery is read-only, and unsupported discovery retains fallback rather than guessing a trust hash.

## Integrated release validation

Merged release head `186b85ad46dee91112b3fbd4d4260143da7bd0da` into `d199cf5`, keeping #102 under Unreleased and the 0.23.3 entries separate. The bundle was regenerated with pinned Bun 1.4.2 and its current-board fingerprint exclusion. Strict standalone TypeScript, strict plugin validation, Bun bundle check and whitespace validation passed before the frozen suites.

At frozen runtime `ccdc093`, exact offline Claude Code 2.1.301 passed **488/488** plugin tests across nine files in 188.58 seconds (`issue-102-integrated-plugin.log`). All four corrected notification fixtures passed; the unchanged inbox-read case passed in 3283.08 ms under its original 5000 ms limit. Prior red results remain evidence; the later pass does not establish the earlier timeout's cause.

The complete 11-file CI Node suite ran with concurrency 1: **257 passed, zero failed, two platform skips**, 259 total in 383.444 seconds (`issue-102-integrated-node.log`). Synthetic inspector paths use absolute temporary mock/missing executables. The pane memory adapter bypasses native observation; the generated worker failure fixture stops at NODE_REQUIRED. A separate read-only call-site audit found no test route to real Codex PATH discovery.

After both readers exited, merged the actual published release ancestor `5610ce6a051ba772ee074ac50bdcbc22c6195f6f`. Runtime and fixture SHA-256 inputs remained identical to the frozen suite snapshot. Pinned Bun `build-released.ts --check` passed with the published `agent-board--v0.23.3` tag visible (`issue-102-integrated-released.log`); the ownership table was not edited by hand.

Exact-head CI and root trust/final review remain required. These are local synthetic checks, not an actual native hook-approval claim. No real host API, model, permanent settings or trust mutation was used.
