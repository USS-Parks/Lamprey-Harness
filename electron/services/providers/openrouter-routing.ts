/**
 * TL-B2/B3 — OpenRouter request extras (fallbacks + provider prefs).
 *
 * OpenRouter extra JSON on the OpenAI-compatible chat body:
 *   models: string[]                         ordered fallbacks
 *   provider: { sort, order, ignore }        routing prefs
 *
 * Empty settings must produce `{}` so a default OpenRouter call stays
 * identical to pre-Triple-Lane (K4). Never attach these fields to any
 * other provider.
 */

export type OpenRouterSort = 'default' | 'price' | 'latency' | 'throughput'

const SORTS = new Set<OpenRouterSort>(['default', 'price', 'latency', 'throughput'])

export function parseOpenRouterFallbacks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function parseOpenRouterSort(raw: unknown): OpenRouterSort {
  return typeof raw === 'string' && SORTS.has(raw as OpenRouterSort)
    ? (raw as OpenRouterSort)
    : 'default'
}

export interface OpenRouterRouting {
  fallbacks: string[]
  sort: OpenRouterSort
  order: string[]
  ignore: string[]
}

export function buildOpenRouterChatExtras(
  apiModelId: string,
  routing: OpenRouterRouting
): Record<string, unknown> {
  const extras: Record<string, unknown> = {}
  const primary = apiModelId.trim()
  const models = routing.fallbacks.filter((id) => id !== primary)
  if (models.length > 0) extras.models = models

  const provider: Record<string, unknown> = {}
  if (routing.sort !== 'default') provider.sort = routing.sort
  if (routing.order.length > 0) provider.order = routing.order
  if (routing.ignore.length > 0) provider.ignore = routing.ignore
  if (Object.keys(provider).length > 0) extras.provider = provider

  return extras
}

/** @deprecated TL-B2 name; TL-B3 folded prefs into buildOpenRouterChatExtras. */
export function buildOpenRouterFallbackExtras(
  apiModelId: string,
  fallbacks: string[]
): Record<string, unknown> {
  return buildOpenRouterChatExtras(apiModelId, {
    fallbacks,
    sort: 'default',
    order: [],
    ignore: []
  })
}
