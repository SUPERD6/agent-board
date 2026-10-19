# Native legacy-connect worker foundation

This checkpoint prepares issue #93 without switching the Claude engine adapter.
The existing `/progress connect`, automatic connect, language and status handlers
still use SDK filesystem/store authority. Do not claim that their race is fixed,
and do not use the new worker alongside older active writers as proof of fencing.
Issue #94 background startup scheduling remains deferred.

The generated Node board exposes an internal `--legacy-connect-request` entry
point for the adapter migration. It reads and merges host configuration itself
inside the synchronous native lock. Every file mutation, old-path removal,
instruction cleanup, generated-file ownership hash, disable intent and setup
outcome in that worker stays inside this process. Node/OpenClaw version facts are
request metadata prepared before lock acquisition; the worker never probes a host.
Missing/unsupported Node observations are refused before transaction writes.

Independent installation now takes the same canonical home-level `install.lock`
as the worker, including when callers choose different data roots. It refuses an
unresolved worker journal rather than changing its pending source files. These
rules coordinate cooperating versions; a foreign application or older plugin
that ignores this lock remains outside the guarantee. Reload/stop older writers
before the eventual authority cutover. No SDK exclusive-create, lease or CAS is
assumed.

`legacy-connect.json` becomes the worker's authoritative ownership, disable,
language and status record. A seed contains generated ownership hashes and
metadata, never mutable configuration bodies, and is used only at initialization.
Remove persists disable intent before cleanup. A journal step stores only its
path, before/after fingerprints and whether its output is generated. Process-crash
recovery recognizes either version and reruns the pending operation; a foreign
version is retained as `RECOVERY_CONFLICT`. A pending transaction from another
bundle version is retained as `RECOVERY_BUNDLE_CHANGED`. This is not an atomic
multi-file operation against uncooperative writers, and no power-loss durability
or rollback over foreign changes is claimed. Recovery keeps the shipped lock's
dead-owner requirement; a paused live worker cannot be displaced by age alone.

The bootstrap helpers use only short `process.run` argv invocations. Native Node
creates a private temporary directory and payload file. The future adapter writes
only the trusted generated code to that file, passes a short metadata request,
and the launcher checks ownership and SHA-256 before importing the verified bytes
as a data URL. Cleanup verifies the allocated temporary path and ownership token.
Changed or unknown stages are retained and refused. Host configuration and
credential bodies never enter staging files or argv plans. Pure connect helpers
are separated from the generated `BOARD_SCRIPT` wrapper so bundling the worker
cannot embed a previous board bundle recursively.

Still required before closing #93: wire every engine connect/remove/auto/language/
status/notification path through the verified transport; retire SDK setup control
authority after explicit migration; preserve per-file and three-language outcomes
in adapter fixtures; test absent Node/bootstrap and delayed probes from the engine
surface; verify the actual SDK transport without inventing methods. Then #94 can
move background probing after pane/timer initialization under the native disable
authority. The generated SDK is unavailable here, so full plugin typechecking
cannot be claimed.

Checkpoint validation on Windows: offline plugin tests passed 398/398; the full
applicable Node board/storage/setup/exchange/messaging/lock/worker/bootstrap batch
passed 203 tests with two existing platform skips (205 total). Strict standalone
TypeScript, including `noUncheckedIndexedAccess`, passed for the changed standalone
modules. Strict plugin validation, the pinned Bun bundle/released checks and
whitespace validation passed. The worker bundle is 389,327 characters; staging
tests exercise the actual generated bundle and reject recursive bundle growth.
These are synthetic native-process fixtures, not native AI host/model acceptance.

## Adapter checkpoint (uncommitted, 2026-10-19)

The current working tree routes connect/remove/automatic setup/language/status/
notification acknowledgement through the verified native transport. The worker
owns the canonical record after migration; an authority marker makes a missing
record fail closed instead of importing stale SDK flags again. Pane and inbox
timers start before background probes. These changes are not yet ready to merge.

The second adapter plugin run passed 364 of 403 tests and failed 39
(`issue-93-adapter-second.log`). The five new adapter cases passed: startup/polling
while a version probe is blocked, removal fencing that delayed automatic setup,
and fail-closed Node/bootstrap/worker/corrupt-state boundaries. Existing tests
still assume synchronous startup, SDK ownership/status writes, shell-based
removal, or configuration without Node. There are also unresolved language
precedence and first-cutover status compatibility cases. These need focused
resolution before another frozen full run; the failures must not be treated as
only fixture timing changes.

