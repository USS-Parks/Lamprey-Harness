// Workspace World Model Phase (WM-4) — REPAIR.
//
// GAVEL Alg. 2 adapted to the workspace: apply deterministic edits whose
// correctness follows from the action semantics and the live workspace,
// re-validating after each edit, with a visited set against cycles, a
// bounded edit count, and best-candidate retention (fewest blocking
// violations wins) so a non-monotonic edit chain still returns the best
// call seen. Three edit families, all mechanical:
//
//   normalize-path       — backslashes → forward slashes; absolute paths
//                          under the workspace root → workspace-relative.
//   resolve-basename     — a missing target whose basename matches exactly
//                          ONE file in the workspace resolves to it.
//   reanchor-whitespace  — a hunk whose context/deletion block matches the
//                          file line-for-line after trimming is rewritten
//                          to the file's actual bytes.
//
// Anything else stays a verdict for the model. Repairs never mutate the
// workspace — they rewrite the CALL, and the real handler still executes
// under the standard approval and audit path.

import { isAbsolute, relative, resolve, sep } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'
import {
  parsePatch,
  resolvePathWithinWorkspace,
  type FileOp,
  type Hunk
} from './apply-patch-tool'
import { analyzeToolCall } from './tool-action-semantics'
import {
  hunkExpectedBlock,
  validateAnalysis,
  type ValidateContext,
  type VerdictViolation,
  type WorldModelVerdict
} from './world-model-validate'

export interface RepairNote {
  kind: 'normalize-path' | 'resolve-basename' | 'reanchor-whitespace'
  detail: string
}

export interface RepairResult {
  outcome: 'repaired' | 'verdict'
  /** The (possibly rewritten) arguments to dispatch. */
  args: Record<string, unknown>
  /** Final verdict: applicable when outcome is 'repaired'. */
  verdict: WorldModelVerdict
  notes: RepairNote[]
  editsUsed: number
}

const MAX_EDITS = 8
const WALK_DIR_SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.cache', 'coverage'])
const WALK_ENTRY_CAP = 20_000

// ── Patch serialization (roundtrip-locked by the test suite) ────────────

export function serializeOps(ops: FileOp[]): string {
  const lines: string[] = ['*** Begin Patch']
  for (const op of ops) {
    if (op.kind === 'add') {
      lines.push(`*** Add File: ${op.path}`)
      for (const l of op.lines) lines.push(`+${l}`)
    } else if (op.kind === 'delete') {
      lines.push(`*** Delete File: ${op.path}`)
    } else {
      lines.push(`*** Update File: ${op.path}`)
      for (const h of op.hunks) {
        lines.push(h.anchor ? `@@ ${h.anchor}` : '@@')
        for (const b of h.body) {
          lines.push((b.tag === 'add' ? '+' : b.tag === 'remove' ? '-' : ' ') + b.text)
        }
      }
    }
  }
  lines.push('*** End Patch')
  return lines.join('\n')
}

// ── Workspace walk for basename resolution ──────────────────────────────

export function findByBasename(workspaceRoot: string, basename: string): string[] {
  const matches: string[] = []
  const queue: string[] = [workspaceRoot]
  let seen = 0
  while (queue.length > 0 && seen < WALK_ENTRY_CAP && matches.length < 3) {
    const dir = queue.shift()!
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (++seen > WALK_ENTRY_CAP) break
      const full = resolve(dir, e.name)
      if (e.isDirectory()) {
        if (!WALK_DIR_SKIP.has(e.name) && !e.name.startsWith('.')) queue.push(full)
      } else if (e.name === basename) {
        matches.push(full)
        if (matches.length >= 3) break
      }
    }
  }
  return matches
}

// ── Edit derivation ─────────────────────────────────────────────────────

function normalizePathCandidate(workspaceRoot: string, p: string): string | null {
  let candidate = p.replace(/\\/g, '/')
  if (isAbsolute(candidate) || /^[A-Za-z]:/.test(candidate)) {
    const rel = relative(resolve(workspaceRoot), resolve(candidate))
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
    candidate = rel.split(sep).join('/')
  }
  return candidate === p ? null : candidate
}

