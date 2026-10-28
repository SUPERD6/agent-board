import { test, expect } from 'claude-code/testing'
import { emptyQuestions, observeQuestions, resolveQuestion } from '../hooks/questions'
import type { QuestionLedger } from '../hooks/questions'
import { parseProgress } from '../hooks/parse'
import { buildView, relativeTime } from '../hooks/view'
import type { View } from '../hooks/view'
import type { PendingTurn } from '../hooks/board'
import { folderOf } from '../hooks/question-merge'
import { serveModel } from '../hooks/serve'
import { STRINGS } from '../hooks/strings'

const EN = STRINGS.en
const START = Date.parse('2026-10-01T00:00:00Z')
const HOUR = 60 * 60 * 1000
const NOW = START + 3 * HOUR
const QUESTION = 'Ship the synthetic plan, OK?'

// A block of one agent's session that asks `question`; `updated` keeps it live at NOW.
const block = (session: string, agent: string, project: string, question: string, updated = NOW): string =>
  `## ${project}\n<!-- auto session=${session} agent=${agent} state=waiting updated=${new Date(updated).toISOString()} -->\n### Task ${session}\n- [?] ${question}\n<!-- /auto session=${session} -->\n`

const capture = (id: string, agent: string, project: string, text: string, at: number): PendingTurn => ({ id, agent, project, text, fullText: text, isQuestion: true, at })

// The ledger as the question pass writes it: each file read at the time given, one pass after another.
const ledgerOf = (passes: ReadonlyArray<{ text: string; at: number; pending?: PendingTurn[] }>): QuestionLedger =>
  passes.reduce((ledger, pass, index) => observeQuestions(ledger, parseProgress(pass.text), null, [], pass.at, true, `writer:${index}`, undefined, pass.pending ?? []).ledger, emptyQuestions())

const viewOf = (text: string, ledger: QuestionLedger, pending: PendingTurn[] = [], answered: string[] = [], now = NOW): View =>
  buildView(parseProgress(text), [], null, now, 0, {}, EN, answered, {}, ledger, undefined, pending)

test('the same question in a block and in an inbox capture shows as one card', () => {
  const text = block('aaaa1111', 'codex', 'demo', QUESTION)
  const pending = [capture('cccc3333', 'codex', 'demo', `  ${QUESTION} `, START + HOUR)]
  const ledger = ledgerOf([{ text, at: START }, { text, at: START + HOUR, pending }])
  // Each copy has an id of its own: the page used to match copies by that id only.
  expect(ledger.records.filter(record => record.isUnresolved)).toHaveLength(2)
  const view = viewOf(text, ledger, pending)
  expect(view.waiting).toHaveLength(1)
  // The newest source, with the age of the oldest copy.
  expect(view.waiting[0]?.key.startsWith('inbox::')).toBe(true)
  expect(view.waiting[0]?.when).toBe(relativeTime(START, NOW, EN))
  expect(serveModel(view, pending, EN).asks).toHaveLength(1)
  expect(serveModel(view, pending, EN).turns).toHaveLength(0)
  // The other copy stays in the question list.
  expect(ledger.records.filter(record => record.isUnresolved)).toHaveLength(2)
})

