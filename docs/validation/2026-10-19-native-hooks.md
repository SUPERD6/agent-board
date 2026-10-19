# Native session acceptance — 2026-10-19

Windows, Node 24.12.0, Codex 0.163.0-alpha.10.2 and the locally installed Antigravity
CLI. The CLI exposes no `--version` flag; no version number is inferred from its folder.
All prompts were synthetic, explicitly approved and bound to disposable native owners.
No real conversation, credentials or current desktop thread was read or forwarded.

## Observed results

| Check | Result |
| --- | --- |
| Codex owner → Antigravity CLI | Two native ACKs for AB-TEST-001 and AB-TEST-003 |
| Antigravity owner → Codex app-server | Two native ACKs for AB-TEST-002 and AB-TEST-004 |
| Exact resend of each id | Existing acknowledged receipt; no additional model turn |
| Different content with the same id | `ID_CONFLICT`; no additional model turn |
| Returning from idle | Same native owners handled their second prompt |
| Removed Antigravity receiver | Disappeared from live connections; send rejected with `CONNECTOR_NOT_CONNECTED` |
| Codex native progress | SessionStart, UserPromptSubmit and Stop observed; two distinct native turn ids; final state waiting |
| Antigravity native progress, first attempt | Failed: quoted Node path was escaped incorrectly by the native Windows executor |
| Antigravity progress after fix | Separate approved one-turn regression: SessionStart → PreInvocation → PostInvocation → Stop, with waiting → working → working → waiting |
| Native regression ACK | `ACK AB-HOOK-001`; exact conversation present in the progress block |
| Tools, delegates or file actions by test models | None observed |

The cross-host run consumed exactly two Codex and two Antigravity model turns. The
Windows hook regression consumed one additional, separately authorized Antigravity turn.
Codex trust was supplied only through process overrides for the six exact isolated
definitions; all other hooks in that test process were disabled. Antigravity used only
the temporary workspace's four hooks. Test processes and board servers were stopped.

The first hook failure is retained in the result, rather than treating the successful
message ACKs as proof of progress reporting. Regression coverage now reproduces the
native Windows `cmd /c` and CreateProcess argument handling with a path containing spaces.

## Scope of the evidence

The adapters forwarded between authenticated host owners. This does not establish
autonomous model tool integration, native attachment to an already-open desktop App,
Antigravity IDE, Codex TTY, or installation of a receiver merely by installing hooks.
The Codex receiver retained the correlated ACK line, not its complete status response;
its state was checked independently through native lifecycle records.

PermissionRequest, Interrupt and SessionEnd were not exercised by these no-tool Codex
prompts. Antigravity's Stop ends the execution loop and is not a session-end event.
Automatic semantic task summaries are separate explicit reports. Gemini was skipped by
request, Claude model calls were paused, and dot and other vendors were not included.
These remaining limits do not justify closing broad desktop/parity issues.

## Repeated delivery and the native completion race

A second approved run used three prompts per owner (AB-TEST-101–106). All six ACKs,
deduplication checks, conflicts and native progress updates passed, but Codex's receiver
disappeared after the final ACK. The ACK item arrived before `turn/completed`, while
native Stop hooks were still running. Releasing the pending turn at the ACK let a poll
mistake that still-active owned turn for a foreign busy turn. This was a failed
availability check despite successful delivery.

The receiver now waits for both the matching native ACK and a matching successfully
completed turn. A failed native turn cannot turn ACK text into acknowledged delivery.
Outbound forwarding also verifies its source immediately, rather than waiting for the
next poll. Hook-only idle cards no longer use a running-task placeholder.

A final, separately approved run used two prompts per owner (AB-TEST-201–204), with a
test-only 3.5-second Codex Stop delay and a 10-second hook timeout. Both native receivers
remained online after their second turn and through the screenshot checkpoint. Native
Codex and Antigravity progress returned to waiting, exact retries added no model turns,
and conflicting content was rejected. After terminating Antigravity, the dead source
was refused with `HOST_NOT_CONNECTED`; sending from the still-live Codex owner to that
target returned `OFFLINE`. No test model tools or file actions were observed.

Across all runs, the explicit per-binding budgets consumed seven Codex and eight
Antigravity model turns. Each process and temporary board was stopped. Local screenshots
cover the English live hub and Traditional/Simplified Chinese progress views of the
same actual hook records; they are browser-board evidence, not native TTY/App/IDE captures.
