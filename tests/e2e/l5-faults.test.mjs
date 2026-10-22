import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EN } from '../../hooks/strings-en.ts'
import { makeWorld } from './lib/world.mjs'
import { storageFault } from './lib/faults.mjs'
import { run, serve, pageDom } from './lib/surfaces.mjs'
import { killServe, readStore } from './lib/hub-wire.mjs'

const journalText = world => world.files().filter(name => /^progress-journal-.*\.md$/.test(name)).map(name => world.read(name)).join('\n')
const journalName = world => {
  const day = new Date(world.now)
  return `progress-journal-${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}.md`
}
const stamp = at => {
  const day = new Date(at)
  const two = value => String(value).padStart(2, '0')
  return `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())} ${two(day.getHours())}:${two(day.getMinutes())}`
}
const descendants = node => [node, ...node.childNodes.flatMap(descendants)]
// The whole reason, wrapped under the pressed card and never cut.
const resultUnderCard = (frame, note) => {
  const lines = frame.split('\n')
  const card = lines.findIndex(line => line.includes('First card'))
  assert.ok(card >= 0, frame)
  const under = []
  for (const line of lines.slice(card + 1)) {
    if (!line.startsWith('    ') || under.join(' ') === note) break
    under.push(line.trim())
  }
  assert.equal(under.join(' '), note, frame)
  assert.ok(!under.some(line => line.includes('…')), frame)
}
const unsaved = EN.boardSaveFailed(EN.fileProgress, EN.storageReadOnly)
// progress.md cannot be replaced, the way a read-only file refuses it on Windows; the journal
// beside it can still be written.
const readOnlyProgress = world => storageFault(world, { code: 'EPERM' }).enable('write')

test('L5 read-only file: a failed tick writes no journal line and shows a one-line reason', async () => {
  const world = makeWorld()
  try {
    const step = 'Review every route in the synthetic deployment report'
    const source = `## Demo\n### First card\n- [ ] ${step}\n`
    world.write('progress.md', source)
    readOnlyProgress(world)
    const terminal = await run(world, ['--keys', 'x'])
    assert.notEqual(terminal.status, 0, terminal.stderr)
    assert.equal(terminal.signal, null)
    assert.equal(terminal.stderr.trim(), unsaved)
    resultUnderCard(terminal.stdout, unsaved)
    assert.equal(world.read('progress.md'), source)
    assert.ok(!journalText(world).includes(step))

    const server = await serve.start(world)
    const model = (await server.get('/api/board')).json().model
    let response
    const page = await pageDom((await server.get(new URL(server.url).pathname + new URL(server.url).search)).body, model, async request => {
      response = await server.post(request.path, request.body)
      return { ok: response.status < 400, json: async () => response.json() }
    })
    const card = page.cards().find(one => one.textContent.includes('First card'))
    assert.ok(card, page.text())
    const button = page.buttons(card).find(one => one.textContent === `Done: ${step}`)
    assert.ok(button, card.textContent)
    button.click()
    await page.flush()
    assert.equal(response.status, 409)
    const result = descendants(card).find(one => one.className?.split(' ').includes('press-result'))
    assert.equal(result?.textContent, unsaved)
    assert.equal(world.read('progress.md'), source)
    assert.ok(!journalText(world).includes(step))
  } finally { await world.close() }
})

test('L5 read-only file: a failed confirm-done writes no journal line', async () => {
  const world = makeWorld()
  try {
    // The same step twice gives the same journal line twice: both are taken back.
    const steps = ['Review the synthetic route report', 'Review the synthetic route report', 'Check the synthetic deployment plan']
    const source = `## Demo\n### First card\n${steps.map(step => `- [ ] ${step}`).join('\n')}\n`
    world.write('progress.md', source)
    readOnlyProgress(world)
    const terminal = await run(world, ['--keys', 'd'])
    assert.notEqual(terminal.status, 0, terminal.stderr)
    assert.equal(terminal.signal, null)
    assert.equal(terminal.stderr.trim(), unsaved)
    resultUnderCard(terminal.stdout, unsaved)
    assert.equal(world.read('progress.md'), source)
    for (const step of steps) assert.ok(!journalText(world).includes(step))
  } finally { await world.close() }
})

