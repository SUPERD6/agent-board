# Agent Board

One local board for your agents' work, questions and next steps. Start from the agent you already use. Claude Code is optional.

[![Version 0.23.0](https://img.shields.io/badge/version-0.23.0-blue)](CHANGELOG.md) [![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

English · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

- See work by project, with questions and blockers first.
- Tick manual steps, archive work, copy replies, mark questions read and restore them.
- Native hooks update activity; agents explicitly report their own task steps.
- Send from a card when its exact session has a live adapter. A real reply confirms receipt.

## Quick start

<details open>
<summary><b>Let an agent install it for you</b></summary>

Paste this into your agent:

```text
Install Agent Board from https://github.com/WenyuChiou/agent-board on this computer.
Read AGENTS.md, README and docs/SETUP.md. Identify my current host and other installed coding agents; preview node scripts/setup-agent.mjs.
Preserve existing settings and the shared progress path. Follow my approval requirements for persistent changes, then apply the applicable hooks, plugins and board skill. Do not require or call another AI product to bootstrap this one.
Complete any required scoped host trust, read settings back, and have this session report its own real progress. Open the interactive board.
Verify actual hook events separately for CLI, desktop App and IDE. Files installed, progress reported and messages received are separate checks.
Tell me which sessions need reload and which adapters remain unsupported or unverified. Never scan private conversations or silently skip a blocker.
```

</details>

Or use Node.js 18+ and Git:

```sh
git clone https://github.com/WenyuChiou/agent-board.git
cd agent-board
node scripts/setup-agent.mjs
# After reviewing and approving the plan:
node scripts/setup-agent.mjs --apply
```

Setup detects configuration targets, not running sessions. It installs the board and available adapters; it does not install the AI applications. Fresh installs use `~/.agent-board/progress.md`; existing installs keep their path. [Setup and removal](docs/SETUP.md).

## Supported agents

| Host / surface | Current scope |
| --- | --- |
| Codex | Independent setup, six hooks and own-thread reports. Native owned app-server hooks and ACKs tested; CLI TTY and desktop App automatic hooks/receiving need separate acceptance. |
| Antigravity CLI | Independent setup, four native hooks and owned-stream messaging tested on Windows. App/IDE acceptance remains separate. |
| Cursor, OpenCode, Grok Build, Muse Code | Independent hooks or plugin generated. Native execution and receiving vary by host; installation alone is not acceptance. |
| OpenClaw, DeepSeek Harness | Independent native metadata plugins and skills; isolated callback/loader checks passed. Native applications and receiving remain unverified. |
| Hermes Agent | Board and skill; independent lifecycle adapter pending. |
| Claude Code | Optional native pane, Task mirroring and its plugin connector flow. |
| dot and other web agents | Explicit progress relay; no native receiver verified. |

See [adapter coverage](docs/SETUP.md#native-status-adapters), [messaging by surface](docs/MESSAGING.md#agent-and-surface-support) and the [native acceptance record](docs/validation/2026-10-19-native-hooks.md).

<details>
<summary>Legacy Gemini CLI compatibility</summary>

Antigravity CLI is the current consumer entry. The separate `--agent gemini` target remains for supported enterprise/API hosts; it is not an Antigravity alias. [Google's transition announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/).

</details>

## The board in every agent

Ask the installed Agent Board skill to open the board (`$agent-board` in Codex; `/board` in OpenCode), or run:

```sh
node ~/.agent-board/agent-board.mjs --serve
```

Use the exact paths printed by setup on Windows or with a custom install. `--watch` opens the terminal board, `--chat` prints a compact text view, and `--html` writes a read-only page. [Guide](docs/GUIDE.md#the-board-in-every-agent).

### The board's page

`--serve` opens the interactive web board. It can tick manual steps, archive tasks, import a valid progress block, copy replies, mark questions read and restore them. It has no general task-editing form. **Send** appears only for an exact live adapter; offline cards keep **Copy** and **Copy resume** where available. [Enable messaging](docs/MESSAGING.md).

Closing the tab leaves the service running. Run the same command to reopen it; **Close the board** stops it. Idle shutdown is off by default; `--idle-minutes 30` opts in. `--lan` is optional and has separate access limits; see [Security](SECURITY.md).

![Interactive board with a question, agent progress and a manual checklist](docs/images/interactive-board-en.jpg)

*Interface example with synthetic data. Send requires a live adapter; this screenshot is not native delivery evidence.*

## Optional Claude Code pane

Requires Claude Code 2.1.287+ (offline CI checks use 2.1.301):

```sh
claude plugin marketplace add WenyuChiou/agent-board
claude plugin install agent-board@agent-board
```

Open Claude Code and use `/progress`. Its Task mirroring, quick-add, reports, notifications and `/progress connect` are plugin features; other agents initialize independently. [Guide](docs/GUIDE.md).

## Documentation

[Setup](docs/SETUP.md) · [Guide](docs/GUIDE.md) · [Codex](docs/CODEX.md) · [Messaging](docs/MESSAGING.md) · [File format](docs/FORMAT.md) · [Remote reporters](docs/REMOTE_REPORTERS.md) · [Contributing](CONTRIBUTING.md)

Report bugs with the board/host version, CLI/App/IDE surface and a synthetic reproduction. Keep private conversations, credentials and token-bearing board links out of issues.
