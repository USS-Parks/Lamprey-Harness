// Workspace World Model Phase (WM-1) — per-conversation observation state.
//
// The GAVEL analog of the believed scene graph, adapted to WM_BASELINE §4:
// the live filesystem is the authoritative graph, so this module tracks
// OBSERVATIONS (what was read/listed/searched/written and when) as verdict
// evidence, staleness signals, and the search ledger — never as a sole gate.
// State is in-memory per conversation (the tool-unlock-state pattern),
// cleared on conversation delete, reset by app restart.
//
// Recording is fed from chat dispatch (resolveSingleToolCall) after each
// tool result, gated on the world-model mode so 'off' does zero bookkeeping.

import { createHash } from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { resolvePathWithinWorkspace } from './apply-patch-tool'

export interface FileObservation {
  /** sha1 of content at observation time; null when the file was too large to hash. */
  hash: string | null
  size: number
  mtimeMs: number
  observedAt: number
  via: 'shell-read' | 'patch-write' | 'validate'
}

export interface SearchRecord {
  query: string
  scope: string
  hits: number
  at: number
}

export interface RestorationObligation {
  kind: 'stash-pop'
  subject: string
  note: string
  createdAt: number
}

interface WorldState {
  files: Map<string, FileObservation>
  dirsListed: Map<string, number>
  searches: SearchRecord[]
  writes: Set<string>
  obligations: RestorationObligation[]
  lastUnattributedMutationAt: number | null
}

const states = new Map<string, WorldState>()

const MAX_HASH_BYTES = 2 * 1024 * 1024
const MAX_SEARCH_RECORDS = 200

function stateFor(conversationId: string): WorldState {
  let s = states.get(conversationId)
  if (!s) {
    s = {
      files: new Map(),
      dirsListed: new Map(),
      searches: [],
      writes: new Set(),
      obligations: [],
      lastUnattributedMutationAt: null
    }
    states.set(conversationId, s)
  }
  return s
}

export function hashFileAt(absPath: string): FileObservation | null {
  try {
    const st = statSync(absPath)
    if (!st.isFile()) return null
    const base = { size: st.size, mtimeMs: st.mtimeMs, observedAt: Date.now() }
    if (st.size > MAX_HASH_BYTES) return { ...base, hash: null, via: 'validate' }
    const content = readFileSync(absPath)
    return {
      ...base,
      hash: createHash('sha1').update(content).digest('hex'),
      via: 'validate'
    }
  } catch {
    return null
  }
}

// ── Shell command classification (pure) ─────────────────────────────────
//
// Three-tier attribution per WM_BASELINE §4.3: known-read heads observe
// their path arguments, known-write heads invalidate them, everything
// mutation-capable but unattributable marks a timestamp used only as
// verdict evidence. Deliberately conservative: a wrong classification must
// never block a call, so unknown constructs classify as unattributed.

const READ_HEADS = new Set([
  'cat', 'type', 'head', 'tail', 'less', 'more', 'wc', 'stat', 'file', 'od',
  'hexdump', 'grep', 'rg', 'egrep', 'fgrep', 'findstr', 'ls', 'dir', 'tree',
  'get-content', 'gc', 'select-string', 'get-childitem', 'gci', 'test-path',
  'diff', 'cmp', 'md5sum', 'sha1sum', 'sha256sum', 'nl', 'strings'
])

const WRITE_HEADS = new Set([
  'tee', 'touch', 'mkdir', 'rm', 'del', 'rmdir', 'mv', 'move', 'cp', 'copy',
  'ln', 'truncate', 'remove-item', 'ri', 'copy-item', 'move-item', 'new-item',
  'ni', 'set-content', 'add-content', 'out-file', 'clear-content', 'unlink'
])

// Heads that plausibly mutate the workspace without attributable path args.
const MUTATION_CAPABLE_HEADS = new Set([
  'npm', 'npx', 'pnpm', 'yarn', 'node', 'python', 'python3', 'pip', 'pip3',
  'make', 'cargo', 'go', 'tsc', 'esbuild', 'vite', 'webpack', 'dotnet',
  'mvn', 'gradle', 'bundle', 'rake', 'composer', 'terraform', 'docker'
])

const GIT_WRITE_SUBCOMMANDS = new Set([
  'checkout', 'restore', 'apply', 'mv', 'rm', 'clean', 'reset', 'merge',
  'rebase', 'cherry-pick', 'revert', 'pull', 'commit'
])