test('L5 read-only file: a failed tick keeps the journal lines that were there before or written meanwhile', async () => {
  const world = makeWorld()
  try {
    const step = 'Review the synthetic gateway routes'
    const source = `## Demo\n### First card\n- [ ] ${step}\n`
    world.write('progress.md', source)
    // A CRLF line inside, so a rewrite that normalised the lines it keeps would show.
    const before = '# Work log\r\n- 2026-10-01 09:00 · Demo · Earlier card · Earlier synthetic work\n'
    const meanwhile = '- 2026-10-01 09:05 · Docs · Other card · Another writer finished a synthetic report\r\n'
    const journal = world.write(journalName(world), before)
    // Another writer adds a line between this tick's journal write and its refused board write.
    const preload = world.write('meanwhile-fault.cjs', `const fs = require('node:fs')
const { resolve } = require('node:path')
const { syncBuiltinESMExports } = require('node:module')
const target = ${JSON.stringify(world.path)}
const rename = fs.renameSync
let isFirst = true
fs.renameSync = (from, to, ...args) => {
  if (resolve(String(to)) !== resolve(target)) return rename(from, to, ...args)
  if (isFirst) { isFirst = false; fs.appendFileSync(${JSON.stringify(journal)}, ${JSON.stringify(meanwhile)}) }
  throw Object.assign(new Error('synthetic read-only progress file'), { code: 'EPERM' })
}
syncBuiltinESMExports()
`)
    world.env.NODE_OPTIONS += ` --require=${JSON.stringify(preload)}`
    const terminal = await run(world, ['--keys', 'x'])
    assert.notEqual(terminal.status, 0, terminal.stderr)
    assert.equal(terminal.stderr.trim(), unsaved)
    assert.equal(world.read('progress.md'), source)
    assert.equal(world.read(journalName(world)), before + meanwhile)
  } finally { await world.close() }
})

test('L5 read-only file: a failed tick whose line was already in the journal leaves the journal as it was', async () => {
  const world = makeWorld()
  try {
    const step = 'Review the synthetic gateway routes'
    const source = `## Demo\n### First card\n- [ ] ${step}\n`
    world.write('progress.md', source)
    // The line this tick would write, for this minute and the next, so a minute that turns
    // during the run still finds it there.
    // CRLF endings: an append would turn the last one into LF, so this passes only when the
    // tick found its line there and wrote nothing.
    const lines = [world.now, world.now + 60000].map(at => `- ${stamp(at)} · Demo · First card · ${step}`)
    const before = `# Work log\r\n${lines.join('\r\n')}\r\n`
    world.write(journalName(world), before)
    readOnlyProgress(world)
    const terminal = await run(world, ['--keys', 'x'])
    assert.notEqual(terminal.status, 0, terminal.stderr)
    assert.equal(terminal.stderr.trim(), unsaved)
    assert.equal(world.read('progress.md'), source)
    assert.equal(world.read(journalName(world)), before)
  } finally { await world.close() }
})

test('L5 locked file: a tick whose board write landed before the file was locked keeps its journal line', async () => {
  const world = makeWorld()
  try {
    const step = 'Review the synthetic gateway routes'
    world.write('progress.md', `## Demo\n### First card\n- [ ] ${step}\n`)
    // The board is replaced, then another program holds progress.md, so reading it back fails.
    const preload = world.write('landed-fault.cjs', `const fs = require('node:fs')
const { resolve } = require('node:path')
const { syncBuiltinESMExports } = require('node:module')
const target = ${JSON.stringify(world.path)}
const rename = fs.renameSync
const read = fs.readFileSync
let isHeld = false
fs.renameSync = (from, to, ...args) => {
  const result = rename(from, to, ...args)
  if (resolve(String(to)) === resolve(target)) isHeld = true
  return result
}
fs.readFileSync = (file, ...args) => {
  if (isHeld && resolve(String(file)) === resolve(target)) throw Object.assign(new Error('synthetic busy file'), { code: 'EBUSY' })
  return read(file, ...args)
}
syncBuiltinESMExports()
`)
    world.env.NODE_OPTIONS += ` --require=${JSON.stringify(preload)}`
    const terminal = await run(world, ['--keys', 'x'])
    assert.notEqual(terminal.status, 0, terminal.stderr)
    assert.ok(terminal.stderr.includes(EN.boardStorageFailed(EN.fileProgress, EN.storageBusy)), terminal.stderr)
    assert.ok(world.read('progress.md').includes(`- [x] ${step}`))
    assert.ok(journalText(world).includes(`First card · ${step}`))
  } finally { await world.close() }
})