Strict plugin validation and standalone TypeScript checks passed for this working
tree. The pinned Bun bundle was regenerated (390,786 characters), and whitespace
validation passed. The native Node batch above belongs to foundation commit
`6fcbb1390105353e90a3c4d06494e932586419c4`; it has not been rerun against this
adapter integration. All readers exited before this checkpoint, and no native
AI host, model, permanent host configuration, or GitHub mutation was used.

Slice 6 fixes explicit-connect language precedence while leaving delayed automatic
SDK language seeds unable to revert the native choice. Initial status migrates
recognized structured display metadata only; unknown fields and free-form legacy
prose do not enter worker argv plans. Four focused native tests passed: initial
disabled authority, language/notification revisions, initial status migration,
and explicit language versus delayed automatic seeds. Strict standalone TypeScript,
strict plugin validation (`issue-93-adapter-slice6-validate.log`), pinned Bun
bundle/released checks, and whitespace checks passed. The bundle is now 391,298
characters. Existing setup fixtures await a worker acknowledgement explicitly and
assert canonical ownership/native deletion/Node fail-closed behavior. Their fresh
full plugin run and the final full Node batch remain pending; the prior 364/39
result is still the latest full plugin evidence. The shared heavy-reader lease
was held by #66 and then reserved for #98, so this checkpoint starts no competing
batch. Runtime and fixtures are frozen for the next acceptance run; no commit is
claimed ready yet.

Slice 7 full exact-Claude-2.1.301 evidence is retained separately:

- `issue-93-adapter-slice7-plugin.log`: 329 passed, 74 failed, 403 total,
  150.27 seconds. All failures were classified: 44 duplicate `ui.notify` fixture
  registrations, and 30 calls to unsupported test Engine `session.id()`.
- Root approved only those two causal fixture corrections. Notification capture
  now uses the existing `outside` handler; the acknowledgement barrier follows
  with supported `command.run(connect status)`. No assertions, timeouts or runtime
  behavior changed. Strict validation passed; SHA-256 inputs and red classification
  are retained in `issue-93-adapter-slice7-inputs.txt`.
- `issue-93-adapter-slice7-corrected-plugin.log`: 402 passed, one failed, 403 total,
  109.89 seconds. The sole failure was a deterministic fixture wait: the Node-16
  case awaited setup failure completion without registering `outside`, where its
  notification completion signal lives. That one case now registers the existing
  handler. Its fresh full rerun is pending; no unchanged retry or timeout increase
  was used. Both completed readers released their heavy-reader lease immediately.

The final Node batch remains unrun because plugin acceptance is not yet green.
Production/runtime hashes stayed fixed throughout both readers. The fixture-only
last correction is uncommitted and must not be described as a passing full suite.

The authorized final full plugin run after that one-line Node-16 handler fix passed
403/403 tests across five files with exact offline Claude Code 2.1.301 in 155.66
seconds (`issue-93-adapter-slice7-final-plugin.log`). Its fixture SHA-256 is
`8640388a8435423e532a85c14d707f8638d70934db26d42d8e8cc63ce12198de`.
All assertions and timeouts were retained. This accepts the integration on its old
base only; the final integrated plugin/Node acceptance remains required after the
parent confirms the latest main merge and the branch is rebased. No full Node run
was started on the superseded base, and #93/#94 are not claimed closed.

Integrated checkpoint on exact main merge `91dfa50cdba79dda78260a5e109aa1000f6cfaff`:
the rebased foundation is `fc6f929`, followed by adapter `38d8a18`. The split pure
helper was checked against main's complete connector implementation; only the
injected bundle parameter and setup metadata sanitizer differ. All prompt hook
groups/templates remain present. Duplicate SHA-256 imports from the automatic
merge were removed before acceptance.

- Exact Claude Code 2.1.301 full plugin: 486 passed, zero failed, eight files,
  151.57 seconds (`issue-93-integrated-plugin.log`).
- Serialized Node 24.12.0 full batch: 222 total, 218 passed, two failed, two existing
  platform skips, 337.417 seconds (`issue-93-integrated-node.log`). Both failures
  were the prompt-template fixture's old source path: it searched the new wrapper
  rather than `connect-pure.ts`. Its path alone was corrected; both tests then
  passed in 0.267 seconds (`issue-93-integrated-prompt-path.log`). Assertions and
  expected release bytes are unchanged. No full unchanged rerun is claimed.
- Supported strict standalone TypeScript, strict plugin validation, pinned Bun
  bundle check and whitespace check passed after the correction. Integrated
  released-table verification remains pending at this bounded checkpoint; the
  prior old-base released-table check is not substituted for it.

Frozen integrated input hashes are retained in `issue-93-integrated-inputs.txt`.
All heavy readers exited and their lease was released. No native model/host or
permanent configuration was used, and final root review/publication is outstanding.
