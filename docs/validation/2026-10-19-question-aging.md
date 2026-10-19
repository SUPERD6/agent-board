# Unanswered-question aging acceptance

Issue #66 applies one policy to own, external, manual, inbox and ingested remote
questions: pending through three days, reminders through seven, then a
discoverable older shelf outside actionable counts. Aging never means answered,
approved, completed or sent. Native receiving is a separate capability.

Root review covered durable question identity, exact producer resolution receipts,
immutable full-source retention, clock rollback and missing timestamps, archive
failure guards, and the pane's asynchronous answer handling. A dropped or failed
submission retains the question; a replacement ask cannot be answered by an old
callback. Source copies retained after cleanup are review-only.

Behavioral coverage is in `tests/question-aging.test.ts`: exact3d/7d boundaries;
heartbeat, whitespace, restart and unrelated updates preserve age; explicit
producer renewal refreshes only its own ask; all source kinds and four readers
agree; immutable captures survive stale-index replacement; exact resolved
replays stay resolved while new revisions resurface. Pane tests cover hide and
restore in all three languages, and dropped/failed/replaced answer submissions.
Node board tests cover full source capture, terminal/web actions and retention
failure. Automatic cleanup refuses unresolved questions.

Windows validation on integrated runtime221d816: pinned offline Claude Code
2.1.301 plugin514pass/0fail; all nine Node suites229pass/0fail/2skip. The skips
are the POSIX permission-bits fixture and an opt-in installed-Codex trust fixture.
The later integration of79cf586 changed only the worker error wrapper/tests;
its complete affected file passed5/5, and the board bundle remained unchanged.
Strict standalone TypeScript, strict plugin validation and Bun1.4.2 generated
checks passed. Earlier failures were retained: reminder identity changed after
capture, and the pane marked a question answered before prompt acceptance; both
were reproduced and corrected before the full green run.

Full SDK `tsc -p .` is unrun because the generated SDK is unavailable. These local
results do not replace final exact-head Windows/Linux CI. No native model calls
or permanent host settings were part of this issue's tests.
