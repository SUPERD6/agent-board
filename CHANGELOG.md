# Changelog

## 0.5.0 — 2026-10-16

- **Its own repository and marketplace.** Install with
  `claude plugin marketplace add WenyuChiou/claude-progress-pane` and
  `claude plugin install project-progress@claude-progress-pane`; update with
  `claude plugin update`. The zip and its installer are gone.
  `scripts/setup.ps1` / `setup.sh` set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` and
  move a zip install over: its folder leaves `CLAUDE_CODE_PLUGIN_DIRS`, so the
  mod does not load twice, and its block leaves `CLAUDE.md`.
- **The rule rides the system prompt.** The mod adds how Claude should keep the
  Task list to each session that has the Task tools, instead of the installer
  writing it into `CLAUDE.md`, so uninstalling leaves nothing behind. Where an
  organization manages Claude Code that hook does not run in a personally
  installed plugin; `setup -KeepRule` keeps the rule in `CLAUDE.md` there.
  Test: `the rule rides the system prompt only while the session has a Task list`.

## 0.4.0 — 2026-10-16

Takes in every fix from the local review of 0.3.0 (`UPSTREAM_ISSUES.md`, numbered
as there). Each test named below fails on 0.3.0 and passes here; 33 tests in all.
A copy with those local fixes can take this version as is.

- **Windows test fixture.** The fake file system maps `X:\home\...` back to
  `/home/...`, so the tests see the mod's reads and writes on every host.
- **1. A 完成 press could be overwritten.** Every write this session makes (its
  block, a tick, an archive, `/progress 整理`) goes through one queue.
  Test: `a 完成 press while Claude's own write is on its way: both land`.
- **2. A press could tick the wrong line, or a newer mark.** Steps carry their
  line and text; a press ticks that line if it still reads the same, else the
  one identical line in the file, else nothing.
  Tests: `a press ticks the exact line it showed, and nothing once that line
  changed`; `a press still finds its step after lines above it moved, unless
  the step has a twin`.
- **3. A failed read could empty a file.** A file that exists but cannot be read
  stops the write. A zero-byte read of a file the last poll saw with content is
  read again. `/progress 整理` says when it could not read. Archives are one
  file per month, `progress-archive-YYYY-MM.md`.
  Tests: `a progress.md that cannot be read is never rewritten`; `a progress.md
  holding only whitespace still gets this session's block`; `an archive file
  that cannot be read is left alone, and so is progress.md`; `old done blocks
  go to the month's archive file, after what it already holds`.
- **4. Archiving a block without its end marker.** Only closed blocks are
  archived, whole.
  Test: `archive moves a closed block whole and leaves an unclosed one where it is`.
- **5. Closing the pane by hand did not stick.** Only `mirror:` and `hinted:`
  store keys age out.
  Test: `the person's own store settings are never aged out`.
- **6. 接手做完 dropped step names past the fold.** Rows keep every open step.
  Test: `a task row keeps every open step for the take-over prompt, past the fold`.
- **7. Repeated titles shared keys.** Repeats get `#2`, `#3`, …; covered by the
  first test under 2.
- **8. Two quick side questions could cross.** A reply to a question no longer
  shown is dropped. No test, as in the local copy.

Two of the known issues listed there are fixed too:

- **An end marker closes only its own block** (`session=` must match, or be absent).
- **A block whose end marker was deleted by hand** ends at its first blank line,
  a second `###`, the next block or the next `##`, so hand-kept tasks after it
  are no longer overwritten.
  Test: `an end marker closes only its own block, and an unclosed block stops
  before hand-kept tasks`.

Still open: two sessions writing at the same moment (the last write wins;
needs a lock the mods API does not offer), a half-written read that is not
empty, the cost of side questions after the prompt cache expires, and desktop
sessions without Task tools.

## 0.3.0

Interactive pane: rows open to their steps and actions, 完成 / 完成這步 /
交給 Claude / 接手做完 / 繼續 / 封存, and a side-question box.

## 0.2.0

Mirrors Claude's Task list, survives compaction, plain-language pane.
