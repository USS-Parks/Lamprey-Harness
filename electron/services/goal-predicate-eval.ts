// Workspace World Model Phase (WM-15) — the shared predicate engine.
//
// The deterministic core of unmet(g): evaluate one typed goal predicate
// against the live workspace. Extracted from goal-ledger so the product
// (follow-through) and the Lamprey Workspace Bench evaluate goals through
// the SAME code — the bench measures the mechanism, not a parallel copy.

import { existsSync, readFileSync, statSync } from 'fs'
import { resolvePathWithinWorkspace } from './apply-patch-tool'
import type { GoalPredicate } from './goal-extraction'

export interface PredicateResult {
  predicate: GoalPredicate
  met: boolean
  detail: string
}

export type FilePredicate = Exclude<GoalPredicate, { kind: 'command-succeeds' }>

/** Evaluate a file-state predicate against real bytes on disk. */
export function evaluateFilePredicate(
  predicate: FilePredicate,
  workspaceRoot: string
): PredicateResult {
  const abs = resolvePathWithinWorkspace(workspaceRoot, predicate.path)
  if (!abs) {
    return { predicate, met: false, detail: `path "${predicate.path}" is outside the workspace` }
  }
  const exists = existsSync(abs)
  if (predicate.kind === 'file-exists') {
    return { predicate, met: exists, detail: exists ? 'file exists' : 'file missing' }
  }
  if (predicate.kind === 'file-absent') {
    return { predicate, met: !exists, detail: exists ? 'file still present' : 'file absent' }
  }
  if (!exists) return { predicate, met: predicate.kind === 'file-not-contains', detail: 'file missing' }
  let content: string
  try {
    if (!statSync(abs).isFile()) return { predicate, met: false, detail: 'not a regular file' }
    content = readFileSync(abs, 'utf8')
  } catch (err) {
    return {
      predicate,
      met: false,
      detail: `unreadable: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  const has = content.includes(predicate.needle)
  if (predicate.kind === 'file-contains') {
    return { predicate, met: has, detail: has ? 'needle found' : 'needle not found' }
  }
  return { predicate, met: !has, detail: has ? 'needle still present' : 'needle gone' }
}

export type CommandRunner = (command: string) => Promise<{ ok: boolean; detail: string }>

/**
 * Evaluate any predicate. File predicates check disk; command predicates go
 * through the injected runner (the bench and the product supply their own —
 * the product gates dangerous commands upstream, the bench trusts its own
 * fixtures).
 */
export async function evaluatePredicate(
  predicate: GoalPredicate,
  workspaceRoot: string,
  runCommand: CommandRunner
): Promise<PredicateResult> {
  if (predicate.kind === 'command-succeeds') {
    try {
      const r = await runCommand(predicate.command)
      return { predicate, met: r.ok, detail: r.detail }
    } catch (err) {
      return {
        predicate,
        met: false,
        detail: `runner failed: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }
  return evaluateFilePredicate(predicate, workspaceRoot)
}
