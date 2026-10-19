import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Lang } from '../hooks/i18n'
import { isNodeSupported, isSetupState, nodeVersionOf, setupSeed, withoutSection } from '../hooks/connect-pure'
import type { SetupState } from '../hooks/connect-pure'
import { langOf } from '../hooks/strings'
import { installControlRoot, withInstallLock } from './install-control'
import { connectLegacy } from './legacy-connect'

export type LegacyConnectRequest = {
  mode: 'auto' | 'connect' | 'remove' | 'status' | 'ack' | 'language'
  home: string
  progress: string
  lang: Lang
  node: string | null
  openclawVersion?: string
  boardLang?: Lang
  acknowledgement?: { revision: number; keys: string[] }
  dirs?: Partial<Record<'codex' | 'grok' | 'hermes' | 'openclaw' | 'opencode', string>>
  seed?: { owned?: Record<string, string>; disabled?: boolean; notified?: string[]; boardLang?: Lang; setup?: SetupState }
}
type Step = { file: string; before: string | null; after: string | null; generated: boolean }
type Pending = { request: LegacyConnectRequest; bundle: string; step?: Step }
export type ConnectState = {
  version: 1
  revision: number
  disabled: boolean
  owned: Record<string, string>
  notified: string[]
  boardLang?: Lang
  setup?: SetupState
  pending?: Pending
}
const hash = (text: string): string => createHash('sha256').update(text).digest('hex')
export const readLocal = (file: string): string => {
  try { return readFileSync(file, 'utf8') } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return ''
    throw error
  }
}
export const readMaybe = (file: string): string | null => {
  try { return readLocal(file) } catch { return null }
}
const fingerprint = (file: string): string | null => existsSync(file) ? hash(readLocal(file)) : null
const atomic = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  const mode = existsSync(file) ? statSync(file).mode & 0o777 : 0o600
  const fd = openSync(temporary, 'wx', mode)
  try { writeFileSync(fd, text) } finally { closeSync(fd) }
  try { renameSync(temporary, file) } finally { if (existsSync(temporary)) unlinkSync(temporary) }
}

export class ConnectTransaction {
  readonly file: string
  readonly state: ConnectState
  private readonly observed = new Map<string, string | null>()

