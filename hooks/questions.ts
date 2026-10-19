import type { ProgressMirror, ProgressProject, QuestionLedger, QuestionProofs, QuestionRecord } from '../types'
import { scanBlocks, shortId, stepWords } from './blocks'
import { questionToken, waitsOnYou } from './mirror'
import { sha256 } from './sha256'

export type { QuestionLedger, QuestionProofs, QuestionRecord } from '../types'

export const emptyQuestions = (): QuestionLedger => ({ version: 1, next: 1, records: [], legacy: {} })
export const questionsPath = (path: string): string => `${path.replace(/\.md$/i, '')}-questions.json`
export const questionWords = (text: string): string => text.trim().replace(/\s+/g, ' ')
export const questionScope = (project: string, agent: string, session: string): string => JSON.stringify([project, agent || 'claude', session])
export const questionSlot = (scope: string, index: number): string => JSON.stringify([scope, index])
export const migrationKey = (legacy: string): string => `question-migrated:${sha256(legacy)}`
export const isQuestionSnapshot = (text: string): boolean => scanBlocks(text.split(/\r?\n/)).every(span => span.isClosed)
export const questionProofPath = (path: string, kind: keyof QuestionProofs, hash: string): string => `${path.replace(/\.md$/i, '')}-questions-${kind}-${hash}.json`
export const questionProofOf = (path: string, name: string): { kind: keyof QuestionProofs; hash: string } | null => {
  const prefix = `${path.replace(/\\/g, '/').split('/').at(-1)?.replace(/\.md$/i, '')}-questions-`
  if (!name.startsWith(prefix)) return null
  const match = /^(retired|consumed)-([a-f0-9]{64})\.json$/.exec(name.slice(prefix.length))
  return match === null ? null : { kind: match[1] as keyof QuestionProofs, hash: match[2] ?? '' }
}
export const questionProofJson = (kind: keyof QuestionProofs, hash: string): string => `${JSON.stringify({ version: 1, kind, hash })}\n`
export const isQuestionProof = (text: string, kind: keyof QuestionProofs, hash: string): boolean => text === questionProofJson(kind, hash)

// Invalid data stays on disk: unlike an acknowledgement, a lost identity could attach an old
// hide to a renewed question. A caller must preserve its last good record and refuse writes.
export const parseQuestions = (text: string, isMissing = false): QuestionLedger | null => {
  if (text.trim() === '') return isMissing ? emptyQuestions() : null
  try {
    const data = JSON.parse(text) as QuestionLedger
    if (data.version !== 1 || !Number.isSafeInteger(data.next) || data.next < 1 || !Array.isArray(data.records) || data.legacy === null || typeof data.legacy !== 'object' || Array.isArray(data.legacy)) return null
    const ids = new Set<string>()
    for (const row of data.records) {
      if (row === null || typeof row !== 'object' || !/^question:[a-f0-9]{64}:\d+$/.test(row.id) || ids.has(row.id) || typeof row.scope !== 'string' || typeof row.words !== 'string' || typeof row.incarnation !== 'string' || !Number.isSafeInteger(row.occurrence) || row.occurrence < 1 || !Number.isSafeInteger(row.copies) || row.copies < row.occurrence || typeof row.isWaiting !== 'boolean' || typeof row.isPresent !== 'boolean' || !Number.isFinite(row.firstObserved) || row.firstObserved < 0 || Number(row.id.slice(row.id.lastIndexOf(':') + 1)) >= data.next) return null
      if (row.id.split(':')[1] !== sha256(JSON.stringify([row.scope, row.words, row.occurrence, row.copies, row.incarnation]))) return null
      if (row.producer !== undefined && typeof row.producer !== 'string') return null
      ids.add(row.id)
    }
    if (Object.values(data.legacy).some(id => typeof id !== 'string' || (id !== '' && !ids.has(id)))) return null
    return data
  } catch {
    return null
  }
}

export const questionsJson = (ledger: QuestionLedger): string => `${JSON.stringify(ledger, null, 2)}\n`

type Observation = { scope: string; session: string; index: number; text: string; isWaiting: boolean; producer: string }

const observations = (projects: readonly ProgressProject[], mine: ProgressMirror | null): Observation[] => {
  const own = mine === null ? '' : shortId(mine.sessionId)
  const rows: Observation[] = []
  const scopes = new Set<string>()
  const ambiguous = new Set<string>()
  for (const project of projects) {
    for (const task of project.tasks) {
      if (task.auto === null || (mine !== null && task.auto.session === own)) continue
      const scope = questionScope(project.name, task.auto.agent, task.auto.session)
      if (scopes.has(scope)) ambiguous.add(scope)
      scopes.add(scope)
      task.steps.forEach((step, index) => rows.push({ scope, session: task.auto?.session ?? '', index, text: step.text, isWaiting: step.status === 'waiting', producer: step.questionToken ?? '' }))
    }
  }
  if (mine !== null) {
    const scope = questionScope(mine.project, 'claude', own)
    mine.tasks.forEach((task, index) => rows.push({ scope, session: own, index, text: stepWords(task).trim(), isWaiting: waitsOnYou(mine, task) && task.blocked === null, producer: questionToken(task) }))
  }
  const tokens = new Map<string, number>()
  for (const row of rows) {
    if (row.producer !== '') {
      const key = JSON.stringify([row.scope, row.producer])
      tokens.set(key, (tokens.get(key) ?? 0) + 1)
    }
  }
  return rows.filter(row => !ambiguous.has(row.scope) && (row.producer === '' || tokens.get(JSON.stringify([row.scope, row.producer])) === 1))
}

