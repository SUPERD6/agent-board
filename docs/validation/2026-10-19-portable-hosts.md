# Portable host acceptance — 2026-10-19

This follows the [Codex/Antigravity native acceptance](2026-10-19-native-hooks.md).
No additional model calls, credentials, private conversations or permanent host settings
were used. OpenClaw, OpenCode, Grok and DeepSeek native applications were unavailable on
the test computer. Installation, callback execution and model delivery remain distinct.

## Source contracts checked

| Host | Exact primary source | Checked surface |
| --- | --- | --- |
| OpenClaw | [`d958966b09ea425f906da6bb385902fe1e5a3fbf`](https://github.com/openclaw/openclaw/tree/d958966b09ea425f906da6bb385902fe1e5a3fbf) | Plugin manifest, `api.on` session events and metadata-only `api.agent.events.registerAgentEventSubscription` |
| OpenCode stable 1.19.3 | [`e3c4eb242585dcd77be1a867391b7c25fd47ce52`](https://github.com/anomalyco/opencode/tree/e3c4eb242585dcd77be1a867391b7c25fd47ce52) | Stable plugin SDK, exact session metadata and config/plugin discovery; development 2.x is a separate surface |
| Grok Build | [`2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8) | `UserPromptSubmit`, camelCase/snake_case session envelope and command hooks |
| DeepSeek Harness | [`687f282e8625c6b8d11ff58211a90524be2e4317`](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317) | Native Cordis agent lifecycle, file-URL plugin loading and home patch insertion |

The OpenClaw adapter requires the named subscription API. An older host fails with
`AGENT_BOARD_HOST_API_UNSUPPORTED`; it is not granted conversation access as a fallback.
DeepSeek gets its own identity, not a reused Codex hooks configuration. Hooks update
activity only; they do not summarize conversations or create incoming receivers.

## Isolation checks

`node --test tests/codex-local.test.mjs tests/messaging.test.mjs` checks:

- All ten targets share one selected board; preview, repeat installation, conflicts and
  scoped removal preserve other settings. A deterministic concurrent writer causes
  `INSTALL_CHANGED` before writes. Hermes still reports `adapter-pending`.
- OpenClaw start/end/error and session callbacks update its own block; stale run events
  cannot overwrite a successor. No prompt, transcript or response body is retained.
- DeepSeek created/running/idle/disposed callbacks update its own block. Idle preserves an
  explicitly completed task; another running event reactivates it. Reporting failures log
  a bounded warning instead of blocking native agent creation.
- Grok prompt submission updates waiting to working through the platform's real shell
  command shape, including a Node executable path with spaces on Windows.
- OpenCode honors config overrides, refuses unverified metadata and protects an existing
  installation when its host directory changes.
- Simulated OpenClaw/OpenCode/Grok/DeepSeek owners exchange eight messages with simulated
  Codex through one local store. Duplicates, conflicting ids and offline sources/targets
  are rejected. Deduplication survives a four-day clock advance; there is no message TTL.

Those callbacks and ACKs are synthetic. They do not prove that a native application
loaded its plugin or received a message. Grok/OpenClaw/DeepSeek CLI, App and IDE execution,
existing-session receiving, and actual cross-product ACKs remain **unrun**.

## Packaged SDK and loader check

Run from the repository root with an explicitly disposable dependency prefix:

```sh
npm install --prefix /temporary/host-runtime --ignore-scripts --no-audit --no-fund @opencode-ai/plugin@1.19.3 @deepseek-ai/cordis@4.0.5 @deepseek-ai/cordis-plugin-loader@1.0.6
node scripts/check-host-contracts.mjs --runtime-dir /temporary/host-runtime
```

Passed on Windows with Node 24.12.0: OpenCode's actual SDK constructs the context-bound
tool, and DeepSeek's actual Cordis/Loader imports the generated file URL and dispatches
created/running/idle/disposed callbacks. Caller/session objects are test fixtures; the
complete AI hosts and models are not started. The helper removes only its own temporary
home. The caller owns the disposable dependency prefix. These packages are optional
development checks, not Agent Board runtime dependencies or normal bootstrap requirements.

## Board commands and public image

On a separate synthetic board, `--chat`, `--html` and `--serve --no-open` passed; the
serve command reused the existing service. Browser clicks verified card expansion,
Mark read, Show again and manual-step completion. The shared English README screenshot
is from that board, with synthetic tasks and a simulated receiving adapter. It has no
real task content, native session identifiers or bearer URL. It is UI evidence only.

Full local Node checks: 158 passed, 2 platform/opt-in skips. Offline optional plugin:
383 passed; Windows legacy installer: 40 passed. Final metadata failure handling and
setup snapshot changes also passed the packaged SDK/Loader check.
Strict standalone TypeScript and generated-bundle checks passed. Full plugin SDK typing
remains unrun because the host-generated `.claude-plugin/types/` SDK is unavailable.
CI verifies the final PR head separately on Node 22/24 and Linux/Windows.

The first PR run exposed inherited XDG paths in three Linux fixtures. Every synthetic
home now overrides all host config roots, so tests cannot write into caller settings.
This changes test isolation, not the installer's intentional environment-override support.
