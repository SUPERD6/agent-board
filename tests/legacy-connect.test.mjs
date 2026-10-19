import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const source = readFileSync(new URL('../hooks/board-script.ts', import.meta.url), 'utf8')
const bundle = JSON.parse(source.slice(source.indexOf('export const BOARD_SCRIPT = ') + 'export const BOARD_SCRIPT = '.length))
const fixture = async fn => {
  const home = mkdtempSync(join(tmpdir(), 'legacy-connect-'))
  const script = join(home, 'worker.mjs')
  const progress = join(home, 'data-a', 'progress.md')
  const config = join(home, '.codex', 'hooks.json')
  const control = join(home, '.agent-board', 'legacy-connect.json')
  const lock = join(home, '.agent-board', 'install.lock')
  mkdirSync(join(home, '.codex'))
  const foreign = { private: 'NEVER_STAGE_SECRET', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'foreign-command' }] }] } }
  writeFileSync(config, JSON.stringify(foreign))
  writeFileSync(script, bundle)
  const request = (mode, extra = {}) => ({ mode, home, progress, lang: 'en', node: process.version, ...extra })
  const command = (value, options = {}) => spawnSync(process.execPath, [script, '--legacy-connect-request', JSON.stringify(value)], { encoding: 'utf8', windowsHide: true, timeout: 10000, ...options })
  const run = value => {
    const result = command(value)
    assert.equal(result.status, 0, result.stderr + result.stdout)
    return JSON.parse(result.stdout)
  }
  try { return await fn({ home, script, progress, config, control, lock, foreign, request, command, run }) }
  finally { rmSync(home, { recursive: true, force: true }) }
}

