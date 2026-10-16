import type { ProgressCi, ProgressPr } from '../types'

// The pull request of this session's branch, from `gh pr view --json`; a machine without
// gh, or a branch without a PR, has none.

export const GH_FIELDS = 'number,url,state,isDraft,statusCheckRollup,reviewDecision'

type Check = {
  // CheckRun
  status?: string
  conclusion?: string
  // StatusContext
  state?: string
}

const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const PENDING = new Set(['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED'])

const outcomeOf = (check: Check): 'pass' | 'fail' | 'pending' => {
  if (check.state !== undefined) {
    if (FAILED.has(check.state)) return 'fail'
    return PENDING.has(check.state) ? 'pending' : 'pass'
  }
  if (check.status !== undefined && check.status !== 'COMPLETED') return 'pending'
  const conclusion = check.conclusion ?? ''
  if (FAILED.has(conclusion)) return 'fail'

  return conclusion === '' ? 'pending' : 'pass'
}

export const ciOf = (checks: readonly Check[]): { ci: ProgressCi; failed: number } => {
  if (checks.length === 0) return { ci: 'none', failed: 0 }
  const outcomes = checks.map(outcomeOf)
  const failed = outcomes.filter(one => one === 'fail').length
  if (failed > 0) return { ci: 'fail', failed }

  return { ci: outcomes.includes('pending') ? 'pending' : 'pass', failed: 0 }
}

const REVIEW: Record<string, ProgressPr['review']> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes',
  REVIEW_REQUIRED: 'required',
}

export const prFromGh = (stdout: string): ProgressPr | null => {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  const data = raw as {
    number?: unknown
    url?: unknown
    state?: unknown
    isDraft?: unknown
    statusCheckRollup?: unknown
    reviewDecision?: unknown
  }
  if (typeof data.number !== 'number' || typeof data.url !== 'string') return null
  const state = data.state === 'MERGED' ? 'merged' : data.state === 'CLOSED' ? 'closed' : 'open'
  const checks = Array.isArray(data.statusCheckRollup) ? (data.statusCheckRollup as Check[]) : []

  return {
    number: data.number,
    url: data.url,
    state,
    isDraft: data.isDraft === true,
    ...ciOf(checks),
    review: typeof data.reviewDecision === 'string' ? (REVIEW[data.reviewDecision] ?? null) : null,
  }
}

export const ciWords = (ci: ProgressCi | null, failed = 0): string => {
  if (ci === 'pass') return 'CI 通過'
  if (ci === 'fail') return failed > 0 ? `CI 失敗 ${failed}` : 'CI 失敗'
  if (ci === 'pending') return 'CI 跑中'

  return ''
}

const REVIEW_WORDS: Record<NonNullable<ProgressPr['review']>, string> = {
  approved: '已核准',
  changes: '要求修改',
  required: '等審查',
}

// `PR #12 · CI 失敗 2 · 要求修改`, in the words the pane uses.
export const prWords = (pr: ProgressPr): string =>
  [
    `PR #${pr.number}`,
    pr.state === 'merged' ? '已合併' : pr.state === 'closed' ? '已關閉' : pr.isDraft ? '草稿' : '',
    pr.state === 'open' ? ciWords(pr.ci, pr.failed) : '',
    pr.state === 'open' && pr.review !== null ? REVIEW_WORDS[pr.review] : '',
  ]
    .filter(part => part !== '')
    .join(' · ')

// A CI run that just finished, for a notification; null when nothing changed that way.
export const ciFinished = (before: ProgressPr | null, after: ProgressPr | null): string | null => {
  if (before === null || after === null || before.number !== after.number) return null
  if (before.ci !== 'pending' || (after.ci !== 'pass' && after.ci !== 'fail')) return null

  return `PR #${after.number} ${ciWords(after.ci, after.failed)}`
}
