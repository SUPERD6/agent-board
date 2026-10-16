import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ProgressAnswer, ProgressMirror, ProgressSnapshot } from '../types'
import { extractAutoBlock, removeAutoBlock, setManualStep, shortId, takeArchivable, upsertAutoBlock } from './blocks'
import {
  applyTaskCreate,
  applyTaskUpdate,
  applyTodoWrite,
  cleanTitle,
  emptyMirror,
  fallbackTitle,
  fromTaskList,
  isStaleStoreKey,
  resumeNote,
  stateOf,
} from './mirror'
import type { ListedTask } from './mirror'
import { baseName, countSteps, isHereProject, isTaskComplete, parseProgress } from './parse'
import { drawPane } from './pane'
import { RULE, RULE_ID } from './rule'
import type { PaneActions, PaneModel, PaneUi } from './pane'
import { buildView } from './view'
import type { StepRef, TaskRow } from './view'

const PANE = 'project-progress'
const TITLE = '進度'
const POLL_MS = 2000
const TICK_MS = 30 * 1000
const DAY = 24 * 60 * 60 * 1000

const EMPTY: ProgressSnapshot = { path: '', isMissing: true, error: null, mtimeMs: 0, size: 0, projects: [] }

const snapshot = atom({ plugin: 'project-progress', key: 'snapshot' } as const, EMPTY)
const here = atom({ plugin: 'project-progress', key: 'here' } as const, [] as string[])
const mine = atom({ plugin: 'project-progress', key: 'mine' } as const, null as ProgressMirror | null)
const now = atom({ plugin: 'project-progress', key: 'now' } as const, 0)
const hasTaskTools = atom({ plugin: 'project-progress', key: 'hasTaskTools' } as const, true)

const expanded = atom({ plugin: 'project-progress', key: 'expanded' } as const, '')
const answer = atom({ plugin: 'project-progress', key: 'answer' } as const, null as ProgressAnswer | null)

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

// Module state: reset by a reload, which only happens between turns.
let isPolling = false
let isTurnRunning = false
let writes: Promise<unknown> = Promise.resolve()
let askSeq = 0

// CLAUDE_PROGRESS_FILE wins; otherwise ~/.claude/progress.md. USERPROFILE comes first
// because that is where Claude Code keeps ~/.claude on Windows even when HOME is set
// (Git Bash, MSYS); it is unset on macOS and Linux.
const progressPath = async ($: EngineInterface): Promise<string> => {
  const explicit = await $.env.get('CLAUDE_PROGRESS_FILE')
  if (explicit !== undefined && explicit !== '') return explicit
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/[\\/]+$/, '')
  const sep = home.includes('\\') ? '\\' : '/'

  return [home, '.claude', 'progress.md'].join(sep)
}

// One archive file per month (progress-archive-2026-10.md), so none grows past what one
// read can hold.
const archivePath = (path: string, now: number): string =>
  `${path.replace(/\.md$/i, '')}-archive-${new Date(now).toISOString().slice(0, 7)}.md`

// Re-reads the file only when its mtime or size moved, so the 2s timer is a stat.
const poll = async ($: EngineInterface): Promise<void> => {
  if (isPolling) return
  isPolling = true
  try {
    const path = await progressPath($)
    const previous = await read($, snapshot)
    const stat = await $.fs.stat(path).catch(() => undefined)
    if (stat === undefined) {
      if (!previous.isMissing || previous.path !== path) await update($, snapshot, () => ({ ...EMPTY, path }))
      return
    }
    const isSame = previous.path === path && previous.mtimeMs === stat.mtimeMs && previous.size === stat.size
    if (isSame && previous.error === null && !previous.isMissing) return
    try {
      const projects = parseProgress(await $.fs.read(path))
      await update($, snapshot, () => ({
        path,
        isMissing: false,
        error: null,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        projects,
      }))
    } catch (error) {
      await update($, snapshot, () => ({ ...EMPTY, path, isMissing: false, error: messageOf(error) }))
    }
  } finally {
    isPolling = false
  }
}

// A file that is not there reads as empty; one that is there and cannot be read (too big,
// locked) rejects, so nothing is written over it.
const readText = async ($: EngineInterface, path: string): Promise<string> => {
  try {
    return await $.fs.read(path)
  } catch (error) {
    if (!(await $.fs.exists(path))) return ''
    throw error
  }
}

