import type { QuestionRecord } from '../types'

export const QUESTION_DAY = 24 * 60 * 60 * 1000
export type QuestionStage = 'pending' | 'reminder' | 'older'
export type QuestionAge = { stage: QuestionStage; age: number | null }

// Ask age starts at the durable observation of this incarnation. A block heartbeat, import
// time or disconnection cannot supply it. Clock rollback keeps an unknown age visible.
export const questionAge = (firstObserved: number, now: number): QuestionAge => {
  if (!Number.isFinite(firstObserved) || firstObserved <= 0 || !Number.isFinite(now) || now < firstObserved) return { stage: 'pending', age: null }
  const age = now - firstObserved
  return { stage: age > 7 * QUESTION_DAY ? 'older' : age > 3 * QUESTION_DAY ? 'reminder' : 'pending', age }
}

export type AgedQuestions<T> = { pending: T[]; reminder: T[]; older: T[]; hidden: T[] }

// Hiding by the person and age-based visibility are separate. Keep the complete original
// record in each shelf: opening a shelf never renews an ask or changes its source status.
export const ageQuestions = <T extends Pick<QuestionRecord, 'id' | 'firstObserved'>>(
  records: readonly T[],
  now: number,
  hidden: readonly string[] = [],
): AgedQuestions<T> => {
  const result: AgedQuestions<T> = { pending: [], reminder: [], older: [], hidden: [] }
  for (const record of records) result[hidden.includes(record.id) ? 'hidden' : questionAge(record.firstObserved, now).stage].push(record)
  return result
}
