import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'

const source = readFileSync(new URL('../hooks/connect.ts', import.meta.url), 'utf8')
const ctx = { inbox: '/synthetic/progress-inbox' }
const template = (name, end, withPrompt = true) => {
  const start = source.indexOf(`export const ${name} =`)
  assert.ok(start >= 0)
  const code = stripTypeScriptTypes(source.slice(start, source.indexOf(end, start)), { mode: 'strip' }).replace('export const', 'const')
  return new Function(`const OPENCLAW_ID = 'agent-board'; ${code}; return ${name}`)()(ctx, withPrompt)
}

test('pre-prompt plugin templates retain the exact bytes released in 0.20.5 and 0.23.1', () => {
  const legacy = [
    ['opencodePlugin', '\nconst OPENCLAW_ID', '20b3fd9ec5b02ee9c2090490a0853dfe47fca270392c57de92f55dad2069e645'],
    ['openclawPlugin', '\n// The standalone board', 'feb2b8ff0af006c582ab0de7165f18fa3fa107fb49e24b0dec414c19cfcf413f'],
  ]
  for (const [name, end, hash] of legacy) assert.equal(createHash('sha256').update(template(name, end, false)).digest('hex'), hash)
})

test('generated OpenCode and OpenClaw prompt callbacks retain only verified binding metadata', async () => {
  const saved = []
  const instantiate = (script, suffix) => new Function('mkdirSync', 'renameSync', 'writeFileSync', 'join', `${script.replace(/^import .*\n/gm, '').replace('export const AgentBoard', 'const AgentBoard').replace('export default', 'const plugin =')}\n${suffix}`)(() => {}, () => {}, (name, body) => saved.push({ name, body }), (...parts) => parts.join('/'))
  let hasMessages = false
  const factory = instantiate(template('opencodePlugin', '\nconst OPENCLAW_ID'), 'return AgentBoard')
  const hooks = await factory({ directory: '/demo', client: { session: { get: async ({ path }) => ({ data: { id: path.id, ...(path.id === 'subagent' ? { parentID: 'parent' } : {}) } }), messages: () => { hasMessages = true; throw new Error('prompt fetched messages') } } } })
  await hooks['chat.message']({ sessionID: 'subagent' }, {})
  assert.equal(saved.length, 0)
  await hooks['chat.message']({ sessionID: 'prompt-owner' }, { message: { content: 'PRIVATE_NEW_INPUT' } })
  assert.equal(hasMessages, false)
  assert.deepEqual(JSON.parse(saved[0].body), { session_id: 'prompt-owner', cwd: '/demo' })
  const callbacks = new Map()
  instantiate(template('openclawPlugin', '\n// The standalone board'), 'return plugin').register({ on: (name, fn) => callbacks.set(name, fn) })
  for (const kind of ['inter_session', 'internal_system', undefined]) callbacks.get('before_prompt_build')({ prompt: 'PRIVATE_NEW_INPUT' }, { sessionId: 'prompt-owner', inputProvenance: { kind } })
  assert.equal(saved.length, 1)
  callbacks.get('before_prompt_build')({ prompt: 'PRIVATE_NEW_INPUT' }, { sessionId: 'prompt-owner', workspaceDir: '/demo', inputProvenance: { kind: 'external_user' } })
  assert.equal(saved.length, 2)
  assert.deepEqual(JSON.parse(saved[1].body), { session_id: 'prompt-owner', cwd: '/demo' })
  assert.ok(saved.every(one => one.name.includes('-prompt-') && !one.body.includes('PRIVATE_NEW_INPUT')))
})