// Every write this session makes (its block, a tick, an archive) goes through one queue,
// so none reads the file while another is on its way and writes over it.
const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
  const run = writes.then(job, job)
  writes = run.catch(() => undefined)

  return run
}

// This session's block, written over whatever is there now; read again afterwards so a
// write that raced another session's is retried instead of lost.
const writeMine = async ($: EngineInterface): Promise<void> => {
  const mirror = await read($, mine)
  if (mirror === null) return
  const path = await progressPath($)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await readText($, path)
    // Zero bytes from a file the last poll saw with content is most likely another write
    // caught half-way: look again rather than write a file holding only this block.
    if (before === '' && (await read($, snapshot)).size > 0) {
      await poll($)
      continue
    }
    const after = mirror.tasks.length === 0 ? removeAutoBlock(before, mirror.sessionId) : upsertAutoBlock(before, mirror)
    if (after === before) break
    await $.fs.write(path, after)
    const check = await readText($, path)
    if (extractAutoBlock(check, mirror.sessionId) === extractAutoBlock(after, mirror.sessionId)) break
  }
  await poll($)
}

const queueWrite = ($: EngineInterface): Promise<void> => enqueue(() => writeMine($)).catch(() => undefined)

// Saves the mirror for this session (the pane redraws) and across restarts ($.store).
const saveMine = async ($: EngineInterface, change: (mirror: ProgressMirror) => ProgressMirror): Promise<void> => {
  const current = await read($, mine)
  if (current === null) return
  const next = change(current)
  await update($, mine, () => next)
  await $.store.set(`mirror:${next.sessionId}`, next)
}

// The project this session writes under: the remote's repo name, else the folder's.
const projectName = async ($: EngineInterface): Promise<string> => {
  const repo = await $.session.repo().catch(() => null)
  if (repo?.remote) return baseName(repo.remote).replace(/\.git$/, '')
  if (repo !== null) return baseName(repo.root)

  return baseName(await $.session.root().catch(() => '')) || '（未分類）'
}

const branchName = async ($: EngineInterface): Promise<string> => {
  const root = await $.session.root().catch(() => undefined)
  const ran = await $.process
    .run(['git', 'branch', '--show-current'], root === undefined ? undefined : { cwd: root })
    .catch(() => undefined)

  return ran?.exitCode === 0 ? ran.stdout.trim() : ''
}

// Names this session's project may go by: repo name, main worktree folder, session folder.
const detectHere = async ($: EngineInterface): Promise<void> => {
  const names = new Set<string>()
  const root = await $.session.root().catch(() => undefined)
  if (root !== undefined) names.add(baseName(root))
  const repo = await $.session.repo().catch(() => null)
  if (repo !== null) {
    names.add(baseName(repo.root))
    if (repo.name !== null) names.add(baseName(repo.name))
    if (repo.remote !== null) names.add(baseName(repo.remote).replace(/\.git$/, ''))
  }
  await update($, here, () => [...names].filter(name => name !== ''))
}

// The mirror outlives a reload in $.state and a restart in $.store.
const loadMine = async ($: EngineInterface): Promise<void> => {
  const sessionId = await $.session.id()
  const held = await read($, mine)
  if (held !== null && held.sessionId === sessionId) return
  const stored = (await $.store.get(`mirror:${sessionId}`)) as ProgressMirror | undefined
  const fresh = emptyMirror(sessionId, await projectName($), await $.clock.now())
  await update($, mine, () => stored ?? fresh)
}

// Claude's own list, read when the mirror missed calls (installed mid-session, a reload).
const resync = async ($: EngineInterface): Promise<void> => {
  const ran = await $.tool.call({ tool: 'TaskList' }).catch(() => undefined)
  if (ran === undefined || ran.deny !== undefined || ran.isError === true) return
  const listed = (ran.result as { tasks?: ListedTask[] } | undefined)?.tasks
  if (listed === undefined) return
  const at = await $.clock.now()
  await saveMine($, mirror => fromTaskList(mirror, listed, at))
}

