import type { ProgressAuto, ProgressMirror, ProgressProject, ProgressStepStatus, ProgressTask } from '../types'
import { shortId } from './blocks'
import { ciWords, prWords } from './github'
import { doingTask, fallbackTitle } from './mirror'
import { countSteps, currentStepIndex, isHereProject, isTaskComplete } from './parse'

// What the pane shows, worked out from the file and this session's own list, so the
// drawing code only lays it out.

export type Tone = 'accent' | 'warn' | 'alert' | 'quiet'

export type ViewStep = { text: string; status: ProgressStepStatus; depth: number; isCurrent: boolean }

export type CurrentView = {
  state: ProgressMirror['state']
  project: string
  title: string
  status: string
  tone: Tone
  done: number
  total: number
  steps: ViewStep[]
}

// A step of a hand-kept task, addressed so a press can tick exactly the line it showed.
export type StepRef = { project: string; title: string; step: string; line: number; raw: string }

export type WaitingItem = {
  key: string
  project: string
  text: string
  when: string
  // A hand-kept step can be ticked from the pane; another session's cannot.
  step: StepRef | null
}

export type TaskRow = {
  key: string
  project: string
  title: string
  done: number
  total: number
  status: string
  tone: Tone
  when: string
  isHere: boolean
  auto: 'working' | 'waiting' | 'ended' | null
  steps: ViewStep[]
  // Every open step, unfolded: what a take-over hands on.
  left: string[]
  next: StepRef | null
  due: { date: string; left: string; tone: Tone } | null
  // Another session's pull request, in words (`PR #12 · CI 失敗`), or ''.
  pr: string
  // For an ended session: the command that reopens it, ready to paste.
  resume: string | null
}

// This session's pull request, for the card.
export type PrView = { text: string; url: string; tone: Tone }

export type DoneItem = { project: string; title: string; when: string }

