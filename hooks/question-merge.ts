import type { QuestionRecord } from '../types'
import { questionWords } from './questions'
import type { WaitingItem } from './view'

// One question asked in several places shows once (#463). Two copies are the same question when
// they have the same agent, the same project folder and the same words once trimmed and with
// spaces collapsed; another agent, or another folder, is another question. Nothing is deleted:
// the other copies stay in the question list, and only the board shows one card for all of them.

// A Windows path reads the same with either slash, a trailing slash or a drive letter in either
// case; a leading `//` (a network share) is kept, so it is not taken for a path on the root.
export const folderOf = (project: string): string => {
  const path = project.trim().replace(/\\/g, '/').replace(/(.)\/{2,}/g, '$1/').replace(/(.)\/+$/, '$1')

  return /^[A-Za-z]:(\/|$)/.test(path) ? path.toLowerCase() : path
}

const copyKey = (agent: string, project: string, words: string): string => JSON.stringify([agent === '' ? 'claude' : agent.toLowerCase(), folderOf(project), words])

// Only another agent's question, or another Claude Code session's, merges, and only one the
// ledger has a record of: a copy with no record has no age and no identity yet (a block cut off in
// the middle of a write). This session's own question is answered in the pane, and a hand-kept one
// is the person's own step to tick: each stays a card of its own.
export const itemKey = (item: WaitingItem): string | null =>
  item.where !== 'other' || item.questionId === undefined ? null : copyKey(item.agent, item.project, questionWords(item.note === '' ? item.text : `${item.text} — ${item.note}`))

const recordKey = (record: QuestionRecord): string | null => {
  try {
    const [project, agent] = JSON.parse(record.scope) as unknown[]
    // A hand-kept task's scope names `manual` as its agent.
    return typeof project !== 'string' || typeof agent !== 'string' || agent === 'manual' ? null : copyKey(agent, project, record.words)
  } catch {
    return null
  }
}

// When a copy was first seen, and its place in the ledger: copies seen in the same pass share the
// time, and the ledger's order says which came last.
export type Seen = { at: number; rank: number }
const isBefore = (a: Seen, b: Seen): boolean => a.at < b.at || (a.at === b.at && a.rank < b.rank)

// For each question, and each session that asked it, the newest closed copy (answered, resolved or
// marked answered). Closing the card that was shown closes every copy of the question asked before
// it, in any other session; a copy asked after still shows. An answered copy is closed at the time
// it was answered. Two copies of one session are the ledger's own identities (a renewal, or two
// alike steps of one block), and the ledger already says which of them is closed.
export const closedCopies = (records: readonly QuestionRecord[], marked: ReadonlySet<string>): Map<string, Map<string, Seen>> => {
  const closed = new Map<string, Map<string, Seen>>()
  records.forEach((record, rank) => {
    if (record.isUnresolved !== false && !marked.has(record.id)) return
    const key = recordKey(record)
    if (key === null) return
    const at: Seen = record.isUnresolved === false && record.resolvedAt !== undefined ? { at: record.resolvedAt, rank: -1 } : { at: record.firstObserved, rank }
    const sessions = closed.get(key) ?? new Map<string, Seen>()
    const had = sessions.get(record.scope)
    if (had === undefined || isBefore(had, at)) sessions.set(record.scope, at)
    closed.set(key, sessions)
  })

  return closed
}

// `scope`: the session that asked it ('' when the ledger has no record of it). `isStale`: it
// belongs to a session that has stopped, and is listed under that session rather than as a card of
// its own.
export type Copy = { item: WaitingItem; at: number; rank: number; scope: string; isStale: boolean }

// The card each question keeps. It is the newest copy that can be acted on, so a reply goes to
// the session that asked last, and it carries the age of the oldest copy still open. The cards of
// questions that are not repeated come back as they were, in the order they came. `dropped` holds
// the stopped sessions' copies that are now shown by a card, or covered, so their sessions do not
// list them a second time. A copy with no known time is never covered, and never the newest one
// while another has a time. Copies of one session stay as they are, each its own card.
export const mergeCopies = (copies: readonly Copy[], closed: ReadonlyMap<string, ReadonlyMap<string, Seen>>): { shown: WaitingItem[]; dropped: Set<WaitingItem> } => {
  const groups = new Map<string, Copy[]>()
  for (const copy of copies) {
    const key = itemKey(copy.item)
    if (key === null) continue
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [copy])
    else group.push(copy)
  }
  const gone = new Set<WaitingItem>()
  const carried = new Map<WaitingItem, WaitingItem>()
  for (const [key, all] of groups) {
    const sessions = new Map<string, number>()
    for (const copy of all) sessions.set(copy.scope, (sessions.get(copy.scope) ?? 0) + 1)
    const group = all.filter(copy => copy.scope !== '' && sessions.get(copy.scope) === 1)
    const closedHere = [...(closed.get(key) ?? [])]
    const isCovered = (copy: Copy): boolean => copy.at > 0 && closedHere.some(([scope, seen]) => scope !== copy.scope && isBefore(copy, seen))
    const open = group.filter(copy => !isCovered(copy))
    for (const copy of group) if (!open.includes(copy)) gone.add(copy.item)
    const live = open.filter(copy => !copy.isStale)
    if (live.length === 0) continue
    const actionable = live.filter(copy => copy.item.canHide !== false)
    const newest = (actionable.length > 0 ? actionable : live).reduce((best, copy) => (isBefore(best, copy) ? copy : best))
    const known = open.filter(copy => copy.at > 0)
    const [first = newest, ...rest] = known.length > 0 ? known : open
    const oldest = rest.reduce((best, copy) => (copy.at < best.at ? copy : best), first)
    for (const copy of open) if (copy !== newest) gone.add(copy.item)
    if (oldest.item !== newest.item) carried.set(newest.item, { ...newest.item, when: oldest.item.when })
  }

  return {
    shown: copies.filter(copy => !copy.isStale && !gone.has(copy.item)).map(copy => carried.get(copy.item) ?? copy.item),
    dropped: new Set(copies.filter(copy => copy.isStale && gone.has(copy.item)).map(copy => copy.item)),
  }
}
