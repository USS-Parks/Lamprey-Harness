import { listFailures, type FailureLedgerKind, type FailureLedgerRecord } from './failure-ledger'
import { listProofReceipts } from './proof-receipts'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type RecommendationKind =
  | 'missing_verification'
  | 'repeated_skip'
  | 'noisy_command'
  | 'reviewer_blindspot'
  | 'frequent_waiver'
  | 'stale_green'

export interface HarnessRecommendation {
  id: string
  kind: RecommendationKind
  title: string
  description: string
  severity: 'info' | 'warning' | 'error'
  /** Ledger entries or receipts that triggered this recommendation. */
  evidence: Array<{ type: 'ledger' | 'receipt'; id: string }>
  /** Suggested action the user can approve. No automatic mutation. */
  suggestion: string
}

interface GenerateOptions {
  conversationId?: string
  db?: Database
}

const REPEATED_THRESHOLD = 3
const WAIVER_THRESHOLD = 2

/**
 * Generate deterministic harness improvement recommendations from the
 * failure ledger and proof receipts. Does NOT auto-mutate rules, skills,
 * or hooks. Each recommendation names the specific evidence behind it.
 */
export function generateRecommendations(options: GenerateOptions = {}): HarnessRecommendation[] {
  const recommendations: HarnessRecommendation[] = []

  const failures = listFailures(
    options.conversationId
      ? { conversationId: options.conversationId, limit: 100 }
      : { limit: 100 },
    options.db
  )

  // ── Recommendation: missing verification ──
  // When there are failed receipts but no recent passing receipt for the
  // same command/contract.
  const proofFailed = failures.filter((f) => f.kind === 'proof_failed')
  if (proofFailed.length >= REPEATED_THRESHOLD) {
    const commands = [...new Set(proofFailed.map((f) => f.command).filter(Boolean))]
    const cmdList = commands.slice(0, 3).join(', ')
    recommendations.push({
      id: randomUUID(),
      kind: 'missing_verification',
      title: 'Repeated proof failures without passing verification',
      description:
        `${proofFailed.length} proof failures for commands including ${cmdList || 'unknown'}. ` +
        'Consider adjusting the change contract to include verification commands that pass, ' +
        'or review the failure root cause.',
      severity: 'warning',
      evidence: proofFailed.slice(0, 5).map((f) => ({ type: 'ledger', id: f.id })),
      suggestion: 'Update verification commands in the change contract or fix the underlying failures.'
    })
  }

  // ── Recommendation: repeated skip ──
  // When skipped receipts accumulate for the same command.
  const receipts = listProofReceipts(
    options.conversationId
      ? { conversationId: options.conversationId, status: 'skipped', limit: 50 }
      : { status: 'skipped', limit: 50 },
    { db: options.db, emitEvent: false }
  )
  if (receipts.length >= REPEATED_THRESHOLD) {
    const skippedCommands = [...new Set(receipts.map((r) => r.command))]
    recommendations.push({
      id: randomUUID(),
      kind: 'repeated_skip',
      title: 'Commands repeatedly skipped during verification',
      description:
        `${receipts.length} skipped verification commands across ${skippedCommands.length} distinct commands. ` +
        `Skipped commands: ${skippedCommands.slice(0, 3).join(', ')}. ` +
        'Consider removing unavailable commands from the contract or installing the required tooling.',
      severity: 'warning',
      evidence: receipts.slice(0, 5).map((r) => ({ type: 'receipt', id: r.id })),
      suggestion: 'Remove or replace unavailable commands in the change contract.'
    })
  }

  // ── Recommendation: noisy command ──
  // When receipts have large output and stderr that could benefit from snip filters.
  const noisyReceipts = receipts.filter(
    (r) => r.stderrBytes > 4096 || r.stdoutBytes > 16384
  )
  if (noisyReceipts.length >= 2) {
    const noisyCommands = [...new Set(noisyReceipts.map((r) => r.command))]
    recommendations.push({
      id: randomUUID(),
      kind: 'noisy_command',
      title: 'Large command output could benefit from Snip filters',
      description:
        `${noisyReceipts.length} receipts with large output detected for: ${noisyCommands.slice(0, 3).join(', ')}. ` +
        'Adding a Snip filter can reduce context pressure without losing the raw audit trail.',
      severity: 'info',
      evidence: noisyReceipts.slice(0, 5).map((r) => ({ type: 'receipt', id: r.id })),
      suggestion: `Create a snip filter YAML for: ${noisyCommands.slice(0, 2).join(', ')}`
    })
  }

  // ── Recommendation: reviewer blindspot ──
  // When reviewer validation repeatedly fails.
  const reviewInvalid = failures.filter((f) => f.kind === 'review_invalid')
  if (reviewInvalid.length >= REPEATED_THRESHOLD) {
    recommendations.push({
      id: randomUUID(),
      kind: 'reviewer_blindspot',
      title: 'Reviewer validation repeatedly failed',
      description:
        `${reviewInvalid.length} reviewer outputs failed validation (missing checked failure modes or evidence references). ` +
        'Reviewer prompt may need adjustment or the model may not be following the output contract.',
      severity: 'warning',
      evidence: reviewInvalid.slice(0, 5).map((f) => ({ type: 'ledger', id: f.id })),
      suggestion: 'Review and tighten the reviewer system prompt or switch the reviewer model.'
    })
  }

  // ── Recommendation: frequent waiver ──
  // When the same contract has been waived multiple times.
  const waived = failures.filter((f) => f.kind === 'gate_waived')
  const waiverByContract = new Map<string, number>()
  for (const w of waived) {
    if (w.contractId) {
      waiverByContract.set(w.contractId, (waiverByContract.get(w.contractId) ?? 0) + 1)
    }
  }
  const frequentWaivers = [...waiverByContract.entries()].filter(
    ([, count]) => count >= WAIVER_THRESHOLD
  )
  if (frequentWaivers.length > 0) {
    const contractList = frequentWaivers.slice(0, 3).map(([cid, count]) => `${cid} (${count}×)`).join(', ')
    recommendations.push({
      id: randomUUID(),
      kind: 'frequent_waiver',
      title: 'Frequent proof gate waivers',
      description:
        `${waived.length} total waivers, with contract(s) ${contractList} waived multiple times. ` +
        'Consider making verification requirements less aggressive for these contracts, ' +
        'or adding explicit acceptance criteria.',
      severity: 'info',
      evidence: waived.slice(0, 5).map((w) => ({ type: 'ledger', id: w.id })),
      suggestion: 'Adjust contract acceptance criteria or set explicit verification-optional mode.'
    })
  }

  // ── Recommendation: stale green ──
  // When there are stale-green warnings in the failure ledger.
  const staleGreen = failures.filter((f) => f.kind === 'stale_green_attempt')
  if (staleGreen.length >= REPEATED_THRESHOLD) {
    recommendations.push({
      id: randomUUID(),
      kind: 'stale_green',
      title: 'Stale green: proof receipts predate recent mutations',
      description:
        `${staleGreen.length} stale-green warnings — passing receipts are older than the latest code changes. ` +
        'Agents are working against unverified code. Set up auto-verify triggers or pre-commit hooks.',
      severity: 'warning',
      evidence: staleGreen.slice(0, 5).map((f) => ({ type: 'ledger', id: f.id })),
      suggestion: 'Enable pre-commit hooks from scripts/hooks/ or add verify:proof to CI pre-push.'
    })
  }

  return recommendations
}