const nameTask = async ($: EngineInterface): Promise<void> => {
  const mirror = await read($, mine)
  if (mirror === null || mirror.isTitleFinal || mirror.tasks.length === 0) return
  await saveMine($, one => ({ ...one, isTitleFinal: true, title: one.title || fallbackTitle(one) }))
  const steps = mirror.tasks.map(task => `- ${task.subject}`).join('\n')
  const asked = await $.model
    .complete({
      model: 'haiku',
      maxTokens: 40,
      effort: 'low',
      prompt:
        `使用者的需求：\n${mirror.firstPrompt.slice(0, 600)}\n\n步驟：\n${steps}\n\n` +
        '替這件工作取一個 4 到 14 個字的名稱，像待辦清單的標題：白話、具體、說出要做成什麼。' +
        '用使用者的語言（中文就用繁體中文）。不要標點、不要引號，只回名稱。',
    })
    .catch(() => undefined)
  const title = asked?.isAnswered === true ? cleanTitle(asked.text) : ''
  if (title === '') return
  await saveMine($, one => ({ ...one, title }))
  await queueWrite($)
}

// Old finished blocks move to that month's archive file, so the file stays about what is open.
const archiveOld = async ($: EngineInterface): Promise<number> => {
  const path = await progressPath($)
  const text = await readText($, path)
  const mirror = await read($, mine)
  const keep = mirror === null ? undefined : shortId(mirror.sessionId)
  const { text: kept, entries } = takeArchivable(text, await $.clock.now(), keep)
  if (entries.length === 0) return 0
  const archive = archivePath(path, await $.clock.now())
  const past = await readText($, archive)
  const head = past.trim() === '' ? '# 進度封存\n\n' : past.replace(/\s*$/, '\n\n')
  await $.fs.write(archive, head + entries.join('\n\n') + '\n')
  await $.fs.write(path, kept)
  await poll($)

  return entries.length
}

// For a session's first turn: work in this project that other sessions left or hold.
const othersNote = async ($: EngineInterface): Promise<string | null> => {
  const names = await read($, here)
  const mirror = await read($, mine)
  const own = mirror === null ? '' : shortId(mirror.sessionId)
  const at = await $.clock.now()
  const lines: string[] = []
  for (const project of (await read($, snapshot)).projects) {
    if (!isHereProject(project.name, names)) continue
    for (const task of project.tasks) {
      const auto = task.auto
      if (auto === null || auto.session === own || auto.state === 'done' || isTaskComplete(task)) continue
      if (at - auto.updated > 7 * DAY) continue
      const { done, total } = countSteps(task)
      const open = task.steps.find(step => step.status !== 'done' && step.status !== 'cancelled')
      lines.push(
        auto.state === 'ended'
          ? `- 「${task.title}」對話已結束，停在：${open?.text ?? '（無）'}（完成 ${done}/${total}）`
          : `- 「${task.title}」另一個對話正在處理（完成 ${done}/${total}）`,
      )
    }
  }
  if (lines.length === 0) return null

  return [
    '[進度面板] 這個專案在 progress.md 裡還有其他對話的工作：',
    ...lines,
    '只有在使用者要接著做時才接手；接手時用 TaskCreate 重建剩下的步驟。不要重做另一個對話正在處理的事。',
  ].join('\n')
}

// Keeps the store to the last month of sessions.
const pruneStore = async ($: EngineInterface, at: number): Promise<void> => {
  for (const key of await $.store.keys()) {
    if (isStaleStoreKey(key, await $.store.get(key), at, 30 * DAY)) await $.store.delete(key)
  }
}

const takeOverPrompt = (row: TaskRow): string => {
  const left = row.left

  return [
    `接手「${row.title}」（${row.project}，之前的對話沒做完，完成 ${row.done}/${row.total}）。`,
    left.length === 0 ? '' : `剩下：${left.join('；')}`,
    '先用 TaskCreate 重建剩下的步驟，再從第一個沒做完的開始。',
  ]
    .filter(line => line !== '')
    .join('\n')
}

const handOverPrompt = (row: TaskRow): string =>
  [
    `幫我處理「${row.title}」（${row.project}）。`,
    row.next === null ? '' : `下一步是「${row.next.step}」。`,
    `progress.md 裡這個任務的段落是目前的狀態，做完一步就在那裡打勾。`,
  ]
    .filter(line => line !== '')
    .join('')

// A press on 完成: the step is ticked in the file, by the person's own hand.
const tickStep = async ($: EngineInterface, ref: StepRef): Promise<void> => {
  const path = await progressPath($)
  const before = await readText($, path)
  const after = setManualStep(before, ref, 'x')
  if (after !== before) await $.fs.write(path, after)
  await poll($)
}