export type View = {
  current: CurrentView | null
  pr: PrView | null
  waiting: WaitingItem[]
  due: TaskRow[]
  active: TaskRow[]
  recent: DoneItem[]
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const relativeTime = (then: number, now: number): string => {
  if (then <= 0) return ''
  const gap = Math.max(0, now - then)
  if (gap < MINUTE) return '剛剛'
  if (gap < HOUR) return `${Math.floor(gap / MINUTE)} 分鐘前`
  if (gap < DAY) return `${Math.floor(gap / HOUR)} 小時前`
  if (gap < 2 * DAY) return '昨天'

  return `${Math.floor(gap / DAY)} 天前`
}

// `10-31` or `2026-10-31`; a date with no year is the nearest one, at most two months back.
export const dueDays = (due: string, now: number): number | null => {
  const parts = due.split('-').map(Number)
  const today = new Date(now)
  const [year, month, day] =
    parts.length === 3 ? parts : [today.getUTCFullYear(), parts[0] ?? Number.NaN, parts[1] ?? Number.NaN]
  if (year === undefined || month === undefined || day === undefined) return null
  if ([year, month, day].some(Number.isNaN)) return null
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  let target = Date.UTC(year, month - 1, day)
  if (parts.length === 2 && target < midnight - 60 * DAY) target = Date.UTC(year + 1, month - 1, day)

  return Math.round((target - midnight) / DAY)
}

const dueLabel = (days: number): { left: string; tone: Tone } => {
  if (days < 0) return { left: `已過 ${-days} 天`, tone: 'alert' }
  if (days === 0) return { left: '今天截止', tone: 'alert' }
  if (days <= 3) return { left: `還有 ${days} 天`, tone: 'alert' }

  return { left: `還有 ${days} 天`, tone: days <= 7 ? 'warn' : 'quiet' }
}

const stepPhrase = (task: ProgressTask): { status: string; tone: Tone } => {
  const blocked = task.steps.find(step => step.status === 'blocked')
  if (blocked !== undefined) return { status: `卡住：${blocked.text}`, tone: 'alert' }
  const waiting = task.steps.find(step => step.status === 'waiting')
  if (waiting !== undefined) return { status: `等你：${waiting.text}`, tone: 'warn' }
  const running = task.steps.find(step => step.status === 'running')
  if (running !== undefined) return { status: `在跑：${running.text}`, tone: 'accent' }
  const current = task.steps[currentStepIndex(task)]
  if (current === undefined) return { status: '還沒列步驟', tone: 'quiet' }

  return { status: `${current.status === 'doing' ? '正在做' : '下一步'}：${current.text}`, tone: 'quiet' }
}

// Every status a glyph carries is also said in words.
const SUFFIX: Record<ProgressStepStatus, (reason: string) => string> = {
  done: () => '',
  doing: () => '',
  todo: () => '',
  cancelled: () => '（取消）',
  waiting: () => '（等你）',
  running: () => '（在跑）',
  blocked: reason => (reason === '' ? '（卡住）' : `（卡住：${reason}）`),
}

// Long lists keep the open steps in view: finished ones fold into one line, and past
// `room` open steps the rest fold into a count.
export const foldSteps = (steps: readonly ViewStep[], room = 6): ViewStep[] => {
  if (steps.length <= room + 1) return [...steps]
  const done = steps.filter(step => step.status === 'done' || step.status === 'cancelled')
  const open = steps.filter(step => step.status !== 'done' && step.status !== 'cancelled')
  const shown = open.slice(0, room)
  const rest = open.length - shown.length

  return [
    ...(done.length === 0 ? [] : [{ text: `已完成 ${done.length} 步`, status: 'done' as const, depth: 0, isCurrent: false }]),
    ...shown,
    ...(rest === 0 ? [] : [{ text: `還有 ${rest} 步`, status: 'todo' as const, depth: 0, isCurrent: false }]),
  ]
}

const currentOf = (mirror: ProgressMirror): CurrentView | null => {
  if (mirror.tasks.length === 0) return null
  const doing = doingTask(mirror)
  const waitingYou = mirror.tasks.find(task => task.status !== 'completed' && task.waiting === 'you')
  const blocked = mirror.tasks.find(task => task.status !== 'completed' && task.blocked !== null)
  const done = mirror.tasks.filter(task => task.status === 'completed').length
  let status = '等你回覆'
  let tone: Tone = 'warn'
  if (mirror.state === 'done') {
    status = '全部完成'
    tone = 'quiet'
  } else if (waitingYou !== undefined) {
    status = `等你：${waitingYou.subject}`
  } else if (blocked !== undefined) {
    status = `卡住：${blocked.blocked || blocked.subject}`
    tone = 'alert'
  } else if (mirror.state === 'working') {
    status = doing === undefined ? 'Claude 正在做' : `正在做：${doing.activeForm || doing.subject}`
    tone = 'accent'
  }
  const steps = mirror.tasks.map(task => {
    let stepStatus: ProgressStepStatus = task.status === 'completed' ? 'done' : 'todo'
    if (task.status !== 'completed') {
      if (task.blocked !== null) stepStatus = 'blocked'
      else if (task.waiting === 'you') stepStatus = 'waiting'
      else if (task.waiting === 'run') stepStatus = 'running'
      else if (task.status === 'in_progress') stepStatus = 'doing'
    }
    return { text: `${task.subject}${SUFFIX[stepStatus](task.blocked ?? '')}`, status: stepStatus, depth: 0, isCurrent: task === doing }
  })

  return {
    state: mirror.state,
    project: mirror.project,
    title: mirror.title || fallbackTitle(mirror),
    status,
    tone,
    done,
    total: mirror.tasks.length,
    steps: foldSteps(steps),
  }
}

// Reopens an ended session where it ran: PowerShell for a Windows folder, a POSIX shell
// otherwise. Both quote the folder, so spaces and quotes in it survive.
export const resumeCommand = (sessionId: string, dir: string | null): string => {
  const resume = `claude --resume ${sessionId}`
  if (dir === null || dir === '') return resume
  if (/^[A-Za-z]:[\\/]|\\/.test(dir)) return `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'; ${resume}`

  return `cd '${dir.replace(/'/g, "'\\''")}' && ${resume}`
}

const autoPr = (auto: ProgressAuto | null): string => {
  if (auto === null || auto.pr === null) return ''
  return [`PR #${auto.pr}`, ciWords(auto.ci)].filter(part => part !== '').join(' · ')
}

const prView = (mine: ProgressMirror | null): PrView | null => {
  const pr = mine?.pr ?? null
  if (pr === null) return null
  const tone: Tone =
    pr.state !== 'open'
      ? 'quiet'
      : pr.ci === 'fail'
        ? 'alert'
        : pr.review === 'changes'
          ? 'warn'
          : pr.ci === 'pending'
            ? 'accent'
            : 'quiet'

  return { text: prWords(pr), url: pr.url, tone }
}

const rowSteps = (task: ProgressTask): ViewStep[] => {
  const current = currentStepIndex(task)

  return foldSteps(
    task.steps.map((step, index) => ({ text: step.text, status: step.status, depth: step.depth, isCurrent: index === current })),
    5,
  )
}

export const buildView = (
  projects: readonly ProgressProject[],
  here: readonly string[],
  mine: ProgressMirror | null,
  now: number,
): View => {
  const ownId = mine === null ? '' : shortId(mine.sessionId)
  const waiting: WaitingItem[] = []
  const due: Array<TaskRow & { days: number }> = []
  const active: Array<TaskRow & { rank: number; order: number }> = []
  const recent: Array<DoneItem & { at: number }> = []
  let order = 0
  const seen = new Map<string, number>()

  for (const project of projects) {
    const name = project.name || '（未分類）'
    const isHere = isHereProject(name, here)
    for (const task of project.tasks) {
      if (task.auto !== null && task.auto.session === ownId) continue
      order += 1
      const title = task.title || '（未命名）'
      // A repeated title gets #2, #3, … so its row and buttons are its own.
      const base = `${name}::${title}`
      const repeat = (seen.get(base) ?? 0) + 1
      seen.set(base, repeat)
      const key = repeat === 1 ? base : `${base}#${repeat}`
      const updated = task.auto?.updated ?? 0
      const when = relativeTime(updated, now)
      const isComplete = isTaskComplete(task) || task.auto?.state === 'done'
      const isManual = task.auto === null

      task.steps.forEach((step, index) => {
        if (step.status !== 'waiting') return
        waiting.push({
          key: `${key}::${index}`,
          project: name,
          text: step.text,
          when,
          step: isManual ? { project: name, title, step: step.text, line: step.line, raw: step.raw } : null,
        })
      })

      if (isComplete) {
        if (isManual || now - updated < DAY) recent.push({ project: name, title, when, at: updated })
        continue
      }

      const auto = task.auto === null || task.auto.state === 'done' ? null : task.auto.state
      if (auto === 'waiting') {
        if (!task.steps.some(step => step.status === 'waiting')) {
          waiting.push({ key, project: name, text: `${title} · 等你回覆`, when, step: null })
        }
        continue
      }

      const { done, total } = countSteps(task)
      const phrase =
        auto === 'working'
          ? { status: 'Claude 正在做', tone: 'accent' as const }
          : auto === 'ended'
            ? { status: '對話已結束，可接手', tone: 'warn' as const }
            : stepPhrase(task)
      const open = task.steps[currentStepIndex(task)]
      const row: TaskRow = {
        key,
        project: name,
        title,
        done,
        total,
        ...phrase,
        when,
        isHere,
        auto,
        steps: rowSteps(task),
        left: task.steps.filter(step => step.status !== 'done' && step.status !== 'cancelled').map(step => step.text),
        next:
          isManual && open !== undefined
            ? { project: name, title, step: open.text, line: open.line, raw: open.raw }
            : null,
        due: null,
        pr: autoPr(task.auto),
        resume: auto === 'ended' && task.auto?.resume ? resumeCommand(task.auto.resume, task.auto.dir) : null,
      }

      // Work with a date close by is listed once, under 快到期.
      const days = task.due === null ? null : dueDays(task.due, now)
      if (task.due !== null && days !== null && days <= 14) {
        due.push({ ...row, due: { date: task.due, ...dueLabel(days) }, days })
        continue
      }
      active.push({ ...row, rank: isHere ? 0 : 1, order })
    }
  }

  due.sort((a, b) => a.days - b.days)
  active.sort((a, b) => a.rank - b.rank || a.order - b.order)
  recent.sort((a, b) => b.at - a.at)

  return {
    current: mine === null ? null : currentOf(mine),
    pr: prView(mine),
    waiting,
    due: due.map(({ days: _days, ...row }) => row),
    active: active.map(({ rank: _rank, order: _order, ...row }) => row),
    recent: recent.slice(0, 3).map(({ at: _at, ...item }) => item),
  }
}

const clip = (text: string, room: number): string => {
  const chars = [...text]
  return chars.length > room ? `${chars.slice(0, room - 1).join('')}…` : text
}

// One line under the prompt for when the pane is not on screen: this session's task, what
// waits on you, what is due within three days, and the pull request.
export const statusLine = (view: View): string | undefined => {
  const current = view.current
  const urgent = view.due.filter(row => row.due !== null && row.due.tone === 'alert').length
  const parts = [
    current === null || current.state === 'done'
      ? ''
      : `${clip(current.title, 14)} ${current.done}/${current.total} · ${clip(current.status, 18)}`,
    view.waiting.length > 0 ? `${view.waiting.length} 件等你` : '',
    urgent > 0 ? `${urgent} 件快到期` : '',
    view.pr === null ? '' : view.pr.text,
  ].filter(part => part !== '')

  return parts.length === 0 ? undefined : `進度 · ${parts.join(' · ')}`
}

export const progressBar = (done: number, total: number, width: number): { filled: string; rest: string } => {
  const cells = Math.max(4, width)
  const filled = total === 0 ? 0 : Math.round((done / total) * cells)

  return { filled: '━'.repeat(filled), rest: '─'.repeat(cells - filled) }
}