  constructor(home: string, seed: LegacyConnectRequest['seed']) {
    this.file = join(installControlRoot(home), 'legacy-connect.json')
    const authority = join(installControlRoot(home), 'legacy-connect-authority')
    if (existsSync(authority) && readLocal(authority) !== '1\n') throw new Error('INVALID_CONNECT_AUTHORITY')
    if (existsSync(authority) && !existsSync(this.file)) throw new Error('MISSING_CONNECT_STATE')
    if (existsSync(this.file)) {
      const state = JSON.parse(readLocal(this.file)) as ConnectState
      if (state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || typeof state.disabled !== 'boolean' || state.owned === null || typeof state.owned !== 'object' || Array.isArray(state.owned) || Object.entries(state.owned).some(([file, value]) => !isAbsolute(file) || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) || !Array.isArray(state.notified) || state.notified.some(value => typeof value !== 'string') || state.boardLang !== undefined && langOf(state.boardLang) !== state.boardLang || state.setup !== undefined && !isSetupState(state.setup)) throw new Error('INVALID_CONNECT_STATE')
      if (state.pending !== undefined) {
        if (state.pending === null || typeof state.pending !== 'object' || typeof state.pending.bundle !== 'string' || !/^[a-f0-9]{64}$/.test(state.pending.bundle)) throw new Error('INVALID_CONNECT_STATE')
        const pending = checkedRequest(state.pending.request)
        if (pending.mode === 'status' || pending.mode === 'ack' || pending.mode === 'language') throw new Error('INVALID_CONNECT_STATE')
        const step = state.pending.step
        if (step !== undefined && (step === null || typeof step !== 'object' || typeof step.file !== 'string' || !isAbsolute(step.file) || typeof step.generated !== 'boolean' || [step.before, step.after].some(value => value !== null && (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))))) throw new Error('INVALID_CONNECT_STATE')
      }
      this.state = state
    } else {
      const owned = Object.fromEntries(Object.entries(seed?.owned ?? {}).filter(([file, value]) => isAbsolute(file) && /^[a-f0-9]{64}$/.test(value)))
      this.state = { version: 1, revision: 0, disabled: seed?.disabled === true, owned, notified: seed?.notified?.filter(value => typeof value === 'string') ?? [], ...(seed?.boardLang !== undefined && langOf(seed.boardLang) === seed.boardLang ? { boardLang: seed.boardLang } : {}) }
      const setup = setupSeed(seed?.setup)
      if (setup !== undefined) this.state.setup = setup
    }
  }

  save(): void { atomic(this.file, `${JSON.stringify(this.state, null, 2)}\n`) }

  read(file: string): string {
    const text = readLocal(file)
    if (!this.observed.has(file)) this.observed.set(file, existsSync(file) ? hash(text) : null)
    return text
  }

  exists(file: string): boolean { return existsSync(file) }

  maybe(file: string): string | null { try { return this.read(file) } catch { return null } }

  previous(file: string): string | undefined {
    const text = this.read(file)
    return hash(text) === this.state.owned[file] ? text : undefined
  }

  own(file: string, text: string): void {
    if (fingerprint(file) !== hash(text)) throw new Error('INSTALL_CHANGED')
    this.state.owned[file] = hash(text)
    this.save()
  }

  // Only fingerprints and ownership metadata enter the journal. Host config and
  // credential bodies are read and merged in this process, never staged in a plan.
  change(file: string, text: string | null, generated = false): void {
    const pending = this.state.pending
    if (pending === undefined) throw new Error('NO_CONNECT_TRANSACTION')
    const before = this.observed.has(file) ? this.observed.get(file)! : fingerprint(file)
    if (fingerprint(file) !== before) throw new Error('INSTALL_CHANGED')
    pending.step = { file, before, after: text === null ? null : hash(text), generated }
    this.save()
    try {
      if (fingerprint(file) !== before) throw new Error('INSTALL_CHANGED')
      if (text === null) { if (existsSync(file)) unlinkSync(file) }
      else atomic(file, text)
      if (fingerprint(file) !== pending.step.after) throw new Error('RECOVERY_CONFLICT')
    } catch (error) {
      this.recoverStep()
      throw error
    }
    this.recoverStep()
    this.observed.set(file, text === null ? null : hash(text))
  }

  recoverStep(): void {
    const step = this.state.pending?.step
    if (step === undefined) return
    const current = fingerprint(step.file)
    if (current !== step.before && current !== step.after) throw new Error('RECOVERY_CONFLICT')
    if (current === step.after) {
      if (step.after === null) delete this.state.owned[step.file]
      else if (step.generated) this.state.owned[step.file] = step.after
    }
    delete this.state.pending!.step
    this.save()
  }

  tidy(folder: string): boolean {
    if (!existsSync(folder)) return true
    try { rmdirSync(folder); return true } catch { return readdirSync(folder).length > 0 }
  }

  dropSection(agent: string, home: string, codexHome: string, opencodeHome: string, sep: string): void {
    const files: Record<string, string[]> = { codex: [[codexHome, 'AGENTS.md'].join(sep), [codexHome, 'AGENTS.override.md'].join(sep)], gemini: [[home, '.gemini', 'GEMINI.md'].join(sep)], opencode: [[opencodeHome, 'AGENTS.md'].join(sep)] }
    for (const file of files[agent] ?? []) {
      const before = this.read(file)
      const after = withoutSection(before)
      if (after !== before) this.change(file, after)
    }
  }
}