// A side question: answered over this session's transcript, without a turn of its own.
const askAside = async ($: EngineInterface, question: string): Promise<void> => {
  const text = question.trim()
  if (text === '') return
  askSeq += 1
  const seq = askSeq
  await update($, answer, () => ({ question: text, text: '', isAsking: true }))
  const forked = await $.model
    .fork({ prompt: `${text}\n\n（側邊面板的問題：用繁體中文、三句以內回答，不要動任何檔案。）` })
    .catch(() => undefined)
  const reply =
    forked?.isAnswered === true
      ? forked.text.trim()
      : forked?.reason === 'nothing-to-fork'
        ? '這個對話還沒開始，先跟 Claude 說一句話再問。'
        : '沒問到，再試一次。'
  // A slower answer to an earlier question is dropped rather than shown under a newer one.
  if (seq !== askSeq) return
  await update($, answer, () => ({ question: text, text: reply, isAsking: false }))
}

const settle = async ($: EngineInterface): Promise<void> => {
  const at = await $.clock.now()
  await saveMine($, mirror => ({ ...mirror, state: stateOf(mirror, isTurnRunning), updated: at }))
  await queueWrite($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'progress',
      description: '進度面板：開啟；「整理」封存完成的；「同步」重讀 Task 清單',
      argumentHint: '[整理|同步]',
    })
    await detectHere($)
    await loadMine($)
    const tools = await $.tool.list().catch(() => [])
    const hasTools = tools.length === 0 || tools.some(tool => tool.name === 'TaskCreate' || tool.name === 'TodoWrite')
    await update($, hasTaskTools, () => hasTools)
    await poll($)
    const startedAt = await $.clock.now()
    await update($, now, () => startedAt)
    await pruneStore($, startedAt)
    // Work left running past a dispatch can outlive the module (a reload, the end): its
    // rejections are dropped rather than left unhandled.
    $.clock.every(POLL_MS, () => {
      poll($).catch(() => undefined)
    })
    $.clock.every(TICK_MS, () => {
      $.clock
        .now()
        .then(at => update($, now, () => at))
        .catch(() => undefined)
    })
    enqueue(() => archiveOld($)).catch(() => undefined)
    if ((await $.store.get('closedByPerson')) !== true) {
      $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'progress' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '整理' || arg === 'archive') {
      const moved = await enqueue(() => archiveOld($)).catch(() => null)
      if (moved === null) return { text: '讀不到進度檔或封存檔，沒有動任何檔案。' }

      return { text: moved === 0 ? '沒有要封存的。' : `封存了 ${moved} 個完成的任務。` }
    }
    if (arg === '同步' || arg === 'sync') {
      await resync($)
      await settle($)

      return { text: '已從 Task 清單重新同步。' }
    }
    await poll($)
    await $.store.delete('closedByPerson')
    const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })
    const { path } = await read($, snapshot)

    return { text: opened.isPlaced ? `進度面板已開啟：${path}` : `進度面板開不了：${opened.reason}` }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    isTurnRunning = true
    const mirror = await read($, mine)
    if (mirror !== null && mirror.firstPrompt === '' && e.text.trim() !== '') {
      await saveMine($, one => ({ ...one, firstPrompt: e.text.trim() }))
    }
    if (mirror !== null && mirror.tasks.length > 0) {
      await settle($)
    } else if (mirror !== null && (await $.store.get(`hinted:${mirror.sessionId}`)) === undefined) {
      await $.store.set(`hinted:${mirror.sessionId}`, await $.clock.now())
      const note = await othersNote($)
      if (note !== null) {
        await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: note }] } }).catch(() => undefined)
      }
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    isTurnRunning = false
    const mirror = await read($, mine)
    if (mirror !== null && mirror.tasks.length > 0) {
      const branch = await branchName($)
      await saveMine($, one => ({ ...one, branch }))
      await settle($)
      if (!mirror.isTitleFinal) {
        $.clock.after(1, () => {
          nameTask($).catch(() => undefined)
        })
      }
    }

    return next(e)
  })

  // Claude's own task calls, mirrored as they land. A call naming a task the mirror never
  // saw (installed mid-session, a reload) re-reads the whole list first.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    try {
      const id = ran.result.task.id
      const mirror = await read($, mine)
      const highest = Math.max(0, ...(mirror?.tasks ?? []).map(task => Number(task.id) || 0))
      if (Number(id) > highest + 1) await resync($)
      const at = await $.clock.now()
      await saveMine($, one => applyTaskCreate(one, e, id, at))
      await settle($)
    } catch {
      // The tool already ran; a failed mirror update must not touch its result.
    }

    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    try {
      const mirror = await read($, mine)
      if (mirror !== null && !mirror.tasks.some(task => task.id === e.taskId)) await resync($)
      const at = await $.clock.now()
      await saveMine($, one => applyTaskUpdate(one, e, at))
      await settle($)
    } catch {
      // The tool already ran; a failed mirror update must not touch its result.
    }

    return ran
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    try {
      const at = await $.clock.now()
      await saveMine($, one => applyTodoWrite(one, e.todos, at))
      await settle($)
    } catch {
      // The tool already ran; a failed mirror update must not touch its result.
    }

    return ran
  })

  // Compaction: the summarizer is told to keep the list, and the conversation it leaves
  // gets a short note of where things stand, so the next step is not lost.
  on('session.compact', async ($, e, next) => {
    const mirror = await read($, mine)
    const note = mirror === null || e.agentId !== undefined ? null : resumeNote(mirror)
    if (note === null) return next(e)
    const keep = '保留 Task 清單上每一步的狀態，特別是正在做的那一步和還沒做的步驟。'
    const out = await next({ ...e, instructions: [e.instructions, keep].filter(Boolean).join('\n') })
    if (out.skip !== undefined || e.trigger === 'precompute') return out

    return { ...out, messages: [...out.messages, { role: 'user' as const, text: note, toolUses: [] }] }
  })

  on('session.end', async ($, e, next) => {
    const mirror = await read($, mine)
    if (mirror !== null && mirror.tasks.length > 0) {
      const at = await $.clock.now()
      const state = mirror.tasks.every(task => task.status === 'completed') ? 'done' : 'ended'
      await saveMine($, one => ({ ...one, state, updated: at }))
      await queueWrite($)
    }

    return next(e)
  })

  // The rule rides the system prompt while the session has a Task list to follow; static
  // text after the shared sections, so the prompt cache keeps it.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const hasList = e.tools.includes('TaskCreate') || e.tools.includes('TodoWrite')
    if (!hasList || composed.sections.some(section => section.id === RULE_ID)) return composed

    return { sections: [...composed.sections, { id: RULE_ID, text: RULE, scope: 'session' as const }] }
  })

  // The person closing the pane is remembered: it stops opening by itself until /progress.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await $.store.set('closedByPerson', true)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const at = (await read($, now)) || (await $.clock.now())
    const view = buildView(snap.projects, await read($, here), await read($, mine), at)
    const ui: PaneUi = {
      Box: table.Box,
      Text: table.Text,
      Button: table.Button,
      Input: 'Input' in table ? table.Input : null,
    }
    if (snap.error !== null) {
      const { Box, Text } = table

      return (
        <Box flexDirection="column">
          <Text color="red">讀不到進度檔</Text>
          <Text dimColor>{snap.error}</Text>
          <Text dimColor wrap="truncate-start">
            {snap.path}
          </Text>
        </Box>
      )
    }
    const model: PaneModel = {
      view,
      expanded: await read($, expanded),
      answer: await read($, answer),
      path: snap.path,
      width: Math.max(8, Math.min(28, e.props.bodyColumns - 4)),
      hasTaskTools: await read($, hasTaskTools),
    }
    const actions: PaneActions = {
      toggle: key => {
        update($, expanded, open => (open === key ? '' : key)).catch(() => undefined)
      },
      continueHere: () => {
        $.prompt.submit({ text: '繼續' }).catch(() => undefined)
      },
      archive: () => {
        enqueue(() => archiveOld($)).catch(() => undefined)
      },
      takeOver: row => {
        $.prompt.submit({ text: takeOverPrompt(row) }).catch(() => undefined)
      },
      handOver: row => {
        $.prompt.submit({ text: handOverPrompt(row) }).catch(() => undefined)
      },
      tick: ref => {
        enqueue(() => tickStep($, ref)).catch(() => undefined)
      },
      ask: question => {
        askAside($, question).catch(() => undefined)
      },
      clearAnswer: () => {
        update($, answer, () => null).catch(() => undefined)
      },
    }

    return drawPane(ui, model, actions)
  })
}
