import { describe, it, expect, vi } from 'vitest'

// files.ts imports electron at module load (ipcMain / dialog / BrowserWindow /
// shell). We mock those with the minimal surface the module body touches —
// only the pure helpers (parseProbeOutput + buildVSCodeLaunchPlan) are
// exercised below.
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openPath: async () => '' }
}))

import { buildVSCodeLaunchPlan, parseProbeOutput } from './files'

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