test('L5 hub killed mid-delivery: the restarted --serve recovers the stale lock, the claimed message comes back uncertain, and nothing is delivered twice', { timeout: 40000 }, async () => {
  const world = makeWorld()
  try {
    // Leases and message ages use the real clock in both the test and the server, as in the messaging journeys.
    world.env.NODE_OPTIONS = world.env.NODE_OPTIONS.split(' ').filter(one => !one.includes('clock-preload')).join(' ')
    const messages = dirname(world.write('messages/.keep', ''))
    const lock = join(messages, 'server.lock')
    const call = async (server, action, body) => {
      const answer = await server.post(`/api/messages/${action}`, body)
      return { status: answer.status, body: answer.json() }
    }
    const receiver = { agent: 'codex', session: '00000001-2222-4333-8444-555555555555', surface: 'Synthetic receiver', turn: 'turn-1' }
    const first = await serve.start(world, ['--messages-dir', messages])
    const before = (await call(first, 'register', receiver)).body
    assert.equal(before.contested, false)
    const id = 'AB-killed-mid-delivery'
    const queued = await call(first, 'send', { id, target: before.id, turn: receiver.turn, text: 'Review route /health?mode=ready' })
    assert.equal(queued.status, 200, JSON.stringify(queued.body))
    assert.equal(queued.body.status, 'queued')
    const claimed = (await call(first, 'poll', { connection: before.id, secret: before.secret, turn: receiver.turn })).body.messages
    assert.equal(claimed.length, 1)
    assert.equal(claimed[0].status, 'uncertain')
    const nonce = claimed[0].nonce
    assert.match(nonce, /^[0-9a-f]{6}$/)

    // The hub dies before its receiver has answered; it cannot remove its lock.
    assert.equal(await killServe(first), true, 'The first hub was not ended')
    assert.equal(readFileSync(lock, 'utf8'), String(first.pid))

    const second = await serve.start(world, ['--messages-dir', messages])
    assert.notEqual(second.pid, first.pid)
    assert.equal(readFileSync(lock, 'utf8'), String(second.pid))
    const board = (await second.get('/api/board')).json()
    assert.deepEqual(board.messaging.connections, [])
    const restored = board.messaging.messages.find(one => one.id === id)
    assert.equal(restored?.status, 'uncertain')
    assert.equal(restored.error, 'DISCONNECTED')
    assert.ok(!('nonce' in restored), 'The board shows the nonce')

    // The receiver registers again as the same session. The message was bound to its old connection
    // and is not handed out again, however often it asks.
    const after = (await call(second, 'register', receiver)).body
    assert.equal(after.contested, false)
    for (let asks = 0; asks < 3; asks += 1) {
      const poll = await call(second, 'poll', { connection: after.id, secret: after.secret, turn: receiver.turn })
      assert.deepEqual(poll.body.messages, [])
    }
    // The nonce it was given before the kill still settles the message.
    const receipt = await call(second, 'receipt', { connection: after.id, secret: after.secret, id, nonce, status: 'acknowledged', reply: `ACK ${nonce}` })
    assert.equal(receipt.status, 200, JSON.stringify(receipt.body))
    const finished = (await second.get('/api/board')).json().messaging.messages.find(one => one.id === id)
    assert.equal(finished?.status, 'acknowledged')
    assert.equal(finished.text, '')
    const poll = await call(second, 'poll', { connection: after.id, secret: after.secret, turn: receiver.turn })
    assert.deepEqual(poll.body.messages, [])
    // The empty polls above show nothing unless a poll does hand a message out when one is there: the
    // killed message was open until now, and an open message keeps the receiver from being given another.
    // With it settled, a fresh message is the one thing the next poll returns.
    const fresh = 'AB-fresh-after-restart'
    const sent = await call(second, 'send', { id: fresh, target: after.id, turn: receiver.turn, text: 'Review route /ready?mode=fresh' })
    assert.equal(sent.status, 200, JSON.stringify(sent.body))
    const next = await call(second, 'poll', { connection: after.id, secret: after.secret, turn: receiver.turn })
    assert.deepEqual(next.body.messages.map(one => one.id), [fresh])
    const stored = readStore(messages)
    assert.equal(stored.length, 2)
    assert.equal(stored.find(one => one.id === id)?.claimed > 0, true)
    assert.equal(stored.find(one => one.id === fresh)?.claimed > 0, true)
  } finally { await world.close() }
})