const waitFor = async file => {
  const until = Date.now() + 8000
  while (!existsSync(file)) {
    if (Date.now() > until) throw new Error(`FIXTURE_TIMEOUT:${file}`)
    await delay(10)
  }
}
const preload = (f, phase, extra = {}) => {
  const file = join(f.home, `intercept-${phase}.mjs`)
  const reached = join(f.home, `${phase}.reached`), release = join(f.home, `${phase}.release`)
  writeFileSync(file, `
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const options = ${JSON.stringify({ control: f.control, config: f.config, reached, release, phase, ...extra })}
const rename = fs.renameSync
let held = false
fs.renameSync = (from, to) => {
  const value = to === options.control ? JSON.parse(fs.readFileSync(from, 'utf8')) : null
  if (!held && options.phase === 'drift' && value?.pending?.step?.file === options.config) {
    held = true
    fs.writeFileSync(options.config, JSON.stringify({ private: 'NEVER_STAGE_SECRET', external: 'new foreign work' }))
  }
  const result = rename(from, to)
  const pause = options.phase === 'intent' ? to === options.control && value?.pending && !value.pending.step : options.phase === 'applied' && to === options.config
  if (!held && pause) {
    held = true
    fs.writeFileSync(options.reached, '')
    const until = Date.now() + 10000
    while (!fs.existsSync(options.release)) {
      if (Date.now() > until) throw new Error('FIXTURE_RELEASE_TIMEOUT')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
  return result
}
syncBuiltinESMExports()
`)
  return { file: pathToFileURL(file).href, reached, release }
}
const child = (f, value, intercept) => {
  const process = spawn(globalThis.process.execPath, [...(intercept ? ['--import', intercept.file] : []), f.script, '--legacy-connect-request', JSON.stringify(value)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  process.stderr.on('data', data => { output += data })
  process.stdout.on('data', data => { output += data })
  return { process, exited: once(process, 'exit'), output: () => output }
}

for (const lang of ['en', 'zh-TW', 'zh-CN']) test(`native legacy connect and remove preserve foreign configuration and own every generated file in ${lang}`, () => fixture(async f => {
  const connected = f.run(f.request('connect', { lang }))
  assert.equal(connected.state.disabled, false)
  assert.ok(connected.result.done.includes('Codex'))
  assert.equal(JSON.parse(readFileSync(f.config)).private, f.foreign.private)
  assert.ok(JSON.stringify(JSON.parse(readFileSync(f.config))).includes('foreign-command'))
  assert.ok(Object.keys(connected.state.owned).some(file => file.endsWith('agent-board.mjs')))
  assert.ok(!readFileSync(f.control, 'utf8').includes(f.foreign.private))
  assert.ok(!readFileSync(f.control, 'utf8').includes('foreign-command'))
  const removed = f.run(f.request('remove', { lang }))
  assert.equal(removed.state.disabled, true)
  assert.deepEqual(JSON.parse(readFileSync(f.config)), f.foreign)
  assert.ok(!existsSync(join(f.home, 'data-a', 'agent-board.mjs')))
  assert.ok(existsSync(join(f.home, 'data-a', `progress-report.${process.platform === 'win32' ? 'ps1' : 'sh'}`)))
}))

test('a delayed automatic request cannot undo remove and explicit connect re-enables under native authority', () => fixture(async f => {
  const preparedBeforeRemove = f.request('auto', { seed: { disabled: false } })
  f.run(f.request('connect'))
  f.run(f.request('remove'))
  const before = readFileSync(f.config, 'utf8')
  const late = f.run(preparedBeforeRemove)
  assert.equal(late.result, null)
  assert.equal(late.state.disabled, true)
  assert.equal(readFileSync(f.config, 'utf8'), before)
  assert.equal(f.run(f.request('connect')).state.disabled, false)
}))

test('the first disabled automatic seed becomes durable and a missing migrated authority fails closed', () => fixture(async f => {
  const initial = f.run(f.request('auto', { seed: { disabled: true } }))
  assert.equal(initial.result, null)
  assert.equal(JSON.parse(readFileSync(f.control)).disabled, true)
  assert.equal(f.run(f.request('auto', { seed: { disabled: false } })).state.disabled, true)
  const original = readFileSync(f.config, 'utf8')
  unlinkSync(f.control)
  const missing = f.command(f.request('auto', { seed: { disabled: false } }))
  assert.notEqual(missing.status, 0)
  assert.ok((missing.stderr + missing.stdout).includes('MISSING_CONNECT_STATE'))
  assert.equal(readFileSync(f.config, 'utf8'), original)
  assert.equal(existsSync(f.control), false)
}))

test('language and notification metadata use native revisions without changing disable authority', () => fixture(async f => {
  const first = f.run(f.request('auto', { seed: { disabled: true, boardLang: 'en' } }))
  const chosen = f.run(f.request('language', { boardLang: 'zh-TW' }))
  assert.equal(chosen.state.boardLang, 'zh-TW')
  assert.equal(chosen.state.disabled, true)
  f.run(f.request('ack', { acknowledgement: { revision: first.state.revision, keys: ['old'] } }))
  const status = f.run(f.request('status'))
  assert.equal(status.state.revision, chosen.state.revision)
  assert.equal(status.state.boardLang, 'zh-TW')
  assert.deepEqual(status.state.notified, [])
}))

test('native connect preserves edited generated files and rejects drift without staging host bodies', () => fixture(async f => {
  f.run(f.request('connect'))
  const board = join(f.home, 'data-a', 'agent-board.mjs')
  const edited = readFileSync(board, 'utf8') + '\n// Personal edit\n'
  writeFileSync(board, edited)
  const result = f.run(f.request('connect'))
  assert.ok(result.result.problems.some(problem => problem.key === `preserved:${board}`))
  assert.equal(readFileSync(board, 'utf8'), edited)
  const hookBytes = readFileSync(f.config, 'utf8')
  assert.ok(hookBytes.includes('foreign-command'))
  assert.ok(!readFileSync(f.control, 'utf8').includes('NEVER_STAGE_SECRET'))
}))

test('missing and unsupported Node observations fail closed before creating transaction state', () => fixture(async f => {
  const original = readFileSync(f.config, 'utf8')
  for (const node of [null, 'v16.0.0']) {
    const result = f.command(f.request('remove', { node }))
    assert.notEqual(result.status, 0)
    assert.ok((result.stderr + result.stdout).includes('NODE_REQUIRED'))
    assert.equal(readFileSync(f.config, 'utf8'), original)
    assert.equal(existsSync(f.control), false)
  }
}))

test('a paused live worker fences legacy remove and the independent installer across data roots', () => fixture(async f => {
  const intercept = preload(f, 'intent')
  const held = child(f, f.request('connect'), intercept)
  try {
    await waitFor(intercept.reached)
    utimesSync(f.lock, new Date(0), new Date(0))
    const remove = f.command(f.request('remove', { progress: join(f.home, 'data-b', 'progress.md') }))
    assert.notEqual(remove.status, 0)
    assert.ok((remove.stderr + remove.stdout).includes('LOCK_BUSY'))
    const native = spawnSync(process.execPath, [f.script, '--codex-setup', '--home', f.home, '--data-dir', join(f.home, 'native-other-data'), '--progress-file', join(f.home, 'native-other-data', 'progress.md'), '--codex-dir', join(f.home, '.codex'), '--apply'], { encoding: 'utf8', windowsHide: true, timeout: 8000 })
    assert.notEqual(native.status, 0)
    assert.ok((native.stderr + native.stdout).includes('LOCK_BUSY'))
    writeFileSync(intercept.release, '')
    assert.equal((await held.exited)[0], 0, held.output())
    assert.equal(f.run(f.request('remove')).state.disabled, true)
  } finally {
    if (held.process.exitCode === null) { held.process.kill(); await held.exited }
  }
}))

test('a killed writer resumes fingerprint journal recovery before removal without retaining credential bodies', () => fixture(async f => {
  const intercept = preload(f, 'applied')
  const held = child(f, f.request('connect'), intercept)
  try {
    await waitFor(intercept.reached)
    const pending = readFileSync(f.control, 'utf8')
    assert.ok(JSON.parse(pending).pending.step)
    assert.ok(!pending.includes('NEVER_STAGE_SECRET'))
    held.process.kill('SIGKILL')
    await held.exited
    utimesSync(f.lock, new Date(0), new Date(0))
    const removed = f.run(f.request('remove'))
    assert.equal(removed.state.pending, undefined)
    assert.equal(removed.state.disabled, true)
    assert.deepEqual(JSON.parse(readFileSync(f.config)), f.foreign)
  } finally {
    if (held.process.exitCode === null && held.process.signalCode === null) { held.process.kill(); await held.exited }
  }
}))

test('configuration drift after the journal is prepared is retained as an explicit recovery conflict', () => fixture(async f => {
  const intercept = preload(f, 'drift')
  const result = f.command(f.request('connect'), { execArgv: [], env: { ...process.env, NODE_OPTIONS: `--import=${intercept.file}` } })
  assert.notEqual(result.status, 0)
  assert.ok((result.stderr + result.stdout).includes('RECOVERY_CONFLICT'))
  assert.equal(JSON.parse(readFileSync(f.config)).external, 'new foreign work')
  assert.ok(JSON.parse(readFileSync(f.control)).pending.step)
  assert.ok(!readFileSync(f.control, 'utf8').includes('NEVER_STAGE_SECRET'))
}))

test('a killed remove keeps its disable intent and a delayed auto finishes recovery without reinstalling', () => fixture(async f => {
  f.run(f.request('connect'))
  const delayed = f.request('auto', { seed: { disabled: false } })
  const intercept = preload(f, 'intent')
  const held = child(f, f.request('remove'), intercept)
  try {
    await waitFor(intercept.reached)
    assert.equal(JSON.parse(readFileSync(f.control)).disabled, true)
    held.process.kill('SIGKILL')
    await held.exited
    utimesSync(f.lock, new Date(0), new Date(0))
    const late = f.run(delayed)
    assert.equal(late.state.disabled, true)
    assert.equal(late.state.pending, undefined)
    assert.equal(late.result, null)
    assert.deepEqual(JSON.parse(readFileSync(f.config)), f.foreign)
  } finally {
    if (held.process.exitCode === null && held.process.signalCode === null) { held.process.kill(); await held.exited }
  }
}))

test('initial native status migrates only recognized display metadata and ignores later SDK seeds', () => fixture(async f => {
  const setup = { agents: [{ agent: 'codex', label: 'Codex', hook: 'configured', board: 'ready', unknown: 'ignored' }], problems: [{ key: 'node:missing', message: 'setupNodeMissing', args: [18], unknown: 'ignored' }, { key: 'unknown', message: 'notAStringKey', args: [] }, { key: 'old', text: 'old unstructured prose' }], node: null, unknown: 'ignored' }
  const before = readFileSync(f.config, 'utf8')
  const initial = f.run(f.request('status', { seed: { setup } }))
  assert.deepEqual(initial.state.setup, { agents: [{ agent: 'codex', label: 'Codex', hook: 'configured', board: 'ready' }], problems: [{ key: 'node:missing', message: 'setupNodeMissing', args: [18] }], node: null })
  assert.equal(readFileSync(f.config, 'utf8'), before)
  assert.deepEqual(f.run(f.request('status', { seed: { setup: { agents: [], problems: [], node: process.version } } })).state.setup, initial.state.setup)
}))

test('native language preference at an explicit connect wins and delayed automatic seeds cannot revert it', () => fixture(async f => {
  f.run(f.request('connect', { seed: { boardLang: 'en' } }))
  const changed = f.run(f.request('connect', { boardLang: 'zh-TW' }))
  assert.equal(changed.state.boardLang, 'zh-TW')
  const delayed = f.run(f.request('auto', { seed: { boardLang: 'en' } }))
  assert.equal(delayed.state.boardLang, 'zh-TW')
  assert.ok(readFileSync(join(f.home, 'data-a', 'agent-board.mjs'), 'utf8').startsWith('globalThis.AGENT_BOARD = '))
  assert.ok(readFileSync(join(f.home, 'data-a', 'agent-board.mjs'), 'utf8').split('\n')[0].includes('zh-TW'))
}))

test('concurrent native connect and remove serialize their ownership and disable state', () => fixture(async f => {
  const first = child(f, f.request('connect'))
  const second = child(f, f.request('remove'))
  const results = await Promise.all([first.exited, second.exited])
  assert.equal(results[0][0], 0, first.output())
  assert.equal(results[1][0], 0, second.output())
  const state = JSON.parse(readFileSync(f.control))
  assert.equal(state.revision, 2)
  assert.equal(state.pending, undefined)
  const config = readFileSync(f.config, 'utf8')
  assert.equal(config.includes('progress-report.'), !state.disabled)
  assert.equal(JSON.parse(config).private, f.foreign.private)
}))
