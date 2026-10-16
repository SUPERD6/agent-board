import type {
  BoxProps,
  ButtonProps,
  ElementConstructor,
  InputProps,
  RenderElement,
  TextProps,
} from 'claude-code'

import type { ProgressAnswer, ProgressStepStatus } from '../types'
import { progressBar } from './view'
import type { StepRef, TaskRow, Tone, View, ViewStep } from './view'

// The pane's drawing, from the view and a set of actions; it never touches the engine,
// so every press goes through an action register.tsx wires up.

export type PaneUi = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Input: ElementConstructor<InputProps> | null
}

export type PaneActions = {
  toggle: (key: string) => void
  continueHere: () => void
  archive: () => void
  takeOver: (row: TaskRow) => void
  handOver: (row: TaskRow) => void
  tick: (ref: StepRef) => void
  ask: (question: string) => void
  clearAnswer: () => void
}

export type PaneModel = {
  view: View
  expanded: string
  answer: ProgressAnswer | null
  path: string
  width: number
  hasTaskTools: boolean
}

const GLYPH: Record<ProgressStepStatus, string> = {
  done: '✓',
  doing: '▸',
  todo: '○',
  waiting: '●',
  running: '◐',
  blocked: '!',
  cancelled: '–',
}

const STEP_COLOR: Record<ProgressStepStatus, string | undefined> = {
  done: undefined,
  doing: 'cyan',
  todo: undefined,
  waiting: 'yellow',
  running: 'cyan',
  blocked: 'red',
  cancelled: undefined,
}

const COLOR: Record<Tone, string | undefined> = { accent: 'cyan', warn: 'yellow', alert: 'red', quiet: undefined }

const isQuietStep = (status: ProgressStepStatus): boolean =>
  status === 'done' || status === 'todo' || status === 'cancelled'

