// Optional offline SDK/loader acceptance. Dependencies are installed explicitly in
// a disposable prefix by the caller; this script never installs or invokes a model.
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--runtime-dir') throw Error('RUNTIME_DIRECTORY_REQUIRED')
const runtime = resolve(args[1])
const deps = join(runtime, 'node_modules')
const packages = { '@opencode-ai/plugin': '1.19.3', '@deepseek-ai/cordis': '4.0.5', '@deepseek-ai/cordis-plugin-loader': '1.0.6' }
for (const [name, version] of Object.entries(packages)) assert.equal(JSON.parse(readFileSync(join(deps, name, 'package.json'))).version, version)
const { Context } = await import(pathToFileURL(join(deps, '@deepseek-ai/cordis/lib/index.js')))
const { default: Loader } = await import(pathToFileURL(join(deps, '@deepseek-ai/cordis-plugin-loader/lib/index.js')))
const parent = resolve(tmpdir())
const root = mkdtempSync(join(parent, 'board-host-contracts-'))
let ctx
try {
  const env = { ...process.env, CLAUDE_PROGRESS_FILE: '', CODEX_HOME: join(root, '.codex'), DSH_HOME: join(root, '.dsh'), OPENCODE_CONFIG_DIR: join(root, '.config', 'opencode') }
  const setup = fileURLToPath(new URL('./setup-agent.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [setup, '--home', root, '--agent', 'opencode,deepseek', '--apply'], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 })
  assert.equal(result.status, 0, result.stderr)
  symlinkSync(deps, join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  const { AgentBoardLocal } = await import(pathToFileURL(join(root, '.config', 'opencode', 'plugins', 'agent-board-local.js')))
  const instance = await AgentBoardLocal({ client: { session: { get: async ({path}) => ({ data: {id: path.id} }) } } })
  const sid = 'opencode-packaged-sdk-123'
  await instance.event({ event: { type: 'session.status', properties: { sessionID: sid, status: { type: 'busy' } } } })
  assert.equal(typeof instance.tool.agent_board_progress.args.title.parse, 'function')
  await instance.tool.agent_board_progress.execute({ title: 'Packaged SDK contract', state: 'done', steps: ['- [x] Context bound'] }, {sessionID: sid})
  const progress = join(root, '.agent-board', 'progress.md')
  assert.match(readFileSync(progress, 'utf8'), /Packaged SDK contract/)
  ctx = new Context()
  await ctx.plugin(Loader)
  await ctx.loader.create({ name: pathToFileURL(join(root, '.agent-board', 'adapters', 'deepseek.mjs')).href })
  await ctx.loader.await()
  const agent = {session: {header: {id: 'deepseek-real-cordis-123'}}, status: 'idle'}
  await ctx.serial('agent/created', {agent})
  ctx.emit('agent/status', {agent, status:'running'})
  assert.match(readFileSync(progress, 'utf8'), /agent=deepseek .*state=working/)
  ctx.emit('agent/status', {agent, status:'idle'})
  assert.match(readFileSync(progress, 'utf8'), /agent=deepseek .*state=waiting/)
  ctx.emit('agent/disposed', {agent})
  assert.match(readFileSync(progress, 'utf8'), /agent=deepseek .*state=ended/)
  process.stdout.write(`${JSON.stringify({ packages, sdkAndLoaderContract: 'passed', nativeApplications: false, modelCalls: 0 })}\n`)
} finally {
  ctx?.loader?.root.stop()
  if (dirname(resolve(root)) !== parent || !root.startsWith(join(parent, 'board-host-contracts-'))) throw Error('CLEANUP_SCOPE_MISMATCH')
  rmSync(root, {recursive:true, force:true})
}
