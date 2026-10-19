// These short native launchers need only process.run argv. The engine writes code
// into a private native-allocated payload file; configuration bodies never travel
// through the staging protocol, and the verified bytes are the executed bytes.
export const CONNECT_BOOTSTRAP = `
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto')
if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('NODE_REQUIRED')
const digest = process.argv[1]
if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('INVALID_WORKER_DIGEST')
const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-board-worker-')))
fs.chmodSync(directory, 0o700)
const token = crypto.randomBytes(16).toString('hex'), file = path.join(directory, digest + '.mjs')
fs.writeFileSync(path.join(directory, '.owner'), token, { flag: 'wx', mode: 0o600 })
fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 })
process.stdout.write(JSON.stringify({ protocol: 1, directory, file, token }))
`

export const CONNECT_EXECUTE = `
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('NODE_REQUIRED')
const digest = process.argv[1], stage = JSON.parse(process.argv[2]), request = process.argv[3]
if (!/^[a-f0-9]{64}$/.test(digest) || stage.protocol !== 1 || !/^[a-f0-9]{32}$/.test(stage.token)) throw new Error('INVALID_WORKER_STAGE')
const directory = path.resolve(stage.directory), temporary = fs.realpathSync(os.tmpdir())
const relative = path.relative(temporary, directory)
if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep) || !path.basename(directory).startsWith('agent-board-worker-') || fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) throw new Error('INVALID_WORKER_STAGE')
const file = path.join(directory, digest + '.mjs'), marker = path.join(directory, '.owner')
if (stage.file !== file || fs.lstatSync(file).isSymbolicLink() || fs.lstatSync(marker).isSymbolicLink() || fs.readFileSync(marker, 'utf8') !== stage.token) throw new Error('WORKER_OWNERSHIP_LOST')
const code = fs.readFileSync(file, 'utf8')
if (crypto.createHash('sha256').update(code).digest('hex') !== digest) throw new Error('WORKER_DIGEST_CHANGED')
try {
  globalThis.AGENT_BOARD_WORKER_SOURCE = code
  process.argv = [process.execPath, file, '--legacy-connect-request', request]
  await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
} catch (error) {
  // Node's uncaught stack can repeat the entire data URL and exhaust the host's
  // output buffer before its useful error. Report only a bounded native code.
  const reason = typeof error?.code === 'string' ? error.code : error?.message
  process.stderr.write((typeof reason === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(reason) ? reason : 'WORKER_EXECUTION_FAILED') + '\\n')
  process.exitCode = 1
} finally {
  if (fs.realpathSync(directory) !== directory || fs.lstatSync(directory).isSymbolicLink() || fs.lstatSync(marker).isSymbolicLink() || fs.readFileSync(marker, 'utf8') !== stage.token) throw new Error('WORKER_OWNERSHIP_LOST')
  fs.rmSync(directory, { recursive: true, force: true })
}
`

export type WorkerStage = { protocol: 1; directory: string; file: string; token: string }
export const workerStage = (value: unknown, digest: string): WorkerStage | null => {
  if (value === null || typeof value !== 'object') return null
  const stage = value as Partial<WorkerStage>
  if (stage.protocol !== 1 || typeof stage.directory !== 'string' || !/^(?:[a-zA-Z]:[\\/]|\/)/.test(stage.directory) || !/[\\/]agent-board-worker-[^\\/]+$/.test(stage.directory) || typeof stage.file !== 'string' || typeof stage.token !== 'string' || !/^[a-f0-9]{32}$/.test(stage.token) || !/^[a-f0-9]{64}$/.test(digest)) return null
  const normalized = stage.directory.replace(/\\/g, '/') + '/' + digest + '.mjs'
  if (stage.file.replace(/\\/g, '/') !== normalized) return null
  return stage as WorkerStage
}

export const workerRequest = (value: unknown): string | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['mode', 'home', 'progress', 'lang', 'node', 'openclawVersion', 'boardLang', 'dirs', 'seed', 'acknowledgement'].includes(key))) return null
  const seed = (value as { seed?: unknown }).seed
  if (seed !== undefined) {
    if (seed === null || typeof seed !== 'object' || Array.isArray(seed) || Object.keys(seed).some(key => !['owned', 'disabled', 'notified', 'boardLang', 'setup'].includes(key))) return null
    const owned = (seed as { owned?: unknown }).owned
    if (owned !== undefined && (owned === null || typeof owned !== 'object' || Array.isArray(owned) || Object.values(owned).some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)))) return null
  }
  const text = JSON.stringify(value)
  return typeof text === 'string' && text.length <= 12000 ? text : null
}
