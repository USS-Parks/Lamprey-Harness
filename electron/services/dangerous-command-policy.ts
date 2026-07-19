import { spawnSync } from 'child_process'
import type { ShellSelector } from './shell-tool'

export type CommandInspectionVerdict = 'safe' | 'dangerous' | 'uninspectable'

export interface CommandInspection {
  verdict: CommandInspectionVerdict
  reason: string
  commands: string[]
}

interface PowerShellAstResult {
  errors: string[]
  commands: string[]
  dynamicCommand: boolean
}

type PowerShellParserRunner = (source: string, platform: NodeJS.Platform) => PowerShellAstResult

const MAX_INSPECTABLE_COMMAND_BYTES = 8_192

const DANGEROUS_POWERSHELL_COMMANDS = new Set([
  'remove-item', 'clear-content', 'set-content', 'out-file', 'format-volume',
  'remove-partition', 'clear-disk', 'initialize-disk', 'stop-process',
  'restart-computer', 'stop-computer', 'invoke-expression', 'iex', 'invoke-command',
  'start-process', 'set-executionpolicy', 'add-mppreference', 'set-mppreference',
  'disable-windowsoptionalfeature', 'unregister-scheduledtask', 'remove-service',
  'new-service', 'set-service', 'stop-service', 'remove-localuser', 'remove-localgroup'
])

const DANGEROUS_EXTERNAL_COMMANDS = new Set([
  'diskpart', 'format', 'bcdedit', 'cipher', 'takeown', 'icacls', 'schtasks',
  'sc', 'sc.exe', 'reg', 'reg.exe', 'wmic', 'shutdown', 'reagentc'
])

const OBFUSCATION_RE = /(?:-encodedcommand\b|\bfrombase64string\b|\bscriptblock\s*::\s*create\b|\badd-type\b|\bsystem\.reflection\b)/i
const GENERAL_DANGER_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'git reset --hard can discard workspace changes' },
  { pattern: /\bgit\s+clean\s+-[^\s]*[fdx][^\s]*\b/i, reason: 'git clean can delete untracked workspace data' },
  { pattern: /\brm\s+-[^\s]*r[^\s]*f[^\s]*\s+(?:\/|~|\$HOME)\b/i, reason: 'recursive forced deletion targets a broad path' },
  { pattern: /\b(?:curl|wget)\b[^|\r\n]*\|\s*(?:sh|bash|zsh|pwsh|powershell)\b/i, reason: 'downloaded content is piped directly into a shell' },
  { pattern: /\bchmod\s+-R\s+777\b/i, reason: 'recursive world-writable permission change' },
  { pattern: /\bchown\s+-R\b/i, reason: 'recursive ownership change' },
  { pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/, reason: 'fork bomb pattern' }
]

function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string' && value) return [value]
  return []
}

function runPowerShellParser(source: string, platform: NodeJS.Platform): PowerShellAstResult {
  const encodedSource = Buffer.from(source, 'utf8').toString('base64')
  const script = [
    `$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedSource}'))`,
    '$tokens=$null',
    '$errors=$null',
    '$ast=[System.Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)',
    '$commandAsts=@($ast.FindAll({param($node) $node -is [System.Management.Automation.Language.CommandAst]},$true))',
    '$commands=@()',
    '$dynamic=$false',
    'foreach($commandAst in $commandAsts){$name=$commandAst.GetCommandName();if([string]::IsNullOrWhiteSpace($name)){$dynamic=$true}else{$commands+=[string]$name}}',
    '$payload=@{errors=@($errors|ForEach-Object{$_.Message});commands=@($commands);dynamicCommand=$dynamic}',
    '[Console]::Out.Write(($payload|ConvertTo-Json -Compress -Depth 4))'
  ].join(';')
  const binary = platform === 'win32' ? 'powershell.exe' : 'pwsh'
  const result = spawnSync(binary, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], {
    input: script,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 3_000,
    maxBuffer: 1024 * 1024
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(String(result.stderr || `parser exited ${result.status}`))
  const parsed = JSON.parse(String(result.stdout || '{}')) as Record<string, unknown>
  return {
    errors: normalizeArray(parsed.errors),
    commands: normalizeArray(parsed.commands),
    dynamicCommand: parsed.dynamicCommand === true
  }
}

export function inspectPowerShellCommand(
  source: string,
  platform: NodeJS.Platform = process.platform,
  runner: PowerShellParserRunner = runPowerShellParser
): CommandInspection {
  if (!source.trim()) {
    return { verdict: 'uninspectable', reason: 'PowerShell command is empty', commands: [] }
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_INSPECTABLE_COMMAND_BYTES) {
    return {
      verdict: 'uninspectable',
      reason: `PowerShell command exceeds the ${MAX_INSPECTABLE_COMMAND_BYTES}-byte inspection cap`,
      commands: []
    }
  }
  if (OBFUSCATION_RE.test(source)) {
    return {
      verdict: 'dangerous',
      reason: 'PowerShell command uses encoded, dynamic, or reflection-based execution',
      commands: []
    }
  }
  let parsed: PowerShellAstResult
  try {
    parsed = runner(source, platform)
  } catch (error) {
    return {
      verdict: 'uninspectable',
      reason: `PowerShell AST inspection failed: ${error instanceof Error ? error.message : String(error)}`,
      commands: []
    }
  }
  if (parsed.errors.length > 0) {
    return {
      verdict: 'uninspectable',
      reason: `PowerShell AST has parse errors: ${parsed.errors[0]}`,
      commands: parsed.commands
    }
  }
  if (parsed.dynamicCommand) {
    return {
      verdict: 'uninspectable',
      reason: 'PowerShell AST contains a dynamic command invocation',
      commands: parsed.commands
    }
  }
  const normalized = parsed.commands.map((command) => command.toLowerCase())
  const dangerous = normalized.find(
    (command) => DANGEROUS_POWERSHELL_COMMANDS.has(command) || DANGEROUS_EXTERNAL_COMMANDS.has(command)
  )
  if (dangerous) {
    return {
      verdict: 'dangerous',
      reason: `PowerShell AST invokes dangerous command ${dangerous}`,
      commands: parsed.commands
    }
  }
  return { verdict: 'safe', reason: 'PowerShell AST contains no dangerous commands', commands: parsed.commands }
}

export function inspectShellCommand(
  source: string,
  shell: ShellSelector = 'auto',
  platform: NodeJS.Platform = process.platform
): CommandInspection {
  for (const candidate of GENERAL_DANGER_PATTERNS) {
    if (candidate.pattern.test(source)) {
      return { verdict: 'dangerous', reason: candidate.reason, commands: [] }
    }
  }
  const usesPowerShell = shell === 'powershell' || (shell === 'auto' && platform === 'win32')
  if (usesPowerShell) return inspectPowerShellCommand(source, platform)
  return { verdict: 'safe', reason: 'No dangerous shell pattern matched', commands: [] }
}