function rewritePatchPath(patch: string, from: string, to: string): string {
  const ops = parsePatch(patch)
  for (const op of ops) {
    if (op.path === from) op.path = to
  }
  return serializeOps(ops)
}

function rewriteShellToken(command: string, from: string, to: string): string | null {
  if (!command.includes(from)) return null
  return command.split(from).join(to)
}

/** Trim-match the expected block in fileLines; returns the start index or -1. */
export function trimMatchIndex(fileLines: string[], expected: string[]): number {
  if (expected.length === 0) return -1
  const max = fileLines.length - expected.length
  for (let start = 0; start <= max; start++) {
    let ok = true
    for (let j = 0; j < expected.length; j++) {
      if (fileLines[start + j].trim() !== expected[j].trim()) {
        ok = false
        break
      }
    }
    if (ok) return start
  }
  return -1
}

function leadingWhitespace(s: string): string {
  return s.match(/^\s*/)?.[0] ?? ''
}

/**
 * Rewrite a hunk's keep/remove texts to the file's actual bytes at `start`,
 * and re-indent add lines by the same whitespace delta as their nearest
 * non-add neighbor so an insert into indented code stays indented.
 */
export function reanchorHunk(hunk: Hunk, fileLines: string[], start: number): Hunk {
  let offset = 0
  let lastModelLead = ''
  let lastFileLead = ''
  const body = hunk.body.map((b) => {
    if (b.tag === 'add') {
      if (lastModelLead !== lastFileLead && b.text.startsWith(lastModelLead)) {
        return { ...b, text: lastFileLead + b.text.slice(lastModelLead.length) }
      }
      return b
    }
    const fileText = fileLines[start + offset]
    offset++
    lastModelLead = leadingWhitespace(b.text)
    lastFileLead = leadingWhitespace(fileText)
    return { ...b, text: fileText }
  })
  return { ...hunk, body }
}

interface EditOutcome {
  args: Record<string, unknown>
  note: RepairNote
}

function deriveEdit(
  toolName: string,
  args: Record<string, unknown>,
  violation: VerdictViolation,
  ctx: ValidateContext
): EditOutcome | null {
  const path = violation.path
  if (!path) return null

  if (violation.kind === 'within-workspace') {
    const candidate = normalizePathCandidate(ctx.workspaceRoot, path)
    if (!candidate) return null
    return applyPathRewrite(toolName, args, path, candidate, {
      kind: 'normalize-path',
      detail: `"${path}" → "${candidate}"`
    })
  }

  if (violation.kind === 'exists') {
    // Separator normalization first: a backslash path resolves inside the
    // workspace on every platform but names a file that does not literally
    // exist on POSIX. When the normalized spelling exists, prefer it over
    // the basename walk.
    if (path.includes('\\')) {
      const normalized = path.replace(/\\/g, '/')
      const abs = resolvePathWithinWorkspace(ctx.workspaceRoot, normalized)
      if (abs && existsSync(abs)) {
        return applyPathRewrite(toolName, args, path, normalized, {
          kind: 'normalize-path',
          detail: `"${path}" → "${normalized}"`
        })
      }
    }
    const basename = path.replace(/\\/g, '/').split('/').pop() ?? path
    const matches = findByBasename(ctx.workspaceRoot, basename)
    if (matches.length !== 1) return null
    const rel = relative(resolve(ctx.workspaceRoot), matches[0]).split(sep).join('/')
    if (rel === path) return null
    return applyPathRewrite(toolName, args, path, rel, {
      kind: 'resolve-basename',
      detail: `"${path}" → "${rel}" (unique basename match)`
    })
  }

  if (violation.kind === 'anchors' && toolName === 'apply_patch') {
    return deriveReanchorEdit(args, violation, ctx)
  }

  return null
}

