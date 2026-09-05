import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

// files.ts imports electron at module load (ipcMain / dialog / BrowserWindow /
// shell). We mock those with the minimal surface the module body touches —
// only the pure helpers (parseProbeOutput + buildVSCodeLaunchPlan) are
// exercised below.
const handlers = vi.hoisted(() => ({} as Record<string, (...args: any[]) => any>))
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => { handlers[name] = handler } },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openPath: async () => '' }
}))

const workspaceRoot = { current: mkdtempSync(join(tmpdir(), 'lamprey-confine-')) }

vi.mock('../services/workspace-state', () => ({
  getActiveWorkspace: () => workspaceRoot.current,
  setActiveWorkspace: () => ({ path: workspaceRoot.current }),
  clearActiveWorkspace: () => undefined
}))

import {
  buildVSCodeLaunchPlan,
  confineToWorkspace,
  parseProbeOutput,
  registerFilesHandlers
} from './files'

describe('confineToWorkspace', () => {
  const root = workspaceRoot.current

  it('allows a relative path inside the workspace', () => {
    expect(confineToWorkspace('src/foo.ts')).toBe(resolve(root, 'src/foo.ts'))
  })

  it('allows an absolute path inside the workspace', () => {
    const abs = resolve(root, 'readme.md')
    expect(confineToWorkspace(abs)).toBe(abs)
  })

  it('allows the workspace root itself', () => {
    expect(confineToWorkspace(root)).toBe(resolve(root))
    expect(confineToWorkspace('.')).toBe(resolve(root))
  })

  it('keeps a path that leaves and re-enters the workspace', () => {
    expect(confineToWorkspace('src/../package.json')).toBe(resolve(root, 'package.json'))
  })

  it('denies a parent-escape path', () => {
    expect(confineToWorkspace('../secret')).toBeNull()
  })

  it('denies an absolute path outside the workspace', () => {
    expect(confineToWorkspace(resolve(root, '..', 'outside.txt'))).toBeNull()
    expect(confineToWorkspace('/etc/passwd')).toBeNull()
  })
  it('denies real directory-link escapes including nonexistent descendants', async () => {
    const outside = mkdtempSync(join(tmpdir(),'lamprey-confine-outside-'))
    writeFileSync(join(outside,'private.txt'),'outside fixture content')
    const link = join(root,'escape-link')
    symlinkSync(outside,link,process.platform === 'win32' ? 'junction' : 'dir')
    expect(confineToWorkspace(join(link,'private.txt'))).toBeNull()
    expect(confineToWorkspace(join(link,'not-created.txt'))).toBeNull()
    registerFilesHandlers()
    const reply = await handlers['files:readText']({},join(link,'private.txt'))
    expect(reply.success).toBe(false)
    expect(JSON.stringify(reply)).not.toContain('outside fixture content')
  })
  it('allows real internal directory links and ordinary double-dot-prefixed names', () => {
    const internal = join(root,'internal')
    mkdirSync(internal)
    const link = join(root,'internal-link')
    symlinkSync(internal,link,process.platform === 'win32' ? 'junction' : 'dir')
    expect(confineToWorkspace(join(link,'future.txt'))).toBe(join(realpathSync(internal),'future.txt'))
    expect(confineToWorkspace('..notes')).toBe(join(realpathSync(root),'..notes'))
  })
  it('rejects external and dangling links using the platform-supported link type', () => {
    const outside = mkdtempSync(join(tmpdir(),'lamprey-filelink-outside-'))
    writeFileSync(join(outside,'private.txt'),'fixture')
    const external = join(root,'external-file-link')
    const dangling = join(root,'dangling-file-link')
    if (process.platform === 'win32') {
      symlinkSync(outside,external,'junction')
      symlinkSync(join(root,'missing-target'),dangling,'junction')
    } else {
      symlinkSync(join(outside,'private.txt'),external,'file')
      symlinkSync(join(root,'missing-target'),dangling,'file')
    }
    expect(confineToWorkspace(external)).toBeNull()
    expect(confineToWorkspace(dangling)).toBeNull()
  })
  it('fails closed when the workspace itself is unavailable', () => {
    workspaceRoot.current = join(root,'absent-workspace')
    try { expect(confineToWorkspace('.')).toBeNull() } finally { workspaceRoot.current = root }
  })
})

describe('parseProbeOutput', () => {
  it('returns null for empty output', () => {
    expect(parseProbeOutput('')).toBe(null)
    expect(parseProbeOutput('   \n  \n')).toBe(null)
  })

  it('returns the first non-empty line, trimmed', () => {
    expect(parseProbeOutput('/usr/local/bin/code\n')).toBe('/usr/local/bin/code')
    expect(parseProbeOutput('   /usr/local/bin/code  \n')).toBe(
      '/usr/local/bin/code'
    )
  })

  it('handles CRLF newlines (Windows `where` output)', () => {
    const winOut = 'C:\\Users\\u\\AppData\\Local\\Programs\\code\\bin\\code.cmd\r\n'
    expect(parseProbeOutput(winOut)).toBe(
      'C:\\Users\\u\\AppData\\Local\\Programs\\code\\bin\\code.cmd'
    )
  })

  it('takes only the first match when `where` returns several', () => {
    const winOut =
      'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd\r\n' +
      'C:\\Users\\u\\AppData\\Local\\Programs\\code\\bin\\code.cmd\r\n'
    expect(parseProbeOutput(winOut)).toBe(
      'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd'
    )
  })
})

describe('buildVSCodeLaunchPlan', () => {
  it('SEC-6: never sets shell: true', () => {
    const plan = buildVSCodeLaunchPlan('/usr/local/bin/code', '/tmp/proj')
    expect(plan.options.shell).toBe(false)
  })

  it('passes the target as an argv element (not a shell substring)', () => {
    const plan = buildVSCodeLaunchPlan('/usr/local/bin/code', '/tmp/my proj')
    expect(plan.command).toBe('/usr/local/bin/code')
    expect(plan.args).toEqual(['/tmp/my proj'])
  })

  it('keeps shell-metacharacters in the target as a literal argv element', () => {
    // With shell: true, a target like `; rm -rf /` would be executed by the
    // shell. The argv form makes it a single argument passed to the program;
    // the shell never sees it.
    const evil = '/tmp/; rm -rf /'
    const plan = buildVSCodeLaunchPlan('/usr/local/bin/code', evil)
    expect(plan.args).toEqual([evil])
    expect(plan.args[0]).not.toContain('"')
  })

  it('sets detached + stdio:ignore + windowsHide for fire-and-forget launch', () => {
    const plan = buildVSCodeLaunchPlan('code', '/x')
    expect(plan.options.detached).toBe(true)
    expect(plan.options.stdio).toBe('ignore')
    expect(plan.options.windowsHide).toBe(true)
  })

  it('preserves a Windows .cmd shim path as the command', () => {
    const cmdShim = 'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd'
    const plan = buildVSCodeLaunchPlan(cmdShim, 'C:\\proj')
    expect(plan.command).toBe(cmdShim)
    expect(plan.args).toEqual(['C:\\proj'])
    // Node ≥21.7 auto-escapes args when the target is a .cmd; the launch
    // plan itself doesn't pre-quote.
    expect(plan.options.shell).toBe(false)
  })
})
