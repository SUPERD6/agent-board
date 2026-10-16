// done [x] · doing [~] · todo [ ] · waiting [?] (on you) · running [>] (CI, a long run,
// someone else) · blocked [!] · cancelled [-]
export type ProgressStepStatus = 'done' | 'doing' | 'todo' | 'waiting' | 'running' | 'blocked' | 'cancelled'

// `line` (0-based) and `raw` (the line as written) let a press tick exactly this line.
export type ProgressStep = { text: string; status: ProgressStepStatus; depth: number; line: number; raw: string }

// working: Claude is mid-turn · waiting: idle with open steps · done: every step done ·
// ended: the session closed with open steps
export type ProgressSessionState = 'working' | 'waiting' | 'done' | 'ended'

// Present on a block a session's mod writes itself, between its auto markers.
export type ProgressAuto = { session: string; state: ProgressSessionState; updated: number }

export type ProgressTask = {
  title: string
  notes: string[]
  steps: ProgressStep[]
  auto: ProgressAuto | null
  due: string | null
}

export type ProgressProject = { name: string; tasks: ProgressTask[] }

export type ProgressSnapshot = {
  path: string
  isMissing: boolean
  error: string | null
  mtimeMs: number
  size: number
  projects: ProgressProject[]
}

// One task of Claude's own list (TaskCreate / TaskUpdate / TodoWrite), as the mod mirrors it.
export type ProgressMirrorTask = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
  waiting: 'you' | 'run' | null
  blocked: string | null
  blockedBy: string[]
}

export type ProgressMirror = {
  sessionId: string
  project: string
  branch: string
  title: string
  isTitleFinal: boolean
  firstPrompt: string
  state: ProgressSessionState
  tasks: ProgressMirrorTask[]
  updated: number
}

// The pane's side question and its answer.
export type ProgressAnswer = { question: string; text: string; isAsking: boolean }

declare module 'claude-code' {
  interface PluginState {
    'project-progress': {
      snapshot: ProgressSnapshot
      here: string[]
      mine: ProgressMirror | null
      now: number
      hasTaskTools: boolean
      expanded: string
      answer: ProgressAnswer | null
    }
  }
}
