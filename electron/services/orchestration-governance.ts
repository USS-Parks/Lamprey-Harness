import { randomUUID } from 'crypto'
import { readOrchestrationConfig, type OrchestrationConfig } from './orchestration-config'
import * as identities from './agent-identity-store'
import type { IdentityScopeKind } from './agent-identity-store'
import { classifyGrant } from './agent-grants'
import { recordEvent } from './event-log'

// Agentic Orchestration Phase AO-5 — the governance seam that threads identity +
// budget onto the EXISTING fork paths. Its defining property: when the master
// toggle is OFF, `governFork` returns `{ identityId: null }` and writes NOTHING,
// so multi_agent_run / tasks / workflow forks run byte-for-byte as before. The
// enabled path mints an auto-granted identity (within-floor tools granted
// immediately; anything beyond stays pending the user's decision) carrying the
// run's budget ceilings.

export interface GovernScope {
  conversationId: string | null
  scopeKind: IdentityScopeKind
  agentType: string
  /** Tools the fork wants. Tool-less forks (multi_agent_run roles) pass []. */
  requestedTools: string[]
  /** Auto-grant floor — tools usable with no prompt (read-only set). */
  floor: ReadonlySet<string>
  label: string
}

export interface GovernResult {
  /** NULL ⇒ orchestration is off; the caller takes its existing path. */
  identityId: string | null
  /** Tools awaiting the user's approve/refuse decision (AO-6+ approval wiring). */
  needsApproval: string[]
}

export interface GovernDeps {
  config?: OrchestrationConfig
  createIdentity?: typeof identities.createIdentity
  genId?: () => string
  now?: () => number
}

export function governFork(scope: GovernScope, deps: GovernDeps = {}): GovernResult {
  const cfg = deps.config ?? readOrchestrationConfig()
  if (!cfg.enabled) return { identityId: null, needsApproval: [] }

  const create = deps.createIdentity ?? identities.createIdentity
  const genId = deps.genId ?? (() => randomUUID())
  const now = deps.now ?? (() => Date.now())

  const decision = classifyGrant(scope.requestedTools, scope.floor)
  const id = genId()
  create({
    id,
    label: scope.label,
    agentType: scope.agentType,
    scopeKind: scope.scopeKind,
    scopeId: scope.conversationId,
    requestedTools: scope.requestedTools,
    grantedTools: decision.autoGranted,
    tokensCeiling: cfg.maxTokensPerRun,
    wallMsCeiling: cfg.maxWallclockMs,
    createdAt: now()
  })
  // AO-10 — audit ledger. Payload carries ids + COUNTS only, never tool
  // arguments (the keychain-event contract). Failures are swallowed: the
  // identity write is the load-bearing side-effect.
  try {
    recordEvent({
      type: 'security.decision',
      actorKind: 'user',
      entityKind: 'agent-identity',
      entityId: id,
      payload: {
        action: 'created',
        identityId: id,
        agentType: scope.agentType,
        scopeKind: scope.scopeKind,
        grantedCount: decision.autoGranted.length,
        pendingCount: decision.needsApproval.length
      }
    })
  } catch (err) {
    console.error('[orchestration] identity.created event failed:', err)
  }
  return { identityId: id, needsApproval: decision.needsApproval }
}

/** Accumulate a run's total spend onto its identity. No-op when the run had no
 *  identity (orchestration off). */
export function settleRunSpend(
  identityId: string | null,
  tokens: number,
  wallMs: number,
  deps: { accumulate?: typeof identities.accumulateSpend } = {}
): void {
  if (!identityId) return
  const acc = deps.accumulate ?? identities.accumulateSpend
  acc(identityId, tokens, wallMs)
}
