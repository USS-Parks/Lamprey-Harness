import type { AllowedTools } from './subagent-types'
import type { IdentityStatus } from './agent-identity-store'

// Agentic Orchestration Phase AO-3 — the deterministic tool-grant layer. This
// is the blog's "approve A, B, C; refuse D" made a fact instead of a prompt:
// what a fork may actually touch is decided HERE, at tool-resolution time, from
// the persisted grant — never from language the model could be talked out of.
//
// Two pure functions:
//   classifyGrant       — does this fork need the user's decision, or does it
//                         auto-grant within a read-only floor?
//   resolveEffectiveTools — given the granted set + the type floor, what tools
//                         does the fork actually get? (revoked ⇒ none.)

function dedupeSort(xs: string[]): string[] {
  return [...new Set(xs)].sort()
}

export interface GrantDecision {
  /** Tools usable with no approval (requested ∩ auto-grant floor). */
  autoGranted: string[]
  /** Tools outside the floor — each needs the user's approve/refuse decision.
   *  Empty ⇒ NO approval prompt is raised (the read-only-floor path). */
  needsApproval: string[]
}

/**
 * Classify a fork's requested tools against its auto-grant `floor` — the set of
 * tool ids usable without prompting (AO-5 derives it from the type's
 * allowedTools ∩ read-only-risk tools). Any requested tool outside the floor
 * requires the user's per-tool decision. A fork that requests nothing beyond
 * its floor (read-only types Explore/Plan/code-reviewer, and the tool-less
 * multi_agent_run roles) returns an empty `needsApproval` and raises no prompt.
 */
export function classifyGrant(requestedTools: string[], floor: ReadonlySet<string>): GrantDecision {
  const autoGranted: string[] = []
  const needsApproval: string[] = []
  for (const t of requestedTools) {
    if (floor.has(t)) autoGranted.push(t)
    else needsApproval.push(t)
  }
  return { autoGranted: dedupeSort(autoGranted), needsApproval: dedupeSort(needsApproval) }
}

/** True when a fork can proceed with zero user interaction. */
export function isAutoGrant(requestedTools: string[], floor: ReadonlySet<string>): boolean {
  return classifyGrant(requestedTools, floor).needsApproval.length === 0
}

export interface GrantRequest {
  identityId: string
  agentType: string
  /** Tools the fork could use with no prompt. */
  autoGranted: string[]
  /** Tools the user must approve or refuse, one per chip. */
  pending: string[]
}

/** Shape the grant request the permission channel renders as approve/refuse
 *  chips (decision 3: it rides the existing permission approval surface). */
export function buildGrantRequest(
  identityId: string,
  agentType: string,
  decision: GrantDecision
): GrantRequest {
  return {
    identityId,
    agentType,
    autoGranted: decision.autoGranted,
    pending: decision.needsApproval
  }
}

/**
 * The deterministic enforcement point. AO-5 calls this as the identity layer of
 * `resolveAllowedTools`, intersecting its result with the parent/type/override
 * layers. Rules:
 *   - a REVOKED identity yields ZERO tools (kill switch, no exceptions);
 *   - a NULL identity (the auto-grant-floor path, no grant flow ran) yields the
 *     type floor unchanged;
 *   - otherwise the granted set intersected with the floor — a refused tool is
 *     simply not in `grantedTools`, so it is absent from the result.
 * `typeFloor` is the type's allowedTools already resolved to a concrete list.
 */
export function resolveEffectiveTools(
  typeFloor: string[],
  identity: { status: IdentityStatus; grantedTools: string[] } | null
): string[] {
  if (identity && identity.status === 'revoked') return []
  if (!identity) return dedupeSort(typeFloor)
  const floor = new Set(typeFloor)
  return dedupeSort(identity.grantedTools.filter((t) => floor.has(t)))
}

/** Resolve a type's `allowedTools` to a concrete floor list against the parent's
 *  known tools. `'*'` means "everything the parent has". Mirrors the '*'
 *  semantics of subagent-runner#resolveAllowedTools for the identity layer. */
export function concreteFloor(typeAllowed: AllowedTools, parentTools: string[]): string[] {
  if (typeAllowed === '*') return dedupeSort(parentTools)
  const parent = new Set(parentTools)
  return dedupeSort(typeAllowed.filter((t) => parent.has(t)))
}
