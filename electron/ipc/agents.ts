import { ipcMain } from 'electron'
import * as identities from '../services/agent-identity-store'
import { listRunningRunIdsByIdentity } from '../services/agent-run-store'
import { getLiveHandle } from '../services/subagent-runner'
import { recordEvent } from '../services/event-log'
import { readOrchestrationConfig } from '../services/orchestration-config'

// Agentic Orchestration Phase AO-3 — the agents:* IPC: the inventory + kill
// surface over the identity ledger. Gated on the master toggle: when
// orchestration is off, list returns empty and revoke is a no-op, so nothing
// in the UI can act on identities that can't exist.
//
// Grant RESPONSES ride the existing permission approval chips (decision 3) —
// the per-tool approve/refuse decision is persisted via identities.grantIdentity
// from the permission handler (AO-5 wiring); there is no separate grant-respond
// channel here.

/** Emit an identity-lifecycle event. Payloads carry ids + counts only, never
 *  tool arguments (the keychain-event contract). */
function emitIdentityEvent(
  action: 'created' | 'granted' | 'refused' | 'revoked',
  identityId: string,
  extra: Record<string, unknown> = {}
): void {
  try {
    recordEvent({
      type: 'security.decision',
      actorKind: 'user',
      entityKind: 'agent-identity',
      entityId: identityId,
      payload: { action, identityId, ...extra }
    })
  } catch (err) {
    console.error('[agents] identity event failed:', err)
  }
}

export function registerAgentsHandlers(): void {
  // List identities for a conversation scope (the Agents pill's primary read).
  ipcMain.handle('agents:list', async (_e, conversationId: unknown) => {
    try {
      if (!readOrchestrationConfig().enabled) return { success: true, data: [] }
      const scopeId = typeof conversationId === 'string' ? conversationId : null
      const rows = identities.listIdentitiesByScope('conversation', scopeId)
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'agents:list failed' }
    }
  })

  ipcMain.handle('agents:get', async (_e, id: unknown) => {
    try {
      if (typeof id !== 'string') return { success: false, error: 'identity id required' }
      return { success: true, data: identities.getIdentity(id) }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'agents:get failed' }
    }
  })

  // Revoke an identity: flip status → 'revoked' (future tool resolution yields
  // zero tools, enforced deterministically in agent-grants.resolveEffectiveTools)
  // and abort any of its in-flight runs. Idempotent.
  ipcMain.handle('agents:revoke', async (_e, id: unknown) => {
    try {
      if (typeof id !== 'string') return { success: false, error: 'identity id required' }
      const existing = identities.getIdentity(id)
      if (!existing) return { success: false, error: `unknown identity: ${id}` }
      identities.revokeIdentity(id, Date.now())
      // Abort in-flight runs linked to this identity (AO-5 populates the link;
      // pre-AO-5 rows return nothing — harmless).
      let aborted = 0
      for (const runId of listRunningRunIdsByIdentity(id)) {
        const handle = getLiveHandle(runId)
        if (handle) {
          handle.abort('identity-revoked')
          aborted++
        }
      }
      emitIdentityEvent('revoked', id, { abortedRuns: aborted })
      return { success: true, data: { revoked: true, abortedRuns: aborted } }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'agents:revoke failed' }
    }
  })
}

/** Exported for AO-5's fork wiring so identity creation + grant decisions emit
 *  the same audited events as the IPC path. */
export const agentIdentityEvents = { emit: emitIdentityEvent }