test('the same question in two blocks of one agent and folder shows as one card with the oldest age', () => {
  const files = [
    block('aaaa1111', 'codex', 'demo', QUESTION) + block('bbbb2222', 'codex', 'demo', `  Ship the   synthetic plan,  OK? `),
    // A Windows folder reads the same with either slash.
    block('aaaa1111', 'codex', 'C:\\work\\demo', QUESTION) + block('bbbb2222', 'codex', 'C:/work/demo/', QUESTION),
  ]
  for (const text of files) {
    const ledger = ledgerOf([{ text: text.replace(/## [^\n]*\n<!-- auto session=bbbb2222[\s\S]*$/, ''), at: START }, { text, at: START + HOUR }])
    const view = viewOf(text, ledger)
    expect(view.waiting).toHaveLength(1)
    expect(view.waiting[0]?.key).toContain('Task bbbb2222')
    expect(view.waiting[0]?.when).toBe(relativeTime(START, NOW, EN))
    expect(view.overview.waiting).toBe(1)
  }
  expect(folderOf('C:\\a\\b')).toBe(folderOf('c:/a/b/'))
  expect(folderOf('\\\\host\\share')).not.toBe(folderOf('/host/share'))
})

test('the same words from two different agents show as two cards', () => {
  const text = block('aaaa1111', 'codex', 'demo', QUESTION) + block('bbbb2222', 'claude', 'demo', QUESTION) + block('cccc3333', 'codex', 'other-folder', QUESTION)
  const ledger = ledgerOf([{ text, at: START }])
  const view = viewOf(text, ledger)
  expect(view.waiting).toHaveLength(3)
  expect(new Set(view.waiting.map(item => item.agent || 'claude'))).toEqual(new Set(['codex', 'claude']))
  expect(serveModel(view, [], EN).asks).toHaveLength(3)
  expect(view.overview.waiting).toBe(3)
})

test('hiding or answering the one card closes every copy of it', () => {
  const text = block('aaaa1111', 'codex', 'demo', QUESTION) + block('bbbb2222', 'codex', 'demo', QUESTION)
  const pending = [capture('cccc3333', 'codex', 'demo', QUESTION, START + 2 * HOUR)]
  const ledger = ledgerOf([{ text: block('aaaa1111', 'codex', 'demo', QUESTION), at: START }, { text, at: START + HOUR }, { text, at: START + 2 * HOUR, pending }])
  const view = viewOf(text, ledger, pending)
  expect(view.waiting).toHaveLength(1)
  const card = view.waiting[0]!
  // Hide: one press on the one card, and the page has no card and counts nothing.
  const hidden = viewOf(text, ledger, pending, [card.hideKey])
  expect(hidden.waiting).toHaveLength(0)
  expect(hidden.reminder ?? []).toHaveLength(0)
  expect(hidden.older ?? []).toHaveLength(0)
  expect(hidden.overview.waiting).toBe(0)
  expect(serveModel(hidden, pending, EN).counts.waiting).toBe(0)
  expect(hidden.hidden).toHaveLength(1)
  // Showing it again brings back one card, not three.
  expect(viewOf(text, ledger, pending, []).waiting).toHaveLength(1)
  // Answer: the session of the shown copy goes on after the reply, which resolves that copy.
  const answered = observeQuestions(ledger, parseProgress(text), null, [], NOW, true, 'writer:answer', undefined, [], [{ agent: 'codex', id: 'cccc3333', event: 'prompt', at: START + 2 * HOUR + 1 }]).ledger
  expect(viewOf(text, answered).waiting).toHaveLength(0)
  expect(viewOf(text, resolveQuestion(ledger, card.questionId ?? '', NOW), pending).waiting).toHaveLength(0)
  // A copy asked after the card was hidden is a new ask and shows.
  const later = text + block('dddd4444', 'codex', 'demo', QUESTION)
  const asked = ledgerOf([{ text, at: START + HOUR }, { text: later, at: NOW - 1 }])
  const first = viewOf(text, asked, [], [])
  const key = first.waiting[0]?.hideKey ?? ''
  expect(viewOf(later, asked, [], [key]).waiting.map(item => item.key)).toEqual([expect.stringContaining('Task dddd4444')])
})

test('the count beside Waiting on you counts the question once', () => {
  const text = block('aaaa1111', 'codex', 'demo', QUESTION) + block('bbbb2222', 'codex', 'demo', QUESTION)
  const pending = [capture('cccc3333', 'codex', 'demo', QUESTION, START + 2 * HOUR)]
  const ledger = ledgerOf([{ text: block('aaaa1111', 'codex', 'demo', QUESTION), at: START }, { text, at: START + HOUR }, { text, at: START + 2 * HOUR, pending }])
  const view = viewOf(text, ledger, pending)
  expect(view.overview.waiting).toBe(1)
  expect(view.waiting).toHaveLength(1)
  const model = serveModel(view, pending, EN)
  expect(model.counts.waiting).toBe(1)
  expect(model.asks).toHaveLength(1)
  // A second, different question still counts.
  const other = text + block('eeee5555', 'codex', 'demo', 'Pick a name or a date?')
  const both = viewOf(other, ledgerOf([{ text: other, at: START }]), [])
  expect(serveModel(both, [], EN).counts.waiting).toBe(2)
})

// A session that has ended and still holds the question.
const ended = (session: string, question: string, updated: number): string =>
  `## demo\n<!-- auto session=${session} agent=codex state=ended updated=${new Date(updated).toISOString()} -->\n### Task ${session}\n- [?] ${question}\n<!-- /auto session=${session} -->\n`

test('a stopped session\'s copy joins the live card instead of listing the question again', () => {
  const old = START - 10 * 24 * HOUR
  const stopped = ended('aaaa1111', QUESTION, old)
  const text = stopped + block('bbbb2222', 'codex', 'demo', QUESTION)
  const ledger = ledgerOf([{ text: stopped, at: old }, { text, at: START }])
  // Before the live copy came, the stopped session's task held the question.
  expect(viewOf(stopped, ledgerOf([{ text: stopped, at: old }])).stopped[0]?.question).toBe(QUESTION)
  const view = viewOf(text, ledger)
  // One card for the live session, with the age of the stopped session's copy; Older does not list
  // the stopped copy a second time, and the stopped task keeps its own.
  expect(view.waiting).toHaveLength(1)
  expect(view.waiting[0]?.key).toContain('Task bbbb2222')
  expect(view.waiting[0]?.when).toBe(relativeTime(old, NOW, EN))
  expect(view.older ?? []).toHaveLength(0)
  expect(view.stoppedAsking).toBeUndefined()
  expect(view.stopped).toHaveLength(1)
  expect(view.stopped[0]?.questions?.map(item => item.text)).toEqual([QUESTION])
  // Without the live copy, the stopped copy is listed under Older once.
  const alone = viewOf(stopped, ledgerOf([{ text: stopped, at: old }]))
  expect(alone.older?.map(item => item.text)).toEqual([QUESTION])
  expect(alone.stoppedAsking).toBe(1)
  // A stopped copy recorded after the live one does not take the card: the live session is the one to answer.
  const later = viewOf(text, ledgerOf([{ text: block('bbbb2222', 'codex', 'demo', QUESTION), at: START }, { text, at: START + HOUR }]))
  expect(later.waiting.map(item => item.key)).toEqual([expect.stringContaining('Task bbbb2222')])
  expect(later.overview.waiting).toBe(1)
  expect(later.older ?? []).toHaveLength(0)
})

test('two retained copies of one question show once under Older', () => {
  const old = START - 10 * 24 * HOUR
  const both = ended('aaaa1111', QUESTION, old) + ended('bbbb2222', QUESTION, old)
  // Both sessions' blocks are gone from the file; their questions stay in the question list.
  const ledger = ledgerOf([{ text: both, at: old }, { text: '## demo\n', at: old + HOUR }])
  expect(ledger.records.filter(record => record.isUnresolved)).toHaveLength(2)
  const view = viewOf('## demo\n', ledger)
  expect(view.older).toHaveLength(1)
  expect(view.waiting).toHaveLength(0)
  expect(serveModel(view, [], EN).older).toHaveLength(1)
})

test('a copy cut off in the middle of a write neither makes a card vanish nor changes its age', () => {
  const text = block('aaaa1111', 'codex', 'demo', QUESTION)
  const second = text + block('bbbb2222', 'codex', 'demo', QUESTION)
  const ledger = ledgerOf([{ text, at: START }])
  const view = viewOf(text, ledger)
  const scope = JSON.stringify(['demo', 'codex', 'bbbb2222'])
  const mid = buildView(parseProgress(second), [], null, NOW, 0, {}, EN, [], {}, ledger, undefined, [], new Set([scope]))
  // The copy being written has no record yet, so it shows as it did before and merges once it is
  // recorded; the card of the recorded copy keeps its key and its age.
  const kept = mid.waiting.filter(item => item.questionId !== undefined)
  expect(kept).toHaveLength(1)
  expect(kept[0]?.when).toBe(view.waiting[0]?.when)
  expect(kept[0]?.key).toBe(view.waiting[0]?.key)
  expect(mid.waiting.filter(item => item.questionId === undefined)).toHaveLength(1)
  const whole = viewOf(second, ledgerOf([{ text, at: START }, { text: second, at: START + HOUR }]))
  expect(whole.waiting).toHaveLength(1)
  expect(whole.waiting[0]?.when).toBe(view.waiting[0]?.when)
})
