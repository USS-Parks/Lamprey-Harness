// Workspace World Model Phase (WM-3) — VALIDATE.
//
// Evaluates a WM-2 analysis against the live workspace (or a WM-5 overlay)
// and produces the structured verdict ω. The live filesystem is the
// authoritative graph (WM_BASELINE §4.1): existence and anchoring are
// checked against real bytes, and the WM-1 observation ledger contributes
// evidence lines only. The apply_patch hunk dry-run here predicts the exact
// "patch did not apply at hunk N" failure before dispatch, including
// multi-op partial application the disk applier cannot roll back.

import { existsSync, readFileSync, statSync } from 'fs'
import {
  applyHunk,
  resolvePathWithinWorkspace,
  type FileOp,
  type Hunk
} from './apply-patch-tool'
import type { ActionAnalysis, ActionRequirement } from './tool-action-semantics'
import { checkFreshness, getFileObservation } from './workspace-world-model'

export interface VerdictViolation {
  kind: 'within-workspace' | 'exists' | 'absent' | 'anchors' | 'malformed-patch'
  path?: string
  severity: 'blocking' | 'advisory'
  /** State facts proving the violation, compact enough for a 4B model. */
  evidence: string
  /** True when WM-4's deterministic repair tier may resolve it. */
  repairable: boolean
  opIndex?: number
  hunkIndex?: number
  /** Minimal fix, stated as the next concrete action. */
  fix?: string
}

export interface WorldModelVerdict {
  applicable: boolean
  violations: VerdictViolation[]
}

/**
 * Virtual overlay for WM-5 rollforward: paths created/modified map to
 * simulated content; removed paths map to null. Absent keys defer to disk.
 */
export type WorkspaceOverlay = Map<string, string | null>

export interface ValidateContext {
  workspaceRoot: string
  conversationId: string
  overlay?: WorkspaceOverlay
}

const EVIDENCE_LINE_CAP = 12
const EVIDENCE_CHAR_CAP = 800

function overlayAwareExists(ctx: ValidateContext, abs: string): boolean {
  if (ctx.overlay?.has(abs)) return ctx.overlay.get(abs) !== null
  return existsSync(abs)
}

