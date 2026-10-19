import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

type Json = Record<string, unknown>
type Hook = { key: string; currentHash: string; sourcePath: string; eventName: string; command: string; enabled: boolean; trustStatus: string }
export type CodexHookIdentity = { event: string; command: string }
export type CodexTrustObservation = { source: string; sourceHash: string; trusted: boolean; hooks: { event: string; key: string; hash: string; trust: string }[] }

const matchingHooks = (response: Json, config: string, expected: readonly CodexHookIdentity[]): Hook[] => {
  const data = response.data
  if (!Array.isArray(data) || data.length === 0 || data.some(entry => entry === null || typeof entry !== 'object' || !Array.isArray(entry.hooks) || !Array.isArray(entry.errors) || entry.errors.length > 0)) throw new Error('HOOK_DISCOVERY_FAILED')
  const hooks = data.flatMap(entry => entry.hooks as unknown[]).filter((value): value is Hook => {
    if (value === null || typeof value !== 'object') return false
    const hook = value as Partial<Hook>
    return typeof hook.sourcePath === 'string' && resolve(hook.sourcePath) === resolve(config) && expected.some(one => one.event === hook.eventName && one.command === hook.command)
  })
  if (hooks.length !== expected.length || expected.some(one => hooks.filter(hook => hook.eventName === one.event && hook.command === one.command).length !== 1) || new Set(hooks.map(hook => hook.key)).size !== expected.length) throw new Error('OWNED_HOOKS_NOT_FOUND')
  if (hooks.some(hook => hook.enabled !== true || typeof hook.key !== 'string' || hook.key === '' || !/^sha256:[a-f0-9]{64}$/.test(hook.currentHash) || typeof hook.trustStatus !== 'string')) throw new Error('HOOK_DISABLED_OR_HASH_UNSUPPORTED')
  return hooks
}

// A control-only app-server process: no thread/read, resume, model call or transcript access.
const client = (executable: string) => {
  if (!isAbsolute(executable)) throw new Error('ABSOLUTE_CODEX_BINARY_REQUIRED')
  const child = /\.m?js$/i.test(executable) ? spawn(process.execPath, [executable, 'app-server', '--stdio'], { windowsHide: true }) : spawn(executable, ['app-server', '--stdio'], { windowsHide: true })
  let next = 0, buffer = ''
  const pending = new Map<number, { resolve: (value: Json) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const fail = (): void => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('CODEX_CONTROL_UNAVAILABLE')) }
    pending.clear()
  }
  child.on('error', fail); child.on('exit', fail)
  child.stderr.on('data', () => undefined)
  child.stdin.on('error', fail)
  child.stdout.on('data', chunk => {
    buffer += String(chunk)
    if (buffer.length > 2 * 1024 * 1024) { fail(); child.kill(); return }
    for (;;) {
      const end = buffer.indexOf('\n')
      if (end < 0) break
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
      let value: { id?: number; result?: Json; error?: unknown }
      try { value = JSON.parse(line) as typeof value } catch { continue }
      const item = value.id === undefined ? undefined : pending.get(value.id)
      if (!item) continue
      pending.delete(value.id!); clearTimeout(item.timer)
      if (value.error) item.reject(new Error('CODEX_CONTROL_REJECTED'))
      else item.resolve(value.result ?? {})
    }
  })
  const request = (method: string, params: Json): Promise<Json> => new Promise((done, reject) => {
    const id = ++next
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CODEX_CONTROL_TIMEOUT')) }, 5000)
    pending.set(id, { resolve: done, reject, timer })
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
  })
  return {
    request,
    initialize: async () => {
      await request('initialize', { clientInfo: { name: 'agent-board-hook-trust', version: '1' }, capabilities: { experimentalApi: true } })
      child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
    },
    close: () => { child.kill(); fail() },
  }
}

// A read-only observation for legacy three-event hooks as well as independent
// installations. Only Codex can report its current hashes/trust; never reproduce
// its hash algorithm or infer approval from a written hooks.json. The caller must
// recheck sourceHash before retiring its managed fallback instructions.
export const inspectCodexHooks = async (executable: string, config: string, expected: readonly CodexHookIdentity[]): Promise<CodexTrustObservation> => {
  if (expected.length === 0 || expected.length > 16 || expected.some(one => !/^[a-z][A-Za-z]+$/.test(one.event) || typeof one.command !== 'string' || one.command.trim() === '') || new Set(expected.map(one => JSON.stringify(one))).size !== expected.length) throw new Error('OWNED_HOOK_IDENTITIES_REQUIRED')
  const before = readFileSync(config)
  const control = client(executable)
  try {
    await control.initialize()
    const hooks = matchingHooks(await control.request('hooks/list', { cwds: [process.cwd()] }), config, expected)
    if (!before.equals(readFileSync(config))) throw new Error('HOOK_DEFINITION_CHANGED')
    return { source: resolve(config), sourceHash: createHash('sha256').update(before).digest('hex'), trusted: hooks.every(hook => hook.trustStatus === 'trusted'), hooks: hooks.map(hook => ({ event: hook.eventName, key: hook.key, hash: hook.currentHash, trust: hook.trustStatus })) }
  } finally { control.close() }
}

export const trustCodex = async (executable: string, config: string, groups: Record<string, unknown>, apply: boolean) => {
  const before = readFileSync(config, 'utf8')
  const expected = Object.entries(groups).map(([event, group]) => ({ event: event[0]!.toLowerCase() + event.slice(1), command: (group as { hooks: { command: string }[] }).hooks[0]!.command }))
  if (expected.length !== 6) throw new Error('SIX_OWNED_HOOKS_REQUIRED')
  const control = client(executable)
  try {
    await control.initialize()
    const list = async (): Promise<Hook[]> => {
      const response = await control.request('hooks/list', { cwds: [process.cwd()] })
      return matchingHooks(response, config, expected)
    }
    const hooks = await list()
    const values = Object.fromEntries(hooks.map(hook => [hook.key, { trusted_hash: hook.currentHash }]))
    // Hook state is a user preference even when the definitions are project-local.
    // Codex ignores project-level trust state, so never write it next to that source.
    const plan = { file: join(resolve(process.env.CODEX_HOME || join(homedir(), '.codex')), 'config.toml'), hooks: hooks.map(hook => ({ event: hook.eventName, key: hook.key, hash: hook.currentHash, trust: hook.trustStatus })), changes: hooks.filter(hook => hook.trustStatus !== 'trusted').length }
    if (!apply || plan.changes === 0) return { ...plan, applied: false }
    if (readFileSync(config, 'utf8') !== before || JSON.stringify((await list()).map(hook => [hook.key, hook.currentHash])) !== JSON.stringify(hooks.map(hook => [hook.key, hook.currentHash]))) throw new Error('HOOK_DEFINITION_CHANGED')
    // Codex performs the TOML merge. Only the reviewed declarations receive trust;
    // enabled flags, foreign hooks, comments and unrelated settings stay under its editor.
    await control.request('config/batchWrite', { filePath: plan.file, edits: [{ keyPath: 'hooks.state', value: values, mergeStrategy: 'upsert' }], reloadUserConfig: true })
    const checked = await list()
    if (checked.some(hook => hook.trustStatus !== 'trusted')) throw new Error('TRUST_NOT_CONFIRMED')
    return { ...plan, applied: true, trusted: checked.length }
  } finally { control.close() }
}