export const drawPane = (ui: PaneUi, model: PaneModel, actions: PaneActions): RenderElement => {
  const { Box, Text, Button, Input } = ui
  const { view } = model

  const spacer = () => <Box flexGrow={1} />

  const label = (text: string, count: number | null, tone: Tone, tail: RenderElement | null = null) => (
    <Box flexDirection="row" marginTop={1}>
      <Text dimColor bold>
        {text}
      </Text>
      {count !== null && <Text color={COLOR[tone]}>{` ${count}`}</Text>}
      {spacer()}
      {tail}
    </Box>
  )

  const stepRow = (step: ViewStep) => (
    <Box flexDirection="row">
      <Text color={STEP_COLOR[step.status]} dimColor={isQuietStep(step.status)}>
        {GLYPH[step.status]}{' '}
      </Text>
      <Text bold={step.isCurrent} dimColor={isQuietStep(step.status) && !step.isCurrent} wrap="wrap">
        {step.text}
      </Text>
    </Box>
  )

  const bar = (done: number, total: number) => {
    const { filled, rest } = progressBar(done, total, model.width)

    return (
      <Box flexDirection="row">
        <Text color="cyan">{filled}</Text>
        <Text dimColor>{rest}</Text>
      </Box>
    )
  }

  // What a row offers once opened: take it over here, tick its step, or hand it to Claude.
  const rowActions = (row: TaskRow) => {
    if (row.auto === 'ended' && row.isHere) {
      return (
        <Box flexDirection="row" marginTop={1}>
          <Button key={`${row.key}::take`} variant="primary" onPress={() => actions.takeOver(row)}>
            接手做完
          </Button>
        </Box>
      )
    }
    if (row.auto !== null) {
      return (
        <Text dimColor wrap="wrap">
          {row.isHere ? '另一個對話正在做。' : `到 ${row.project} 的對話接著做。`}
        </Text>
      )
    }
    const next = row.next
    if (next === null) return null

    return (
      <Box flexDirection="row" marginTop={1} gap={1}>
        <Button key={`${row.key}::tick`} variant="primary" onPress={() => actions.tick(next)}>
          完成這步
        </Button>
        <Button key={`${row.key}::hand`} onPress={() => actions.handOver(row)}>
          交給 Claude
        </Button>
      </Box>
    )
  }

  const taskRow = (row: TaskRow) => {
    const isOpen = model.expanded === row.key
    const tail = row.due === null ? `${row.done}/${row.total}` : row.due.left

    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Button key={row.key} plain onPress={() => actions.toggle(row.key)}>
            {`${isOpen ? '▾' : '▸'} ${row.due === null ? `${row.project} · ` : ''}${row.title}`}
          </Button>
          {spacer()}
          <Text color={row.due === null ? undefined : COLOR[row.due.tone]} dimColor={row.due === null}>
            {` ${tail}`}
          </Text>
        </Box>
        <Box paddingLeft={2} flexDirection="row">
          <Text color={COLOR[row.tone]} dimColor={row.tone === 'quiet'} wrap="truncate-end">
            {[row.due === null ? '' : `${row.due.date} · ${row.project}`, row.status, row.when]
              .filter(part => part !== '')
              .join(' · ')}
          </Text>
        </Box>
        {isOpen && (
          <Box paddingLeft={2} flexDirection="column" marginTop={1}>
            {row.steps.map(stepRow)}
            {rowActions(row)}
          </Box>
        )}
      </Box>
    )
  }

  const current = view.current
  const summary = [
    view.waiting.length > 0 ? `${view.waiting.length} 件等你` : '',
    view.active.length + view.due.length > 0 ? `${view.active.length + view.due.length} 項進行中` : '',
  ]
    .filter(part => part !== '')
    .join(' · ')

  const isEmpty =
    current === null &&
    view.waiting.length === 0 &&
    view.due.length === 0 &&
    view.active.length === 0 &&
    view.recent.length === 0

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text bold>進度</Text>
        {spacer()}
        <Text dimColor>{summary}</Text>
      </Box>

      {!model.hasTaskTools && current === null && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">這個對話沒有 Task 工具，進度不會自動同步。</Text>
          <Text dimColor wrap="wrap">
            在 settings.json 的 env 加上 CLAUDE_CODE_ENABLE_TODO_TOOLS=1，重開就會同步。
          </Text>
        </Box>
      )}

      {isEmpty && (
        <Box flexDirection="column" marginTop={1}>
          <Text>目前沒有進行中的工作。</Text>
          <Text dimColor wrap="wrap">
            Claude 用 Task 清單開工後，這裡會自動出現。
          </Text>
        </Box>
      )}

      {current !== null && (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor="cyan"
          borderDimColor
          paddingX={1}
        >
          <Box flexDirection="row">
            <Text color="cyan" wrap="truncate-end">
              {current.project}
            </Text>
            {spacer()}
            <Text dimColor>{`${current.done}/${current.total}`}</Text>
          </Box>
          <Text bold wrap="wrap">
            {current.title}
          </Text>
          <Text color={COLOR[current.tone]} dimColor={current.tone === 'quiet'} wrap="wrap">
            {current.status}
          </Text>
          {bar(current.done, current.total)}
          {current.steps.map(stepRow)}
          {current.state === 'waiting' && (
            <Box flexDirection="row" marginTop={1}>
              <Button key="continue" variant="primary" onPress={actions.continueHere}>
                繼續
              </Button>
            </Box>
          )}
        </Box>
      )}

      {view.waiting.length > 0 && label('等你處理', view.waiting.length, 'warn')}
      {view.waiting.map(item => {
        const step = item.step

        return (
          <Box flexDirection="row" marginTop={1}>
            <Text color="yellow">● </Text>
            <Box flexDirection="column" flexGrow={1}>
              <Text wrap="wrap">
                {item.project} · {item.text}
              </Text>
              {item.when !== '' && <Text dimColor>{item.when}</Text>}
            </Box>
            {step !== null && (
              <Button key={`${item.key}::done`} onPress={() => actions.tick(step)}>
                完成
              </Button>
            )}
          </Box>
        )
      })}

      {view.due.length > 0 && label('快到期', null, 'quiet')}
      {view.due.map(taskRow)}

      {view.active.length > 0 && label(current === null ? '進行中' : '其他進行中', null, 'quiet')}
      {view.active.map(taskRow)}

      {view.recent.length > 0 &&
        label(
          '最近完成',
          null,
          'quiet',
          <Button key="archive" plain dimColor onPress={actions.archive}>
            封存
          </Button>,
        )}
      {view.recent.map(item => (
        <Box flexDirection="row">
          <Text dimColor>✓ </Text>
          <Text dimColor wrap="truncate-end">
            {[item.project, item.title, item.when].filter(part => part !== '').join(' · ')}
          </Text>
        </Box>
      ))}

      {Input !== null && (
        <Box flexDirection="column" marginTop={1}>
          <Input key="ask" placeholder="問一句，不會打斷 Claude" submitLabel="問" onSubmit={actions.ask} />
        </Box>
      )}
      {model.answer !== null && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor wrap="wrap">
            問：{model.answer.question}
          </Text>
          <Text wrap="wrap">{model.answer.isAsking ? '想一下…' : model.answer.text}</Text>
          {!model.answer.isAsking && (
            <Button key="clear-answer" plain dimColor onPress={actions.clearAnswer}>
              清掉
            </Button>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor wrap="truncate-start">
          {model.path}
        </Text>
      </Box>
    </Box>
  )
}