export interface ShellClassification {
  reads: string[]
  writes: string[]
  dirsListed: string[]
  mutationCapable: boolean
  stashPush: boolean
  stashPop: boolean
}

function isOption(token: string): boolean {
  return token.startsWith('-')
}

function isPathLike(token: string): boolean {
  if (!token || isOption(token)) return false
  if (token.includes('/') || token.includes('\\')) return true
  return /^[\w.-]+\.[A-Za-z0-9]{1,8}$/.test(token)
}

function stripQuotes(token: string): string {
  return token.replace(/^['"]|['"]$/g, '')
}

/**
 * Classify one shell command line. Segments split on unquoted `;`, `&&`,
 * `||`, `|`, and newlines; per segment the head decides the tier and the
 * path-like arguments get attributed. Redirection targets (`>`/`>>`) are
 * writes regardless of head. `sed -i` writes; bare `sed` reads.
 */
export function classifyShellCommand(command: string): ShellClassification {
  const out: ShellClassification = {
    reads: [],
    writes: [],
    dirsListed: [],
    mutationCapable: false,
    stashPush: false,
    stashPop: false
  }
  if (typeof command !== 'string' || command.trim() === '') return out

  const segments = command
    .split(/(?<!['"])(?:\n|;|&&|\|\||\|)(?!['"])/g)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const segment of segments) {
    // Redirection targets are writes for any head.
    const redirect = segment.match(/(?:^|[^>])>{1,2}\s*([^\s;|&]+)/)
    if (redirect && redirect[1]) out.writes.push(stripQuotes(redirect[1]))

    const tokens = segment.split(/\s+/).map(stripQuotes).filter(Boolean)
    if (tokens.length === 0) continue
    const head = (tokens[0].split(/[\\/]/).pop() ?? tokens[0]).toLowerCase().replace(/\.exe$/, '')
    const args = tokens.slice(1)
    const pathArgs = args.filter(isPathLike)

    if (head === 'git') {
      const sub = args.find((a) => !isOption(a))?.toLowerCase()
      if (sub === 'stash') {
        const stashOp = args.filter((a) => !isOption(a))[1]?.toLowerCase()
        if (stashOp === 'pop' || stashOp === 'apply') out.stashPop = true
        else out.stashPush = true
        out.mutationCapable = true
      } else if (sub && GIT_WRITE_SUBCOMMANDS.has(sub)) {
        if (pathArgs.length > 0) out.writes.push(...pathArgs)
        else out.mutationCapable = true
      } else {
        out.reads.push(...pathArgs)
      }
      continue
    }

    if (head === 'sed' || head === 'perl') {
      // Drop expression tokens (s/a/b/, y/x/y/, address+command scripts) so
      // only real file operands attribute.
      const fileArgs = pathArgs.filter((a) => !/^[sy]\/.*\/[a-z]*$/i.test(a))
      const inPlace = args.some((a) => a === '-i' || a.startsWith('-i.') || a.startsWith('--in-place'))
      if (inPlace) out.writes.push(...fileArgs)
      else out.reads.push(...fileArgs)
      continue
    }

    if (READ_HEADS.has(head)) {
      if (head === 'ls' || head === 'dir' || head === 'tree' || head === 'get-childitem' || head === 'gci') {
        // Directory operands are often bare names with no extension, so the
        // listing family takes every non-option argument as a path.
        const dirArgs = args.filter((a) => !isOption(a))
        out.dirsListed.push(...(dirArgs.length > 0 ? dirArgs : ['.']))
      } else {
        out.reads.push(...pathArgs)
      }
      continue
    }

    if (WRITE_HEADS.has(head)) {
      out.writes.push(...pathArgs)
      if (pathArgs.length === 0) out.mutationCapable = true
      continue
    }

    if (MUTATION_CAPABLE_HEADS.has(head)) {
      out.mutationCapable = true
      continue
    }

    // Unknown head: attribute nothing. Echo and printf-class output through
    // a redirect was already caught above.
  }
  return out
}

// ── Recording ───────────────────────────────────────────────────────────

function resolveInWorkspace(workspaceRoot: string, candidate: string): string | null {
  return resolvePathWithinWorkspace(workspaceRoot, candidate)
}

export function recordShellOutcome(
  conversationId: string,
  command: string,
  exitedCleanly: boolean,
  workspaceRoot: string
): void {
  const s = stateFor(conversationId)
  const cls = classifyShellCommand(command)

  if (cls.stashPush) {
    s.obligations.push({
      kind: 'stash-pop',
      subject: 'git stash',
      note: 'A stash was pushed this conversation and not yet popped.',
      createdAt: Date.now()
    })
  }
  if (cls.stashPop) {
    const idx = s.obligations.findIndex((o) => o.kind === 'stash-pop')
    if (idx >= 0) s.obligations.splice(idx, 1)
  }

  if (cls.mutationCapable && exitedCleanly) {
    s.lastUnattributedMutationAt = Date.now()
  }

  for (const w of cls.writes) {
    const abs = resolveInWorkspace(workspaceRoot, w)
    if (!abs) continue
    // A write invalidates any prior observation; re-observe current bytes
    // when the write succeeded and the file still exists.
    s.files.delete(abs)
    if (exitedCleanly && existsSync(abs)) {
      const obs = hashFileAt(abs)
      if (obs) s.files.set(abs, { ...obs, via: 'shell-read' })
    }
    if (exitedCleanly) s.writes.add(abs)
  }

  if (!exitedCleanly) return

  for (const r of cls.reads) {
    const abs = resolveInWorkspace(workspaceRoot, r)
    if (!abs) continue
    const obs = hashFileAt(abs)
    if (obs) s.files.set(abs, { ...obs, via: 'shell-read' })
  }
  for (const d of cls.dirsListed) {
    const abs = d === '.' ? workspaceRoot : resolveInWorkspace(workspaceRoot, d)
    if (abs) s.dirsListed.set(abs, Date.now())
  }
}

export function recordPatchOutcome(
  conversationId: string,
  ops: { kind: 'add' | 'update' | 'delete'; path: string }[],
  workspaceRoot: string
): void {
  const s = stateFor(conversationId)
  for (const op of ops) {
    const abs = resolveInWorkspace(workspaceRoot, op.path)
    if (!abs) continue
    if (op.kind === 'delete') {
      s.files.delete(abs)
      s.writes.add(abs)
      continue
    }
    const obs = hashFileAt(abs)
    if (obs) s.files.set(abs, { ...obs, via: 'patch-write' })
    s.writes.add(abs)
  }
}

export function recordValidateObservation(conversationId: string, absPath: string): void {
  const s = stateFor(conversationId)
  const obs = hashFileAt(absPath)
  if (obs) s.files.set(absPath, obs)
}

export function recordSearch(
  conversationId: string,
  query: string,
  scope: string,
  hits: number
): void {
  const s = stateFor(conversationId)
  s.searches.push({ query, scope, hits, at: Date.now() })
  if (s.searches.length > MAX_SEARCH_RECORDS) s.searches.shift()
}

// ── Queries ─────────────────────────────────────────────────────────────

export function getFileObservation(
  conversationId: string,
  absPath: string
): FileObservation | undefined {
  return states.get(conversationId)?.files.get(absPath)
}

export type Freshness = 'fresh' | 'stale' | 'unobserved' | 'missing'

/** Compare the recorded observation against current disk bytes. */
export function checkFreshness(conversationId: string, absPath: string): Freshness {
  const obs = getFileObservation(conversationId, absPath)
  if (!existsSync(absPath)) return 'missing'
  if (!obs) return 'unobserved'
  const now = hashFileAt(absPath)
  if (!now) return 'unobserved'
  if (obs.hash !== null && now.hash !== null) return obs.hash === now.hash ? 'fresh' : 'stale'
  return obs.size === now.size && obs.mtimeMs === now.mtimeMs ? 'fresh' : 'stale'
}

export function getSearches(conversationId: string): SearchRecord[] {
  return [...(states.get(conversationId)?.searches ?? [])]
}

export function getWrites(conversationId: string): string[] {
  return [...(states.get(conversationId)?.writes ?? [])]
}

export function getObligations(conversationId: string): RestorationObligation[] {
  return [...(states.get(conversationId)?.obligations ?? [])]
}

export function getLastUnattributedMutationAt(conversationId: string): number | null {
  return states.get(conversationId)?.lastUnattributedMutationAt ?? null
}

export function getDirsListed(conversationId: string): string[] {
  return [...(states.get(conversationId)?.dirsListed.keys() ?? [])]
}

/** Drop all world-model state for a conversation (call on delete). */
export function clearWorldModelState(conversationId: string): void {
  states.delete(conversationId)
}

/** Test-only reset. */
export function __resetWorldModelStateForTesting(): void {
  states.clear()
}
