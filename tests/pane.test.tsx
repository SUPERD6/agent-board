import type { On, RenderPropsOf } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

const FILE = '/home/me/.claude/progress.md'
const SESSION = '2be48af2-6193-5040-aacc-e0546d6784f1'
const PANE = { plugin: 'project-progress', component: 'Pane', requestId: 'project-progress' } as const

const PROPS: RenderPropsOf['Pane'] = {
  title: '進度',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

type World = {
  files: Map<string, string>
  mtime: number
  hasTasks: boolean
  env?: Record<string, string>
  stats?: string[]
  // Paths that exist but refuse to be read (too big, locked).
  unreadable?: Set<string>
  // When set, the next write to progress.md waits here; `reached` resolves once it does.
  hold?: { reached: () => void; release: Promise<void> }
}

// On Windows the engine resolves /home/me/... to X:\home\me\... before fs.* reaches these
// handlers; map it back so the in-memory files are found on every host.
const posix = (path: string): string => path.replace(/^[A-Za-z]:\\/, '/').replace(/\\/g, '/')

// Everything a session's engine answers beneath the plugin, with files kept in memory.
const engineBeneath = (on: On, world: World): MockClock => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-16T12:00:00.000Z') })
  mock.env(on, world.env ?? { HOME: '/home/me' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: SESSION }))
  on('session.root', () => ({ value: '/work/persona_framework' }))
  on('session.repo', () => ({
    value: {
      root: '/work/persona_framework',
      remote: 'https://github.com/jhk482001/persona_framework.git',
      internal: false,
      name: null,
    },
  }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('tool.list', () => ({
    value: world.hasTasks ? [{ name: 'TaskCreate', description: '', mcp: false }] : [{ name: 'Read', description: '', mcp: false }],
  }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'claude/progress-mod\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: '「重做進度面板」',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  on('fs.stat', ($, e) => {
    world.stats?.push(e.path)
    const text = world.files.get(posix(e.path))
    return text === undefined
      ? { deny: 'ENOENT' }
      : { value: { kind: 'file' as const, size: text.length, mtimeMs: world.mtime, isLink: false } }
  })
  on('fs.exists', ($, e) => ({ value: world.files.has(posix(e.path)) }))
  on('fs.read', ($, e) => {
    const path = posix(e.path)
    const text = world.files.get(path)
    if (world.unreadable?.has(path)) return { deny: 'EFBIG' }
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', async ($, e) => {
    const path = posix(e.path)
    const hold = world.hold
    if (hold !== undefined && path === FILE) {
      world.hold = undefined
      hold.reached()
      await hold.release
    }
    world.files.set(path, e.text)
    world.mtime += 1
    return { value: undefined }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  let nextId = 0
  on('tool.call', { tool: 'TaskCreate' }, ($, e) => {
    nextId += 1
    return { result: { task: { id: String(nextId), subject: e.subject } } }
  })
  on('tool.call', { tool: 'TaskUpdate' }, ($, e) => ({
    result: { success: true, taskId: e.taskId, updatedFields: ['status'] },
  }))

  return clock
}

const start = async ($: Engine, text: string): Promise<void> => {
  await $.session.start({ cwd: '/work/persona_framework', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text, turnId: 't1' })
}

test('Claude’s task calls fill the file and the pane by themselves', async ($, on) => {
  const world: World = { files: new Map([[FILE, '# 專案進度\n\n## 求職\n### Google 暑期實習\n- [?] 推薦信 — 等教授回覆\n']]), mtime: 1, hasTasks: true }
  engineBeneath(on, world)
  await start($, '幫我重做進度面板')

  await $.tool.call({ tool: 'TaskCreate', subject: '讀 API', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: '寫 Mod', description: '', activeForm: '寫 Mod 中' })
  await $.tool.call({ tool: 'TaskCreate', subject: '推分支', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })

  const written = world.files.get(FILE) ?? ''
  expect(written).toContain('## 求職\n### Google 暑期實習')
  expect(written).toContain('## persona_framework')
  expect(written).toContain('<!-- auto session=2be48af2 state=working')
  expect(written).toContain('- [x] 讀 API\n- [~] 寫 Mod\n- [ ] 推分支')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    expect(await ui.find({ type: 'Text', text: '1 件等你' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '正在做：寫 Mod 中' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1\/3$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^寫 Mod$/ }))?.props).toMatchObject({ bold: true })
    expect(await ui.find({ type: 'Text', text: '求職 · 推薦信 — 等教授回覆' })).toBeDefined()
    await ui.unmount()
  }
})

test('the end of a turn says the session waits on you, and the model names the task', async ($, on) => {
  const world: World = { files: new Map(), mtime: 1, hasTasks: true }
  const clock = engineBeneath(on, world)
  await start($, '幫我重做進度面板')
  await $.tool.call({ tool: 'TaskCreate', subject: '讀 API', description: '' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(10)

  const written = world.files.get(FILE) ?? ''
  expect(written).toContain('state=waiting')
  expect(written).toContain('> 等你回覆 · claude/progress-mod')
  expect(written).toContain('### 重做進度面板')
})

test('after a compaction the conversation gets the progress note', async ($, on) => {
  const world: World = { files: new Map(), mtime: 1, hasTasks: true }
  engineBeneath(on, world)
  on('session.compact', () => ({ messages: [{ role: 'user' as const, text: '摘要', toolUses: [] }] }))
  await start($, '幫我重做進度面板')
  await $.tool.call({ tool: 'TaskCreate', subject: '讀 API', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: '寫 Mod', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })

  const out = await $.session.compact({
    trigger: 'auto',
    messages: [{ role: 'user', text: '幫我重做進度面板', toolUses: [] }],
  })
  const last = out.messages?.at(-1)?.text ?? ''
  expect(last).toContain('[進度面板] 對話剛壓縮過')
  expect(last).toContain('正在做：寫 Mod')
  expect(last).toContain('完成 1/2')
})

test('a session that ends with open steps is marked for someone to pick up', async ($, on) => {
  const world: World = { files: new Map(), mtime: 1, hasTasks: true }
  engineBeneath(on, world)
  await start($, '跑實驗')
  await $.tool.call({ tool: 'TaskCreate', subject: '跑 100 次', description: '' })
  await $.session.end({ reason: 'other', sessionId: SESSION, resume: { id: SESSION } as never })

  expect(world.files.get(FILE) ?? '').toContain('state=ended')
  expect(world.files.get(FILE) ?? '').toContain('> 對話已結束，可接手')
})

test('with nothing tracked the pane says so, and where the file is', async ($, on) => {
  const world: World = { files: new Map(), mtime: 1, hasTasks: true }
  engineBeneath(on, world)
  await $.session.start({ cwd: '/work/x', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect(await ui.find({ type: 'Text', text: '目前沒有進行中的工作。' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: FILE })).toBeDefined()
  await ui.unmount()
})

test('without Task tools the pane says how to turn them on', async ($, on) => {
  const world: World = { files: new Map(), mtime: 1, hasTasks: false }
  engineBeneath(on, world)
  await $.session.start({ cwd: '/work/x', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  expect(await ui.find({ type: 'Text', text: /CLAUDE_CODE_ENABLE_TODO_TOOLS=1/ })).toBeDefined()
  await ui.unmount()
})

test('on Windows the file sits under USERPROFILE, even with a Git Bash HOME', async ($, on) => {
  const world: World = {
    files: new Map(),
    mtime: 1,
    hasTasks: true,
    env: { USERPROFILE: 'C:\\Users\\wenyu', HOME: '/c/Users/wenyu' },
    stats: [],
  }
  engineBeneath(on, world)
  await $.session.start({ cwd: 'C:\\work\\persona_framework', surface: 'desktop', isInteractive: true })
  // A Linux host resolves a drive path as relative, so compare the tail the mod built.
  expect((world.stats ?? []).some(path => path.endsWith('C:\\Users\\wenyu\\.claude\\progress.md'))).toBe(true)
})

const JOBS = `# 專案進度

## 求職
### Google 暑期實習
> 截止 12-20
- [x] 改履歷
- [?] 推薦信 — 等教授回覆
- [ ] 投遞

## persona_framework
<!-- auto session=a81d0c42 state=ended updated=2026-10-16T10:00:00.000Z -->
### 修 CI
- [x] 看 log
- [ ] 修測試
<!-- /auto session=a81d0c42 -->
`

test('the pane acts: tick a step, hand a task to Claude, take over, ask aside', async ($, on) => {
  const world: World = { files: new Map([[FILE, JOBS]]), mtime: 1, hasTasks: true }
  engineBeneath(on, world)
  const submitted: string[] = []
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('model.fork', () => ({
    value: {
      isAnswered: true as const,
      text: '還差修測試。',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  await $.session.start({ cwd: '/work/persona_framework', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    expect(await ui.find({ type: 'Button', key: '求職::Google 暑期實習::1::done' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })

  // 完成 on a waiting step ticks it in the file.
  await ui.press({ key: '求職::Google 暑期實習::1::done' })
  expect(world.files.get(FILE)).toContain('- [x] 推薦信 — 等教授回覆')

  // Opening a row shows its steps and actions; 交給 Claude sends a prompt.
  await ui.press({ key: '求職::Google 暑期實習' })
  expect(await ui.find({ type: 'Text', text: '投遞' })).toBeDefined()
  await ui.press({ key: '求職::Google 暑期實習::hand' })
  expect(submitted.at(-1)).toContain('幫我處理「Google 暑期實習」（求職）')
  expect(submitted.at(-1)).toContain('下一步是「投遞」')

  // An ended session in this project can be taken over here.
  await ui.press({ key: 'persona_framework::修 CI' })
  await ui.press({ key: 'persona_framework::修 CI::take' })
  expect(submitted.at(-1)).toContain('接手「修 CI」')
  expect(submitted.at(-1)).toContain('剩下：修測試')

  // A side question is answered in the pane.
  await ui.input({ key: 'ask', text: '還差什麼？' })
  expect(await ui.find({ type: 'Text', text: '還差修測試。' })).toBeDefined()
  await ui.press({ key: 'clear-answer' })
  expect(await ui.find({ type: 'Text', text: '還差修測試。' })).toBeUndefined()
  await ui.unmount()
})

test("a 完成 press while Claude's own write is on its way: both land", async ($, on) => {
  const world: World = { files: new Map([[FILE, JOBS]]), mtime: 1, hasTasks: true }
  const clock = engineBeneath(on, world)
  await start($, '幫我重做進度面板')
  await $.tool.call({ tool: 'TaskCreate', subject: '讀 API', description: '' })

  // Claude's next write is held at the file. The press comes in meanwhile and is given time
  // to run: a tick that reads the file now (no queue) works from text without Claude's
  // change, and whichever write lands second undoes the other. Queued behind Claude's
  // write, the tick waits, then reads what that write left.
  let release = (): void => {}
  let reached = (): void => {}
  const atGate = new Promise<void>(resolve => {
    reached = resolve
  })
  world.hold = {
    reached,
    release: new Promise<void>(resolve => {
      release = resolve
    }),
  }
  const pending = $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await atGate

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  const pressing = ui.press({ key: '求職::Google 暑期實習::1::done' })
  await clock.advance(1)
  release()
  await pressing
  await pending
  await ui.unmount()

  const text = world.files.get(FILE) ?? ''
  expect(text).toContain('- [x] 推薦信 — 等教授回覆')
  expect(text).toContain('- [x] 讀 API')
})

test('a progress.md that cannot be read is never rewritten', async ($, on) => {
  const world: World = { files: new Map([[FILE, JOBS]]), mtime: 1, hasTasks: true, unreadable: new Set([FILE]) }
  engineBeneath(on, world)
  await start($, '幫我重做進度面板')
  await $.tool.call({ tool: 'TaskCreate', subject: '讀 API', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
  expect(world.files.get(FILE)).toBe(JOBS)
})

test("a progress.md holding only whitespace still gets this session's block", async ($, on) => {
  const world: World = { files: new Map([[FILE, '  \n\n']]), mtime: 1, hasTasks: true }
  engineBeneath(on, world)
  await start($, '幫我重做進度面板')
  await $.tool.call({ tool: 'TaskCreate', subject: '讀 API', description: '' })
  expect(world.files.get(FILE)).toContain('<!-- auto session=2be48af2 state=working')
})

const ARCHIVE = '/home/me/.claude/progress-archive-2026-10.md'
const TIDY = {
  command: 'progress',
  args: '整理',
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 160 },
}
const OLD_DONE = `# 專案進度

## ai-research-skills
<!-- auto session=c55e2f10 state=done updated=2026-10-15T09:00:00.000Z -->
### 發佈 1.7.4
> 完成
- [x] 打 tag
<!-- /auto session=c55e2f10 -->
`

test('an archive file that cannot be read is left alone, and so is progress.md', async ($, on) => {
  const world: World = {
    files: new Map([
      [FILE, OLD_DONE],
      [ARCHIVE, '# 進度封存\n\n（很大的舊紀錄）\n'],
    ]),
    mtime: 1,
    hasTasks: true,
    unreadable: new Set([ARCHIVE]),
  }
  engineBeneath(on, world)
  await $.session.start({ cwd: '/work/persona_framework', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run(TIDY)
  expect(ran.text).toBe('讀不到進度檔或封存檔，沒有動任何檔案。')
  expect(world.files.get(FILE)).toBe(OLD_DONE)
  expect(world.files.get(ARCHIVE)).toBe('# 進度封存\n\n（很大的舊紀錄）\n')
})

test("old done blocks go to the month's archive file, after what it already holds", async ($, on) => {
  const world: World = {
    files: new Map([
      [FILE, OLD_DONE],
      [ARCHIVE, '# 進度封存\n\n## alpha · 2026-10-01\n### 舊的\n- [x] 一\n'],
    ]),
    mtime: 1,
    hasTasks: true,
  }
  engineBeneath(on, world)
  await $.session.start({ cwd: '/work/persona_framework', surface: 'terminal', isInteractive: true })
  await $.command.run(TIDY)
  expect(world.files.get(ARCHIVE)).toBe(
    '# 進度封存\n\n## alpha · 2026-10-01\n### 舊的\n- [x] 一\n\n## ai-research-skills · 2026-10-15\n### 發佈 1.7.4\n> 完成\n- [x] 打 tag\n',
  )
  expect(world.files.get(FILE)).not.toContain('session=c55e2f10')
})

test('the rule rides the system prompt only while the session has a Task list', async ($, on) => {
  const world: World = { files: new Map(), mtime: 1, hasTasks: true }
  engineBeneath(on, world)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: '你是 Claude。', scope: 'shared' as const }] }))
  const base = { model: 'claude-test', promptModel: 'claude-test', surfaces: [], outputStyle: null, traits: [] }

  const withTasks = await $.prompt.compose({ ...base, tools: ['Read', 'TaskCreate'] })
  expect(withTasks.sections.map(s => s.id)).toEqual(['intro', 'project-progress:rule'])
  expect(withTasks.sections[1]?.text).toContain('TaskCreate')
  expect(withTasks.sections[1]?.scope).toBe('session')

  const without = await $.prompt.compose({ ...base, tools: ['Read'] })
  expect(without.sections.map(s => s.id)).toEqual(['intro'])
})
