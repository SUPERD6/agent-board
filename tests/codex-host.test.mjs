import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { inspectCodexHooks } from '../scripts/codex-host.ts'

const identities = ['stop', 'sessionEnd', 'userPromptSubmit'].map(event => ({event, command:`report-${event}`}))
const fixture = async (options, action) => {
  const dir = mkdtempSync(join(tmpdir(), 'board-trust-observation-'))
  const config = join(dir, 'hooks.json'), log = join(dir, 'methods.jsonl'), executable = join(dir, 'host.mjs')
  const contents = '{"hooks":{"synthetic":true}}\n'
  writeFileSync(config, contents)
  let hooks = identities.map((one, index) => ({key:`hook-${index}`, currentHash:'sha256:' + String(index + 1).repeat(64), sourcePath:config, eventName:one.event, command:one.command, enabled:true, trustStatus:'trusted'}))
  if (options.hooks) hooks = options.hooks(hooks, dir)
  const response = options.response ?? {data:[{hooks, errors:[]}]}
  writeFileSync(executable, `
import { createInterface } from 'node:readline'
import { appendFileSync, writeFileSync } from 'node:fs'
createInterface({input:process.stdin}).on('line', text => {
  const request = JSON.parse(text)
  appendFileSync(${JSON.stringify(log)}, request.method + '\\n')
  if (request.id === undefined) return
  if (request.method === 'initialize') process.stdout.write(JSON.stringify({id:request.id,result:{}})+'\\n')
  else if (request.method === 'hooks/list') {
    ${options.changed ? `writeFileSync(${JSON.stringify(config)}, 'external changed definition')` : ''}
    process.stdout.write(JSON.stringify({id:request.id, ${options.rejected ? 'error:{message:"unsupported"}' : `result:${JSON.stringify(response)}`}})+'\\n')
  } else process.stdout.write(JSON.stringify({id:request.id,error:{message:'FORBIDDEN_METHOD'}})+'\\n')
})
`)
  try { await action({config, log, executable, contents}) }
  finally { rmSync(dir, {recursive:true, maxRetries:5, retryDelay:100}) }
}

test('legacy hook trust observation accepts only the three exact current definitions and makes no changes', async () => fixture({}, async f => {
  const result = await inspectCodexHooks(f.executable, f.config, identities)
  assert.equal(result.trusted, true)
  assert.equal(result.source, resolve(f.config))
  assert.equal(result.sourceHash, createHash('sha256').update(f.contents).digest('hex'))
  assert.equal(result.hooks.length, 3)
  assert.equal(readFileSync(f.config, 'utf8'), f.contents)
  assert.deepEqual(readFileSync(f.log, 'utf8').trim().split('\n'), ['initialize','initialized','hooks/list'])
  assert.doesNotMatch(JSON.stringify(result), /report-stop|synthetic/)
}))

test('one untrusted current definition keeps the observation untrusted', async () => fixture({hooks:hooks => hooks.map((hook,index) => index === 1 ? {...hook,trustStatus:'untrusted'} : hook)}, async f => {
  assert.equal((await inspectCodexHooks(f.executable, f.config, identities)).trusted, false)
  assert.equal(readFileSync(f.config, 'utf8'), f.contents)
}))

for (const [label, hooks, error] of [
  ['missing hook', hooks => hooks.slice(1), 'OWNED_HOOKS_NOT_FOUND'],
  ['foreign source', (hooks,dir) => hooks.map(hook => ({...hook,sourcePath:join(dir,'other-hooks.json')})), 'OWNED_HOOKS_NOT_FOUND'],
  ['changed command', hooks => hooks.map((hook,index) => index === 1 ? {...hook,command:'personal-command'} : hook), 'OWNED_HOOKS_NOT_FOUND'],
  ['duplicate definition', hooks => [...hooks, hooks[0]], 'OWNED_HOOKS_NOT_FOUND'],
  ['duplicate key', hooks => hooks.map(hook => ({...hook,key:'shared'})), 'OWNED_HOOKS_NOT_FOUND'],
  ['disabled hook', hooks => hooks.map((hook,index) => index === 0 ? {...hook,enabled:false} : hook), 'HOOK_DISABLED_OR_HASH_UNSUPPORTED'],
  ['unsupported hash', hooks => hooks.map((hook,index) => index === 0 ? {...hook,currentHash:'future-hash'} : hook), 'HOOK_DISABLED_OR_HASH_UNSUPPORTED'],
]) test(`trust observation refuses ${label} without granting trust`, async () => fixture({hooks}, async f => {
  await assert.rejects(inspectCodexHooks(f.executable, f.config, identities), new RegExp(error))
  assert.equal(readFileSync(f.config, 'utf8'), f.contents)
}))

for (const response of [{}, {data:[]}, {data:[{hooks:[],errors:['unreadable']}]}, {data:[null]}, {data:[{hooks:'invalid',errors:[]}]}]) {
  test('incomplete host discovery cannot establish approved hooks: ' + JSON.stringify(response), async () => fixture({response}, async f => {
    await assert.rejects(inspectCodexHooks(f.executable, f.config, identities), /HOOK_DISCOVERY_FAILED/)
  }))
}

test('a source change during discovery invalidates even a trusted host reply', async () => fixture({changed:true}, async f => {
  await assert.rejects(inspectCodexHooks(f.executable, f.config, identities), /HOOK_DEFINITION_CHANGED/)
  assert.equal(readFileSync(f.config,'utf8'), 'external changed definition')
}))

test('an unsupported host API fails closed without a trust write', async () => fixture({rejected:true}, async f => {
  await assert.rejects(inspectCodexHooks(f.executable, f.config, identities), /CODEX_CONTROL_REJECTED/)
  assert.equal(readFileSync(f.config,'utf8'), f.contents)
  assert.doesNotMatch(readFileSync(f.log,'utf8'), /config|thread|turn|resume/)
}))

test('an empty or duplicate identity request cannot use vacuous trust', async () => fixture({}, async f => {
  await assert.rejects(inspectCodexHooks(f.executable, f.config, []), /OWNED_HOOK_IDENTITIES_REQUIRED/)
  await assert.rejects(inspectCodexHooks(f.executable, f.config, [identities[0],identities[0]]), /OWNED_HOOK_IDENTITIES_REQUIRED/)
}))
