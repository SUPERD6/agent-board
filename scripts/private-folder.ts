import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const isPrivateDacl = (sddl: string, sid: string): boolean => {
  if (!/^S-\d+(?:-\d+)+$/.test(sid)) return false
  const entry = /^D:P[A-Z]*(\(A;OICI;FA;;;S-\d+(?:-\d+)+\))$/.exec(sddl)?.[1]
  return entry === `(A;OICI;FA;;;${sid})`
}

const isPresent = (file: string): boolean => {
  try {
    lstatSync(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export const privateFolder = (dir: string): void => {
  if (process.platform !== 'win32') return
  try {
    const root = resolve(dir)
    mkdirSync(root, { recursive: true, mode: 0o700 })
    if (lstatSync(root).isSymbolicLink()) throw new Error('PRIVATE_FOLDER')
    const options = { encoding: 'utf8' as const, windowsHide: true, timeout: 10_000, stdio: 'pipe' as const }
    const system = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
    const icacls = join(system, 'icacls.exe')
    const sid = /,"(S-\d+(?:-\d+)+)"\s*$/.exec(execFileSync(join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], options))?.[1]
    if (!sid) throw new Error('PRIVATE_FOLDER')
    // /L acts on the folder itself: a folder swapped for a junction never passes its owner and
    // permissions on to the folder it points at.
    execFileSync(icacls, [root, '/setowner', `*${sid}`, '/L'], options)
    execFileSync(icacls, [root, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '/L'], options)
    // Another account may still hold rights here, so the saved copy gets a name it cannot guess,
    // must not exist before, and must be a plain file afterwards: icacls never writes through a
    // planted link.
    const readDacl = (): string => {
      const saved = join(root, `.acl-${randomBytes(8).toString('hex')}`)
      if (isPresent(saved)) throw new Error('PRIVATE_FOLDER')
      execFileSync(icacls, [root, '/save', saved, '/L'], options)
      try {
        const copy = lstatSync(saved)
        if (!copy.isFile() || copy.nlink !== 1) throw new Error('PRIVATE_FOLDER')
        return readFileSync(saved, 'utf16le').split(/\r?\n/).find(line => line.startsWith('D:')) ?? ''
      } finally { unlinkSync(saved) }
    }
    // Grant replacement leaves other explicit entries in place. Remove those principals
    // without enabling inheritance or requiring the backup privileges of /restore.
    const aliases: Record<string, string> = {
      BA: 'S-1-5-32-544', BU: 'S-1-5-32-545', BG: 'S-1-5-32-546',
      SY: 'S-1-5-18', LS: 'S-1-5-19', NS: 'S-1-5-20',
      WD: 'S-1-1-0', AU: 'S-1-5-11', IU: 'S-1-5-4',
      CO: 'S-1-3-0', CG: 'S-1-3-1', OW: 'S-1-3-4',
    }
    const sddl = readDacl()
    for (const match of sddl.matchAll(/\([^()]*;;;([^;()]+)\)/g)) {
      const trustee = match[1] ?? ''
      if (trustee === sid) continue
      const other = /^S-\d+(?:-\d+)+$/.test(trustee) ? trustee : aliases[trustee]
      if (!other) throw new Error('PRIVATE_FOLDER')
      execFileSync(icacls, [root, '/remove', `*${other}`, '/L'], options)
    }
    if (!isPrivateDacl(readDacl(), sid) || lstatSync(root).isSymbolicLink()) throw new Error('PRIVATE_FOLDER')
  } catch { throw new Error('PRIVATE_FOLDER') }
}