function applyPathRewrite(
  toolName: string,
  args: Record<string, unknown>,
  from: string,
  to: string,
  note: RepairNote
): EditOutcome | null {
  if (toolName === 'apply_patch' && typeof args.patch === 'string') {
    try {
      return { args: { ...args, patch: rewritePatchPath(args.patch, from, to) }, note }
    } catch {
      return null
    }
  }
  if (toolName === 'shell_command' && typeof args.command === 'string') {
    const rewritten = rewriteShellToken(args.command, from, to)
    if (rewritten === null) return null
    return { args: { ...args, command: rewritten }, note }
  }
  return null
}

function deriveReanchorEdit(
  args: Record<string, unknown>,
  violation: VerdictViolation,
  ctx: ValidateContext
): EditOutcome | null {
  if (typeof args.patch !== 'string') return null
  let ops: FileOp[]
  try {
    ops = parsePatch(args.patch)
  } catch {
    return null
  }
  const opIndex = violation.opIndex ?? -1
  const hunkIndex = violation.hunkIndex ?? -1
  const op = ops[opIndex]
  if (!op || op.kind !== 'update' || hunkIndex < 0 || hunkIndex >= op.hunks.length) return null

  const abs = resolvePathWithinWorkspace(ctx.workspaceRoot, op.path)
  if (!abs) return null
  let raw: string
  try {
    raw = readFileSync(abs, 'utf8')
  } catch {
    return null
  }
  const hadTrailingNl = raw.endsWith('\n')
  const fileLines = raw.split('\n')
  if (hadTrailingNl) fileLines.pop()

  const hunk = op.hunks[hunkIndex]
  const expected = hunkExpectedBlock(hunk)
  const start = trimMatchIndex(fileLines, expected)
  if (start === -1) return null

  op.hunks[hunkIndex] = reanchorHunk(hunk, fileLines, start)
  return {
    args: { ...args, patch: serializeOps(ops) },
    note: {
      kind: 'reanchor-whitespace',
      detail: `hunk ${hunkIndex + 1} of "${op.path}" re-anchored to line ${start + 1} (whitespace-only mismatch)`
    }
  }
}

// ── The repair loop (Alg. 2) ────────────────────────────────────────────

function countBlocking(verdict: WorldModelVerdict): number {
  return verdict.violations.filter((v) => v.severity === 'blocking').length
}

export function repairToolCall(
  toolName: string,
  initialArgs: Record<string, unknown>,
  ctx: ValidateContext
): RepairResult {
  const notes: RepairNote[] = []
  const visited = new Set<string>([JSON.stringify(initialArgs)])

  let args = initialArgs
  let verdict = validateArgs(toolName, args, ctx)
  let best: { args: Record<string, unknown>; verdict: WorldModelVerdict; notes: RepairNote[] } = {
    args,
    verdict,
    notes: []
  }
  let editsUsed = 0

  while (!verdict.applicable && editsUsed < MAX_EDITS) {
    const target = verdict.violations.find((v) => v.severity === 'blocking' && v.repairable)
    if (!target) break
    const edit = deriveEdit(toolName, args, target, ctx)
    if (!edit) break
    const key = JSON.stringify(edit.args)
    if (visited.has(key)) break
    visited.add(key)
    editsUsed++
    args = edit.args
    notes.push(edit.note)
    verdict = validateArgs(toolName, args, ctx)
    // Ties prefer the LATER candidate: an equal-violation-count verdict after
    // an edit (e.g. exists resolved, anchors now the blocker) carries more
    // actionable evidence for the model than the pre-edit one.
    if (countBlocking(verdict) <= countBlocking(best.verdict)) {
      best = { args, verdict, notes: [...notes] }
    }
  }

  if (verdict.applicable) {
    return { outcome: 'repaired', args, verdict, notes, editsUsed }
  }
  return { outcome: 'verdict', args: best.args, verdict: best.verdict, notes: best.notes, editsUsed }
}

function validateArgs(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ValidateContext
): WorldModelVerdict {
  const analysis = analyzeToolCall(toolName, args)
  if (!analysis) return { applicable: true, violations: [] }
  return validateAnalysis(analysis, ctx)
}
