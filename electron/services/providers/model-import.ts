export interface ImportModelRecord {
  id: string
  name: string
  apiModelId?: string
  provider: string
  contextWindow: number
  supportsTools: boolean
  supportsVision: boolean
}

export interface ImportModelIdentity {
  id: string
  apiModelId?: string
  provider: string
}

/** Build collision-safe custom model records for a live provider catalog.
 * Provider ids remain local identifiers; apiModelId is always verbatim. */
export function buildLiveModelImports(
  provider: string,
  requestedIds: unknown[],
  existing: ImportModelIdentity[]
): { additions: ImportModelRecord[]; skipped: number } {
  const requested = [
    ...new Set(
      requestedIds
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ].slice(0, 2_000)
  const exact = new Set(existing.map((m) => `${m.provider}\u0000${m.apiModelId ?? m.id}`))
  const localIds = new Set(existing.map((m) => m.id))
  const additions: ImportModelRecord[] = []
  let skipped = 0

  for (const apiModelId of requested) {
    if (exact.has(`${provider}\u0000${apiModelId}`)) {
      skipped++
      continue
    }
    let id = apiModelId
    if (localIds.has(id)) id = `${provider}:${apiModelId}`
    let suffix = 2
    const baseId = id
    while (localIds.has(id)) id = `${baseId}:${suffix++}`
    localIds.add(id)
    exact.add(`${provider}\u0000${apiModelId}`)
    additions.push({
      id,
      apiModelId,
      name: apiModelId,
      provider,
      contextWindow: 65_536,
      supportsTools: false,
      supportsVision: false
    })
  }

  return { additions, skipped }
}

