/**
 * TL-B2 — OpenRouter fallback extras.
 *
 * OpenRouter accepts `models: string[]` on the OpenAI-compatible chat body as
 * an ordered fallback chain when the primary `model` is unavailable. Empty
 * settings must produce `{}` so a default OpenRouter call stays identical to
 * pre-Triple-Lane (K4). Never attach these fields to any other provider.
 */

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

export function buildOpenRouterFallbackExtras(
  apiModelId: string,
  fallbacks: string[]
): Record<string, unknown> {
  const primary = apiModelId.trim()
  const models = fallbacks.filter((id) => id !== primary)
  return models.length > 0 ? { models } : {}
}
