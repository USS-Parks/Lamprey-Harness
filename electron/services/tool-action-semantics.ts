// Workspace World Model Phase (WM-2) — per-tool action semantics ⟨pre, eff⟩.
//
// The GAVEL transition-model analog: for a pending tool call, produce the
// typed requirements that must hold before dispatch and the effects the call
// has on workspace state. Pure analysis — no filesystem access here; WM-3's
// validator evaluates requirements against the live workspace (or WM-5's
// overlay). Tools without an entry return null and pass through untouched.
//
// Coverage contract (locked by tool-action-semantics.test.ts): every
// `mutates: true` NATIVE tool either has semantics here or appears on
// EXEMPT_MUTATING_TOOLS with a reason. MCP tools are never covered — their
// effects are external by definition.

import { parsePatch, type FileOp } from './apply-patch-tool'
import { classifyShellCommand } from './workspace-world-model'

export type RequirementKind = 'within-workspace' | 'exists' | 'absent' | 'anchors'

export interface ActionRequirement {
  kind: RequirementKind
  /** Workspace-relative or model-given path the requirement is about. */
  path: string
  /**
   * 'blocking' requirements gate dispatch in verify/repair mode; 'advisory'
   * requirements only contribute evidence to verdicts. Shell attribution is
   * advisory except for the simple-read case, per WM_BASELINE §4.2 — a wrong
   * attribution must never block a call.
   */
  severity: 'blocking' | 'advisory'
  /** Index into `patchOps` for patch requirements; undefined otherwise. */
  opIndex?: number
}

export interface ActionEffect {
  kind: 'creates' | 'modifies' | 'removes' | 'observes'
  path: string
}

export interface ActionAnalysis {
  tool: string
  requirements: ActionRequirement[]
  effects: ActionEffect[]
  /** apply_patch only: parsed ops for the validator's hunk dry-run. */
  patchOps?: FileOp[]
  /** Fatal analysis failure (malformed patch) — verdict material by itself. */
  malformed?: string
  /** Shell only: the call may mutate paths that cannot be attributed. */
  unattributedMutation?: boolean
}

/**
 * Mutating native tools deliberately OUTSIDE workspace-file semantics, with
 * the reason each is exempt. The lock test fails when a new mutating native
 * tool appears in neither this list nor the analyzer below — the table
 * cannot silently drift as tools are added.
 */
export const EXEMPT_MUTATING_TOOLS: Record<string, string> = {
  memory_add: 'writes the memory DB, not the workspace',
  shell_stop: 'process control; no file preconditions',
  update_plan: 'session plan state',
  create_goal: 'goal store rows',
  update_goal: 'goal store rows',
  verify_workspace: 'runs commands with its own receipt machinery',
  browser_click: 'browser side effects, not workspace files',
  browser_type: 'browser side effects, not workspace files',
  image_generate: 'writes new asset files; its handler owns pathing',
  image_edit: 'asset pipeline owns pathing',
  image_variation: 'asset pipeline owns pathing',
  spawn_task: 'task-control state',
  update_task_metadata: 'task-control state',
  delete_task: 'task-control state with its own preview gate',
  fork_task: 'task-control state',
  schedule_wakeup: 'loop state',
  loop_enqueue: 'loop state',
  loop_complete_task: 'loop state',
  loop_control: 'loop state',
  push_notification: 'notification side effect',
  send_to_task: 'task messaging',
  interrupt_task: 'task control',
  send_to_session: 'session messaging',
  artifact_propose_edit: 'artifact store with its own proposal gate',
  create_visualization: 'artifact store',
  update_visualization: 'artifact store',
  artifact_update: 'artifact store revisioning',
  artifact_annotate: 'artifact store',
  pr_review_start: 'external GitHub write with exact-target approval',
  pr_review_comment: 'external GitHub write with exact-target approval',
  pr_review_reply: 'external GitHub write with exact-target approval',
  pr_review_submit: 'external GitHub write with exact-target approval',
  pr_finding_create: 'PR store rows',
  pr_patch_propose: 'PR patch store',
  pr_patch_edit: 'PR patch store',
  pr_patch_accept: 'applies via the canonical workspace authority with its own stale-head fail-closed gate',
  pr_patch_reject: 'PR patch store',
  automation_update: 'automation store',
  automation_delete: 'automation store',
  automation_run_now: 'automation trigger',
  goal_bind_loop: 'goal/loop binding rows',
  automation_bind_goal: 'automation/goal binding rows'
}

