import { spawn } from 'child_process'

export interface GitResult {
  stdout: string
  stderr: string
  code: number
}

export function runGit(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (b: Buffer) => {
      stdout += b.toString('utf8')
    })
    proc.stderr.on('data', (b: Buffer) => {
      stderr += b.toString('utf8')
    })
    proc.on('error', (err) => {
      resolve({ stdout, stderr: stderr + String(err), code: -1 })
    })
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? -1 })
    })
  })
}
