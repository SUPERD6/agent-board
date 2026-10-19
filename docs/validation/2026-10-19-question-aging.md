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

Release integration includes exact head `186b85a`, retaining its Bun loader fix:
only the current-version board fingerprint is omitted from the embedded ownership
table; the external table, historical boards and current command/reporter hashes
remain intact. Released changelog content matches that head exactly; #66 remains
under Unreleased. README changes are version badges only.

The regenerated bundle is 441311 characters, SHA-256
`D7F2E09116E75076AF1714726A85457B36213E3722ECCDB70BA474D7868412CE`.
Focused validation passed: 18 pure tests with 304 assertions, and three Node
regressions covering self-hash ownership, source retention across end/restart and
three-language hide/restore. Strict standalone TypeScript, strict plugin
validation and the bundle check also passed. Full suites were not rerun on this
snapshot while another task held the shared heavy-reader lease; the 514/229
results above remain evidence for runtime221d816.

The `agent-board--v0.23.3` tag was absent during this integration. The generated
ownership tables remain byte-identical to the release head and were not edited
or regenerated here; the released-files check must be revisited after that tag
exists and before final CI.

Full SDK `tsc -p .` is unrun because the generated SDK is unavailable. These local
results do not replace final exact-head Windows/Linux CI. No native model calls
or permanent host settings were part of this issue's tests.