// Words identify candidates, not questions. A durable sequence identifies each incarnation;
// observed resolution or absence starts a new one. Equal-word steps retain separate slots
// across unrelated edits; changing their multiplicity is ambiguous and retires their hides.
export const observeQuestions = (
  ledger: QuestionLedger,
  projects: readonly ProgressProject[],
  mine: ProgressMirror | null,
  answered: readonly string[],
  now: number,
  isSettled = false,
  incarnation = 'preview',
  proofs: QuestionProofs = { retired: [], consumed: [] },
): { ledger: QuestionLedger; keys: Record<string, string>; marked: string[] } => {
  const rows = observations(projects, mine)
  const records = ledger.records.map(row => ({ ...row }))
  for (const record of records) {
    if (proofs.retired.includes(sha256(record.id))) {
      record.isPresent = false
      record.isWaiting = false
    }
  }
  const legacy = { ...ledger.legacy }
  const keys: Record<string, string> = {}
  const assigned = new Set<string>()
  const groups = new Map<string, Observation[]>()
  for (const row of rows) {
    const group = JSON.stringify([row.scope, questionWords(row.text)])
    groups.set(group, [...(groups.get(group) ?? []), row])
  }
  // If the ledger was removed, never reuse an id still held by an acknowledgement.
  const acknowledged = answered.filter(key => /^question:[a-f0-9]{64}:\d+$/.test(key)).map(key => Number(key.slice(key.lastIndexOf(':') + 1)) + 1).filter(Number.isSafeInteger)
  let next = acknowledged.reduce((latest, value) => Math.max(latest, value), ledger.next)
  for (const alike of groups.values()) {
    const first = alike[0]
    if (first === undefined) continue
    const words = questionWords(first.text)
    const candidates = records.filter(row => row.scope === first.scope && row.words === words && row.isPresent)
    const isAmbiguous = candidates.some(row => !row.producer && row.copies !== alike.length)
    if (isAmbiguous) for (const old of candidates.filter(record => !record.producer)) {
      old.isPresent = false
      old.isWaiting = false
    }
    alike.forEach((row, index) => {
      const occurrence = index + 1
      if (row.producer !== '') {
        const owner = row.producer.split(':')[0]
        for (const old of records) {
          if (old.scope === row.scope && old.producer?.split(':')[0] === owner && old.producer !== row.producer) {
            old.isPresent = false
            old.isWaiting = false
          }
        }
      }
      let record = row.producer === ''
        ? isAmbiguous ? undefined : candidates.find(old => !old.producer && old.occurrence === occurrence)
        : candidates.find(old => old.producer === row.producer && old.isPresent)
      if (record !== undefined && (record.producer ?? '') !== row.producer) {
        record.isPresent = false
        record.isWaiting = false
        record = undefined
      }
      if (row.isWaiting && (record === undefined || !record.isWaiting)) {
        if (record !== undefined) record.isPresent = false
        const binding = sha256(JSON.stringify([row.scope, words, occurrence, alike.length, incarnation]))
        record = { id: `question:${binding}:${next++}`, scope: row.scope, words, occurrence, copies: alike.length, isWaiting: true, isPresent: true, firstObserved: Number.isFinite(now) && now > 0 ? now : 0, incarnation, producer: row.producer }
        records.push(record)
      }
      if (record === undefined) return
      record.isWaiting = row.isWaiting
      assigned.add(record.id)
      if (row.isWaiting) keys[questionSlot(row.scope, row.index)] = record.id
    })
  }
  if (isSettled) {
    for (const record of records) {
      if (!assigned.has(record.id)) {
        record.isPresent = false
        record.isWaiting = false
      }
    }
  }
  // A historical position cannot tell equal-word duplicates apart after movement. Migrate
  // only one candidate in one scope; retain ambiguous marks without applying a future hide.
  for (const key of answered) {
    if (key.startsWith('question:') || Object.hasOwn(legacy, key) || answered.includes(migrationKey(key)) || proofs.consumed.includes(sha256(key))) continue
    const match = /^(\S+) (\d+) ([\s\S]*)$/.exec(key)
    if (match === null) continue
    const [, session, , text = ''] = match
    const candidates = rows.filter(row => row.session === session && row.isWaiting && questionWords(row.text) === questionWords(text))
    const picked = candidates.length === 1 ? candidates[0] : undefined
    if (picked !== undefined) legacy[key] = keys[questionSlot(picked.scope, picked.index)] ?? ''
    else if (isSettled && rows.some(row => row.session === session)) legacy[key] = ''
  }
  return {
    ledger: { version: 1, next, records, legacy: isSettled ? legacy : ledger.legacy },
    keys,
    marked: answered.map(key => answered.includes(migrationKey(key)) || proofs.consumed.includes(sha256(key)) ? '' : legacy[key] ?? key).filter(key => key !== ''),
  }
}

export const acknowledgementKeys = (ledger: QuestionLedger, id: string): string[] =>
  [id, ...Object.entries(ledger.legacy).filter(([, target]) => target === id).flatMap(([key]) => [key, migrationKey(key)])]

// The migration marker and its target live in one acknowledgement write. Losing a separate
// ledger write can therefore resurface a question, but cannot reassign its historical hide.
export const migratedAnswered = (answered: readonly string[], ledger: QuestionLedger, consumed: readonly string[] = []): string[] => {
  const next = [...answered]
  for (const [key, target] of Object.entries(ledger.legacy)) {
    if (!answered.includes(key) || answered.includes(migrationKey(key)) || consumed.includes(sha256(key))) continue
    if (target !== '' && !next.includes(target)) next.push(target)
    next.push(migrationKey(key))
  }
  return next
}
