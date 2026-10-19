# Connected-session messaging

The interactive web board can route a message to a receiving adapter for an exact agent,
session and turn. A progress card alone never enables sending. The adapter must verify its
existing host connection, register a short-lived lease, and keep it alive. Disconnected
adapters disappear from the target picker within 15 seconds. Ordinary messages cannot
approve tools, grant hook trust or merge a PR.

## Enable locally

After approving the local message storage directory, start the installed board with:

```sh
node /path/to/agent-board.mjs --serve --messages-dir /private/local/message-data
```

The directory holds `messages.json` (message text, target binding, id and receipts) and a
`server.lock`. It must be private to the user and local to this machine. Do not use a shared
drive or publish it. The board's bearer URL and connector secrets must not be posted to
issues. This flag opens no network listener beyond the existing loopback board; messaging
and its history are absent from the LAN page. Setup does not silently enable it or install
a background receiver. Reopen with the same command and directory. Closing the board
disconnects its receivers; they must reconnect explicitly to the new board URL.

## What the receipts mean

| State | Evidence |
| --- | --- |
| queued | Stored locally; no external delivery yet |
| uncertain | Claimed durably before delivery, or a disconnect/timeout after claiming |
| accepted | Adapter reports transport acceptance; no session ACK yet |
| acknowledged | Adapter supplies the current session's actual `ACK <message-id>` reply |
| rejected | Refused before claiming, or adapter reports a clean rejection |

An ACK proves receipt, not successful completion of the requested task. An adapter must
never manufacture an ACK from an RPC success or a file write. Synthetic adapters in tests
are labelled synthetic. No live model or desktop acceptance is inferred from those tests.

IDs are scoped to this message store. An exact retry returns the existing receipt, even
after restart. Reusing an id with different text, source, binding or turn fails with
`ID_CONFLICT`. A claim is never automatically replayed. The store retains up to 1000 ids
and then refuses new messages instead of deleting deduplication history. Reconcile an
uncertain message with its original recipient before a human chooses any new action.
Never change its id merely to bypass uncertainty. A stale lock after a crash requires
checking the recorded owning PID before removing that specific lock.

## Adapter API for other agents and UIs

Import `scripts/message-client.mjs` and attach an existing host transport:

```js
import { boardClient } from './message-client.mjs'
const receiver = await boardClient(privateBoardUrl).attach({
  agent: 'gemini', session: actualSessionId, turn: actualTurnId, surface: 'Gemini CLI',
  verify: async () => host.isConnectedTo(actualSessionId, actualTurnId),
  deliver: async (message, accepted) => {
    const result = await host.sendToCurrentTurn(message.text)
    await accepted() // transport acceptance only
    return await host.waitForActualAck(message.id, result)
  },
})
// Cross-agent forwarding carries this receiver's authenticated source binding.
await receiver.send({ id, target: targetConnectionId, turn: targetTurnId, text })
await receiver.close()
```

`host` above is the integrating application's API, not a built-in Gemini connector. The
API is agent-neutral; Claude Code, Gemini, Cursor and other UI adapters still need their
own supported transport and live acceptance. No shell typing, transcript scraping,
credential discovery, automatic resume, or approval RPC is implemented by this client.
The original host remains responsible for its normal permission checks.

## Codex existing-owner adapter

`scripts/codex-message-connector.mjs` uses the installed Codex executable's existing
`app-server proxy` control socket. It does not start a daemon or create/resume a thread.
After a person approves the exact disposable server/thread/active-turn binding, give it
JSON on stdin:

```json
{"boardUrl":"<private loopback board URL>","executable":"<absolute Codex executable>","thread":"<actual thread UUID>","turn":"<actual active turn id>","surface":"Codex CLI"}
```

An explicit `socket` path may select an already-running owner. Preflight and each poll
check `thread/loaded/list`; each send uses `turn/steer` with `expectedTurnId`. A stale turn
fails at the host instead of resuming another session. Only matching `item/completed`
agent-message notifications from that same thread and turn supply an ACK. The connector
retains the ACK line only, and ignores approval requests. No saved history is read.

Availability of this socket differs by surface. The Windows desktop tested with Codex
0.163.0-alpha.10.2 had no reachable shared control socket (OS error 10050). Therefore this
change does **not** establish messaging to that desktop chat. Codex CLI shared-daemon
delivery remains a separate real-session test. Other agent-native connectors and real
dot delivery are not implemented or claimed. The UI shows no receiving target until an
adapter actually registers.

Tests: `node --test tests/messaging.test.mjs`. They cover synthetic routing, idempotence,
conflicts, offline/expired bindings, stale turns, crash uncertainty, fake approvals, and a
mock Codex proxy. A real `AB-TEST-001` ACK must be verified separately with consent.
