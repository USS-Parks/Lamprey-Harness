import type { Conversation } from './types'
import type { FollowUpStateByConversation } from './follow-up-state'
/** Preserve the requested list membership/order while merging newer canonical rows. */
export function reconcileTaskRows(rows: readonly Conversation[], updates: readonly Conversation[] = []): Conversation[] {
  const newer = new Map<string, Conversation>()
  for (const row of [...rows, ...updates]) {
    const old = newer.get(row.id)
    if (!old || row.updatedAt > old.updatedAt) newer.set(row.id, old ? { ...old, ...row } : row)
  }
  const ids = new Set<string>()
  return rows.filter(row => { if (ids.has(row.id)) return false; ids.add(row.id); return true }).map(row => newer.get(row.id)!)
}
export function partitionTaskRows(rows: readonly Conversation[]): Map<string | null, Conversation[]> {
  const groups = new Map<string | null, Conversation[]>()
  for (const row of reconcileTaskRows(rows)) {
    const key = row.projectId ?? null
    const group = groups.get(key) ?? []
    group.push(row); groups.set(key, group)
  }
  return groups
}
export function taskRunning(owner: string, states: FollowUpStateByConversation): boolean {
  return !!states[owner]?.activeTurn
}