function overlayAwareRead(ctx: ValidateContext, abs: string): string | null {
  if (ctx.overlay?.has(abs)) return ctx.overlay.get(abs) ?? null
  try {
    if (!statSync(abs).isFile()) return null
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

function observationEvidence(ctx: ValidateContext, abs: string): string {
  const obs = getFileObservation(ctx.conversationId, abs)
  if (!obs) return 'This conversation has not observed the file.'
  const freshness = checkFreshness(ctx.conversationId, abs)
  if (freshness === 'stale') {
    return 'The file changed after this conversation last observed it — re-read before editing.'
  }
  return `Last observed this conversation via ${obs.via}.`
}

/** Quote the file region nearest the failed hunk so the model can re-anchor. */
function anchorEvidence(fileLines: string[], expected: string[]): string {
  const probe = expected.find((l) => l.trim() !== '')
  if (probe === undefined) return 'The hunk has no context or deletion lines to anchor with.'
  const idx = fileLines.findIndex((l) => l === probe)
  if (idx === -1) {
    const trimmedIdx = fileLines.findIndex((l) => l.trim() === probe.trim())
    if (trimmedIdx !== -1) {
      return (
        `Line ${trimmedIdx + 1} matches the hunk apart from whitespace. Current bytes:\n` +
        quoteRegion(fileLines, trimmedIdx, expected.length)
      )
    }
    return 'No line of the expected block exists in the current file. ' +
      'The file content differs from what the patch assumes.'
  }
  return (
    `The first expected line matches at line ${idx + 1}, but the full block does not. ` +
    `Current bytes:\n` + quoteRegion(fileLines, idx, expected.length)
  )
}

function quoteRegion(fileLines: string[], start: number, len: number): string {
  const s = Math.max(0, start - 1)
  const e = Math.min(fileLines.length, start + Math.min(len, EVIDENCE_LINE_CAP) + 1)
  const region = fileLines
    .slice(s, e)
    .map((l, i) => `${s + i + 1}| ${l}`)
    .join('\n')
  return region.length > EVIDENCE_CHAR_CAP ? region.slice(0, EVIDENCE_CHAR_CAP) + '…' : region
}

/** Build the expected (context + deletion) block the way the applier does. */
export function hunkExpectedBlock(hunk: Hunk): string[] {
  const expected: string[] = []
  for (const b of hunk.body) {
    if (b.tag === 'keep' || b.tag === 'remove') expected.push(b.text)
  }
  return expected
}

function splitFileLines(raw: string): { lines: string[]; hadTrailingNl: boolean } {
  const hadTrailingNl = raw.endsWith('\n')
  const lines = raw.split('\n')
  if (hadTrailingNl) lines.pop()
  return { lines, hadTrailingNl }
}

/**
 * Dry-run every hunk of an update op against content. Returns null on
 * success (with the resulting content for overlay updates) or the failing
 * hunk index plus evidence.
 */
export function dryRunUpdate(
  op: Extract<FileOp, { kind: 'update' }>,
  raw: string
): { ok: true; content: string } | { ok: false; hunkIndex: number; evidence: string } {
  const { lines, hadTrailingNl } = splitFileLines(raw)
  let next = lines
  for (let h = 0; h < op.hunks.length; h++) {
    try {
      next = applyHunk(next, op.hunks[h], h)
    } catch {
      const expected = hunkExpectedBlock(op.hunks[h])
      return { ok: false, hunkIndex: h, evidence: anchorEvidence(next, expected) }
    }
  }
  return { ok: true, content: next.join('\n') + (hadTrailingNl ? '\n' : '') }
}

const PATCH_GRAMMAR_REMINDER =
  'apply_patch takes one "patch" string: "*** Begin Patch" … "*** End Patch" with ' +
  '"*** Add File: <path>" (+ lines), "*** Update File: <path>" (@@ hunks of " "/"-"/"+" lines), ' +
  'or "*** Delete File: <path>" directives.'

/**
 * VALIDATE — evaluate an analysis. Also applies the analysis effects to the
 * overlay when one is provided AND the verdict is applicable, so WM-5 can
 * roll a sequence forward on the same context.
 */
export function validateAnalysis(
  analysis: ActionAnalysis,
  ctx: ValidateContext
): WorldModelVerdict {
  const violations: VerdictViolation[] = []

  if (analysis.malformed) {
    violations.push({
      kind: 'malformed-patch',
      severity: 'blocking',
      evidence: analysis.malformed,
      repairable: false,
      fix: PATCH_GRAMMAR_REMINDER
    })
    return { applicable: false, violations }
  }

  const resolved = new Map<string, string | null>()
  const resolveReq = (req: ActionRequirement): string | null => {
    if (!resolved.has(req.path)) {
      resolved.set(req.path, resolvePathWithinWorkspace(ctx.workspaceRoot, req.path))
    }
    return resolved.get(req.path) ?? null
  }

  for (const req of analysis.requirements) {
    const abs = resolveReq(req)
    if (req.kind === 'within-workspace') {
      if (abs === null) {
        violations.push({
          kind: 'within-workspace',
          path: req.path,
          severity: req.severity,
          evidence:
            'The path escapes the workspace root, contains "..", or is empty. ' +
            'All paths must stay inside the workspace.',
          repairable: /\\/.test(req.path) || req.path.startsWith('/') || /^[A-Za-z]:/.test(req.path),
          opIndex: req.opIndex,
          fix: 'Use a workspace-relative path with forward slashes.'
        })
      }
      continue
    }
    if (abs === null) continue // the within-workspace violation already covers it

    if (req.kind === 'exists' && !overlayAwareExists(ctx, abs)) {
      violations.push({
        kind: 'exists',
        path: req.path,
        severity: req.severity,
        evidence: `No file at "${req.path}". ${observationEvidence(ctx, abs)}`,
        repairable: true,
        opIndex: req.opIndex,
        fix: 'List the directory or search for the file before retrying.'
      })
      continue
    }
    if (req.kind === 'absent' && overlayAwareExists(ctx, abs)) {
      violations.push({
        kind: 'absent',
        path: req.path,
        severity: req.severity,
        evidence:
          `"${req.path}" already exists — Add File refuses to overwrite. ` +
          observationEvidence(ctx, abs),
        repairable: false,
        opIndex: req.opIndex,
        fix: 'Use "*** Update File:" with hunks to change it, or pick a different path.'
      })
      continue
    }
    if (req.kind === 'anchors') {
      const op = analysis.patchOps?.[req.opIndex ?? -1]
      if (!op || op.kind !== 'update') continue
      const raw = overlayAwareRead(ctx, abs)
      if (raw === null) continue // exists violation already covers it
      const run = dryRunUpdate(op, raw)
      if (!run.ok) {
        violations.push({
          kind: 'anchors',
          path: req.path,
          severity: req.severity,
          evidence:
            `Hunk ${run.hunkIndex + 1} does not match the current file. ${run.evidence}\n` +
            observationEvidence(ctx, abs),
          repairable: true,
          opIndex: req.opIndex,
          hunkIndex: run.hunkIndex,
          fix: 'Rewrite the hunk context to match the current bytes quoted above.'
        })
      }
    }
  }

  const applicable = !violations.some((v) => v.severity === 'blocking')

  if (applicable && ctx.overlay) {
    applyEffectsToOverlay(analysis, ctx)
  }

  return { applicable, violations }
}

/** Advance the overlay by this call's effects (WM-5 rollforward step). */
export function applyEffectsToOverlay(analysis: ActionAnalysis, ctx: ValidateContext): void {
  const overlay = ctx.overlay
  if (!overlay) return
  if (analysis.patchOps) {
    for (const op of analysis.patchOps) {
      const abs = resolvePathWithinWorkspace(ctx.workspaceRoot, op.path)
      if (!abs) continue
      if (op.kind === 'add') {
        overlay.set(abs, op.lines.join('\n') + (op.lines.length > 0 ? '\n' : ''))
      } else if (op.kind === 'delete') {
        overlay.set(abs, null)
      } else {
        const raw = overlayAwareRead(ctx, abs)
        if (raw === null) continue
        const run = dryRunUpdate(op, raw)
        if (run.ok) overlay.set(abs, run.content)
      }
    }
    return
  }
  for (const eff of analysis.effects) {
    if (eff.kind === 'modifies' || eff.kind === 'removes') {
      const abs = resolvePathWithinWorkspace(ctx.workspaceRoot, eff.path)
      // A shell write we cannot simulate degrades the overlay entry to
      // "unknown": drop it so later checks fall back to disk, which will be
      // current by the time the call actually runs.
      if (abs) overlay.delete(abs)
    }
  }
}

/** Shape the verdict as the corrective tool result the model receives. */
export function verdictToolResult(toolName: string, verdict: WorldModelVerdict): string {
  return JSON.stringify({
    error: 'world_model_precondition_failed',
    tool: toolName,
    violations: verdict.violations.map((v) => ({
      kind: v.kind,
      path: v.path,
      severity: v.severity,
      evidence: v.evidence,
      ...(v.hunkIndex !== undefined ? { hunk: v.hunkIndex + 1 } : {}),
      ...(v.fix ? { fix: v.fix } : {})
    })),
    hint:
      'The call was NOT executed. Fix the first blocking violation using the evidence ' +
      'given — do not re-issue the identical call.'
  })
}