const SIMPLE_READ_HEADS = new Set(['cat', 'type', 'head', 'tail', 'get-content', 'gc'])

/**
 * True when the command is one segment, a strict read head, no redirection —
 * the only shape whose missing-path requirement is safe to make blocking.
 */
export function isSimpleReadCommand(command: string): boolean {
  if (/[;|&]|\n/.test(command)) return false
  if (/>{1,2}/.test(command)) return false
  const tokens = command.trim().split(/\s+/)
  if (tokens.length < 2) return false
  const head = (tokens[0].split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '')
  return SIMPLE_READ_HEADS.has(head)
}

function analyzeApplyPatch(args: Record<string, unknown>): ActionAnalysis {
  const analysis: ActionAnalysis = { tool: 'apply_patch', requirements: [], effects: [] }
  let ops: FileOp[]
  try {
    ops = parsePatch(typeof args.patch === 'string' ? args.patch : '')
  } catch (err) {
    analysis.malformed = err instanceof Error ? err.message : String(err)
    return analysis
  }
  analysis.patchOps = ops
  ops.forEach((op, opIndex) => {
    analysis.requirements.push({ kind: 'within-workspace', path: op.path, severity: 'blocking', opIndex })
    if (op.kind === 'add') {
      analysis.requirements.push({ kind: 'absent', path: op.path, severity: 'blocking', opIndex })
      analysis.effects.push({ kind: 'creates', path: op.path })
    } else if (op.kind === 'delete') {
      analysis.requirements.push({ kind: 'exists', path: op.path, severity: 'blocking', opIndex })
      analysis.effects.push({ kind: 'removes', path: op.path })
    } else {
      analysis.requirements.push({ kind: 'exists', path: op.path, severity: 'blocking', opIndex })
      analysis.requirements.push({ kind: 'anchors', path: op.path, severity: 'blocking', opIndex })
      analysis.effects.push({ kind: 'modifies', path: op.path })
    }
  })
  return analysis
}

function analyzeShellCommand(args: Record<string, unknown>): ActionAnalysis {
  const analysis: ActionAnalysis = { tool: 'shell_command', requirements: [], effects: [] }
  const command = typeof args.command === 'string' ? args.command : ''
  if (!command) return analysis
  const cls = classifyShellCommand(command)
  const blockingReads = isSimpleReadCommand(command)
  for (const r of cls.reads) {
    analysis.requirements.push({
      kind: 'exists',
      path: r,
      severity: blockingReads ? 'blocking' : 'advisory'
    })
    analysis.effects.push({ kind: 'observes', path: r })
  }
  for (const w of cls.writes) {
    analysis.effects.push({ kind: 'modifies', path: w })
  }
  if (cls.mutationCapable) analysis.unattributedMutation = true
  return analysis
}

/**
 * Analyze a pending tool call. Returns null for tools without semantics —
 * the caller passes those through untouched, exactly as before the phase.
 */
export function analyzeToolCall(
  toolName: string,
  args: Record<string, unknown>
): ActionAnalysis | null {
  if (toolName === 'apply_patch') return analyzeApplyPatch(args)
  if (toolName === 'shell_command') return analyzeShellCommand(args)
  return null
}

/** Tools the analyzer covers; the lock test asserts full mutating coverage. */
export const ANALYZED_TOOLS: readonly string[] = ['apply_patch', 'shell_command']
