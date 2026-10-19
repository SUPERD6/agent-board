# Native lock hardening, first phase of issue #93

This phase changes the independent setup and report paths in `scripts/codex-local.ts`.
It does not serialize the optional Claude plugin's legacy `/progress connect` path;
issue #93 remains open. Acceptance below is offline native-process testing with
temporary files and synthetic ownership records, with no AI hosts or model calls.

`scripts/local-lock.ts` owns the exclusive `wx` descriptor for the complete
synchronous native action. It waits at most two seconds to acquire the lock and never
runs the action without acquiring the lock. The lock records a random token and
the native process id. Cleanup checks both the inode and exact ownership record,
so a detected replacement is retained and raises `LOCK_OWNERSHIP_LOST`.
This ownership protocol coordinates cooperating writers; the token/inode check
and unlink are not an atomic compare-and-swap against an arbitrary external
replacement. Failed initialization always closes the descriptor and removes the
created file only when its inode or complete token still establishes ownership.
If both initialization and ownership identification fail, the unknown lock stays.
The callback type rejects Promise results; callers must keep the complete action
synchronous rather than start asynchronous mutations and return early.

A lock older than 30 seconds is recovered only when probing the recorded process
returns `ESRCH`. A live process, reused process id, permission failure, malformed
record or old empty lock is retained. These outcomes exhaust the bounded wait
with `LOCK_BUSY`; other filesystem failures propagate without running the action.

Recovery takes a separate exclusive `.recover` gate and then rereads the current
owner. Only that gate owner can unlink a dead holder's lock. Another reclaimer
cannot carry an observation made before the gate into its deletion. A paused live
holder is never reclaimed, so its native action cannot resume after takeover.
The gate's own cleanup also checks its token and inode. An abandoned recovery
gate is not automatically reclaimed: no age-only or check-then-delete shortcut
can establish that its owner will never resume. A later stale-owner recovery
therefore skips conservatively. Inspect ownership and stop all related writers
before removing a retained gate or an unknown historical lock by hand.

The existing install plan still compares every original source snapshot under
the lock before applying changes. This coordinates cooperating native installers
and reporters, and rejects edits observed between planning and application.
An external host that ignores this lock can still write between comparison and
replacement. This phase provides no atomic compare-and-swap guarantee for those
writers, and performs no automatic rollback over their changes.

`tests/local-lock.test.mjs` exercises an expired but paused live holder, a killed
holder before and after the stale bound, two reclaimers with the first paused
immediately before deleting the old lock, unknown ownership, an abandoned
recovery gate, replacement during cleanup, action failure and an uncreatable
lock. Injected first-write and fstat failures check descriptor closure, cleanup
of the created lock and preservation of a detected replacement. Every fixture
waits for its native child processes to exit before cleanup.
The existing config-drift test in `tests/codex-local.test.mjs` remains applicable.

The next phase needs to move every legacy connect mutation, including instruction
cleanup and generated-file ownership/auto-disable state, into a bounded native
worker using this helper. The generated Claude SDK is absent from this checkout;
only the already evidenced `$.process.run` can be assumed. Wrapping asynchronous
engine writes in a timed lease would not safely fence a paused writer after
stale takeover. All languages and existing per-file preservation/removal outcomes
must survive that migration before #93 can be closed.

Checks on Windows with Node 24.12.0, Claude Code 2.1.301 and Bun 1.4.2:

- Strict offline plugin validation passed; the plugin suite passed all 390 tests.
- Board, storage, independent setup/report and lock suites passed 130 tests with
  two existing skips: real Codex host trust and POSIX permission-mode preservation.
- Strict standalone TypeScript checks passed for `scripts/local-lock.ts` and
  `scripts/codex-local.ts`, including `noUncheckedIndexedAccess`. A separate
  compile probe accepted a synchronous result and rejected a Promise callback.
- The pinned board bundle was regenerated and its check passed; released-file
  generation and whitespace checks passed.
- Full `tsc -p .` was not run because the generated Claude SDK is absent. No
  native AI application or model acceptance was performed.
