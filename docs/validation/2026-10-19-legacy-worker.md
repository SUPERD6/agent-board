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