const checkedRequest = (value: unknown): LegacyConnectRequest => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_CONNECT_REQUEST')
  const request = value as LegacyConnectRequest
  if (!['auto', 'connect', 'remove', 'status', 'ack', 'language'].includes(request.mode) || typeof request.home !== 'string' || !isAbsolute(request.home) || typeof request.progress !== 'string' || !isAbsolute(request.progress) || langOf(request.lang) !== request.lang || request.node !== null && typeof request.node !== 'string' || request.boardLang !== undefined && langOf(request.boardLang) !== request.boardLang || request.openclawVersion !== undefined && typeof request.openclawVersion !== 'string' || request.dirs !== undefined && (request.dirs === null || typeof request.dirs !== 'object' || Array.isArray(request.dirs) || Object.values(request.dirs).some(path => typeof path !== 'string' || !isAbsolute(path)))) throw new Error('INVALID_CONNECT_REQUEST')
  if (request.mode === 'ack' && (request.acknowledgement === undefined || !Number.isSafeInteger(request.acknowledgement.revision) || !Array.isArray(request.acknowledgement.keys) || request.acknowledgement.keys.some(key => typeof key !== 'string'))) throw new Error('INVALID_CONNECT_REQUEST')
  return { mode: request.mode, home: resolve(request.home), progress: resolve(request.progress), lang: request.lang, node: request.node, ...(request.openclawVersion === undefined ? {} : { openclawVersion: request.openclawVersion }), ...(request.boardLang === undefined ? {} : { boardLang: request.boardLang }), ...(request.dirs === undefined ? {} : { dirs: request.dirs }), ...(request.seed === undefined ? {} : { seed: request.seed }), ...(request.acknowledgement === undefined ? {} : { acknowledgement: request.acknowledgement }) }
}

export const legacyConnect = (value: unknown, bundle: string): { state: ConnectState; result: ReturnType<typeof connectLegacy> | null } => {
  const request = checkedRequest(value)
  if (request.node === null || nodeVersionOf(request.node) === null || !isNodeSupported(request.node) || !isNodeSupported(`v${process.versions.node}`)) throw new Error('NODE_REQUIRED')
  return withInstallLock(request.home, () => {
    const transaction = new ConnectTransaction(request.home, request.seed)
    const state = transaction.state
    if (!existsSync(transaction.file)) transaction.save()
    const authority = join(installControlRoot(request.home), 'legacy-connect-authority')
    if (!existsSync(authority)) writeFileSync(authority, '1\n', { flag: 'wx', mode: 0o600 })
    if (request.mode === 'status') return { state, result: null }
    if (request.mode === 'ack') {
      if (state.pending === undefined && request.acknowledgement?.revision === state.revision) {
        const current = new Set(state.setup?.problems.map(problem => problem.key) ?? [])
        state.notified = request.acknowledgement.keys.filter(key => current.has(key))
        transaction.save()
      }
      return { state, result: null }
    }
    const run = (one: LegacyConnectRequest): ReturnType<typeof connectLegacy> => {
      state.disabled = one.mode === 'remove' ? true : one.mode === 'connect' ? false : state.disabled
      if (one.boardLang !== undefined) state.boardLang = one.boardLang
      const { seed: _seed, ...metadata } = one
      state.pending = { request: metadata, bundle: hash(bundle) }
      transaction.save()
      const result = connectLegacy(transaction, one, bundle, process.platform === 'win32')
      state.revision += 1
      delete state.pending
      transaction.save()
      return result
    }
    if (state.pending !== undefined) {
      if (state.pending.bundle !== hash(bundle)) throw new Error('RECOVERY_BUNDLE_CHANGED')
      transaction.recoverStep()
      run(state.pending.request)
    }
    if (request.mode === 'language') {
      if (request.boardLang === undefined) throw new Error('INVALID_CONNECT_REQUEST')
      state.boardLang = request.boardLang
      state.revision += 1
      transaction.save()
      return { state, result: null }
    }
    if (request.mode === 'auto' && state.disabled) return { state, result: null }
    return { state, result: run(request) }
  }, true)
}
