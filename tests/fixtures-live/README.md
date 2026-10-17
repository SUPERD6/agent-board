# Live fixtures: Muse Code, dot, Cursor and Hermes

Recorded on 2026-10-17 by asking each agent, in a throwaway project `api-gateway`:

> Add rate limiting to the public endpoints. Then ask me whether the per-key limit should be 100 or 300 a minute.

and then answering "300". Everything here is synthetic. No real repository or file was touched. The home folder is written as `/home/me`, including its URL-encoded form (`%2Fhome%2Fme`).

## Setup

| | Version |
|---|---|
| OS | Windows 11 Home 10.0.26200 |
| Claude Code | 2.1.302 |
| Agent Board | 0.13.0 for the Muse Code and dot runs. The Hermes runs used the #22 branch's connect. 0.15.0 (main at 1e23324, which includes #22) when the board section was copied |
| Muse Code | web app (muse.ai), no version shown |
| dot | ChatGPT dots web app (chatgpt.com/dots), no version shown |
| Cursor | app 3.25.6, `cursor-agent` 2026.10.16-e3cb207 |
| Hermes Agent | v0.16.0, model gpt-5.6-luna |

## What is here

| File | What it is |
|---|---|
| `progress-api-gateway.md` | The `## api-gateway` section of `~/.claude/progress.md` after a Claude Code session was open 15 s and took the inbox |
| `progress-archive-api-gateway.md` | The archive file after dot's ended block was archived from the pane |
| `relay/muse-*.md`, `relay/dot-*.md` | The fragments each web agent wrote, in order |
| `hermes/hermes-turn.json`, `hermes/hermes-end.json` | The payloads Hermes sent to the hook on the second run (the "300" answer). Codex's `encrypted_content` reasoning blob is replaced with `<redacted>` |

There is no `muse-*.json` or `cursor-*.json`:

- **Muse Code and dot** are web chats with no hook to call, so they reported by writing a block in chat. Each fragment was checked with `scripts/remote-reporter/validate.py` and merged with `merge.py`.
- **Cursor's hook did not run** (see below), so nothing reached `~/.claude/progress-inbox/`.

## Events, in order

- **Muse Code (relay)**:
  1. `muse-1-invalid-markers.md` was refused by `validate.py`.
  2. `muse-2-waiting.md` was merged: state `waiting`, with `[?] Confirm the per-key limit with the user — 100 or 300 a minute?`.
  3. After "300", `muse-3-done.md` was merged: state `done`, titled "Rate limiting set for public endpoints; per-key limit set to 300 a minute".
- **dot (relay)**:
  1. `dot-1-invalid-markers.md` was refused.
  2. `dot-2-waiting.md` was merged: state `waiting`, with the `[?]` line.
  3. `dot-3-done.md` was merged: state `done`.
  4. `dot-4-ended.md` was merged: state `ended`.
  5. The block was archived (`progress-archive-api-gateway.md`).
- **Hermes**: `post_llm_call` (turn), then `on_session_finalize` (end), for each `hermes -q` run. The first run's block (`5cc980bb`) carries the `[?] 100 or 300` line. The second run's block (`3d66b4dc`) is the "300" answer, state `done`.
- **Cursor**: three runs, and none did the work. Every `preToolUse` hook failed, which blocked every tool call. These were other tools' hooks: `~/.orca/agent-hooks`, `bash_gate.py` and `check_redundant_reads.py`. Each run stopped with "blocked", saying it would ask "100 or 300" once the hooks were fixed. Agent Board's own hook wrote nothing either.

## What looked wrong

1. **Web agents guessed the block markers.** Both first wrote their own markers: Muse used `<!-- block-start id=… -->` with a `### title:` prefix, and dot used `<!-- agent-board:start … -->`. Neither could fetch `FORMAT.md`, and `docs/REMOTE_REPORTERS.md` has no copy-paste prompt that gives the exact `<!-- auto session=… -->` markers. Once the markers were given in chat, both got them right.
2. **Cursor hooks fail on Windows.** `cursor-agent` 2026.10.16-e3cb207 runs hook commands through bash even when they are written for PowerShell. They fail with `syntax error near unexpected token '&'`, and a failing `preToolUse` hook blocks the agent completely. The failing hooks belong to other tools, and Agent Board's hook did not report either. This looks like a Cursor bug, not an Agent Board one.
3. **A one-shot Hermes run never shows "Waiting on you".** `hermes -q` ends its session right after the turn. The `[?]` block therefore lands as `ended` ("session ended, can be taken over") instead of `waiting`. A long-running Hermes, such as its Telegram gateway, would keep it in waiting.
4. **A stock Hermes config with `hooks: {}` was not wired.** Fixed in #22.
5. **Connect broke OpenClaw 2026.3.8.** It added a plugin entry that this version rejects, so OpenClaw failed to start. Fixed in #25: older OpenClaw versions are now left out, with a note.
6. **`/progress connect` says "Connected: Grok Build" when Grok is not installed.** `~/.grok/` existed because another tool had put hooks there, but there was no `grok` binary.
7. **`/progress tidy` does less than the README says.** The README says it archives finished work now, but it only moves blocks older than the archive age. A block that was just marked `done` stays put.
8. **Fixes on main don't reach existing installs.** `claude plugin update` compares versions only, so they arrive with the next version bump.
