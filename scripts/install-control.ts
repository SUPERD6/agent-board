import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { withLocalLock } from './local-lock'

// Data-directory overrides can still target the same host configuration. All
// cooperating installers use the home identity rather than their data directory.
export const installControlRoot = (home: string): string => join(realpathSync(home), '.agent-board')
export const withInstallLock = <T>(home: string, action: () => T extends PromiseLike<unknown> ? never : T, canRecover = false): T =>
  withLocalLock(join(installControlRoot(home), 'install.lock'), () => {
    const state = join(installControlRoot(home), 'legacy-connect.json')
    const authority = join(installControlRoot(home), 'legacy-connect-authority')
    if (existsSync(authority) && (!existsSync(state) || readFileSync(authority, 'utf8') !== '1\n')) throw new Error('MISSING_CONNECT_STATE')
    if (!canRecover && existsSync(state) && (JSON.parse(readFileSync(state, 'utf8')) as { pending?: unknown }).pending !== undefined) throw new Error('PENDING_CONNECT_RECOVERY')
    return action()
  })
