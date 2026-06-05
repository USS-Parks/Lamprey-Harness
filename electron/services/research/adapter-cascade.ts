import {
  ALL_WEB_SEARCH_PROVIDERS,
  getWebSearchAdapterById,
  isProviderConfigured,
  type WebSearchAdapter,
  type WebSearchOpts,
  type WebSearchProviderId,
  type WebSearchResult
} from '../web-search-adapters'
import { readSettings } from '../settings-helper'

// Adapter cascade for the deep-research pipeline.
//
// Calls a declared list of search providers in order:
//   1. Skip providers that aren't configured (no key / no endpoint).
//   2. Run the provider. If it returns ≥1 result, stop and use those.
//   3. On HTTP 429 / 5xx / network error / empty SERP, fall through to the
//      next provider. Errors are accumulated but never propagated unless
//      every configured provider in the cascade has failed.
//   4. Optionally merge results from MULTIPLE providers (mergeAll=true) —
//      D5 collector uses this in exhaustive mode to widen the pool.
//
// Results are deduped by canonical URL (case-insensitive host, trailing
// slash normalised, common tracking params dropped) across providers so a
// page indexed by both DDG and Brave only appears once.
//
// Settings (read from settings.json deepResearch.providerCascade):
//   { "deepResearch": { "providerCascade": ["duckduckgo", "brave", "serpapi"] } }

export const DEFAULT_PROVIDER_CASCADE: WebSearchProviderId[] = ['duckduckgo', 'brave', 'serpapi']

export interface DeepResearchSettings {
  providerCascade: WebSearchProviderId[]
  autoTrigger: boolean
  depthTier: 'auto' | 'quick' | 'standard' | 'exhaustive'
  classifierModel?: string
  synthesizerModel?: string
}

const DEFAULT_DEEP_RESEARCH_SETTINGS: DeepResearchSettings = {
  providerCascade: DEFAULT_PROVIDER_CASCADE,
  // D3 ships with auto-trigger off; D10 flips this to true once the real
  // orchestrator is wired (until then the routing call would land in a
  // not-yet-implemented stub).
  autoTrigger: false,
  depthTier: 'auto'
}

function isKnownProvider(p: unknown): p is WebSearchProviderId {
  return typeof p === 'string' && ALL_WEB_SEARCH_PROVIDERS.some((x) => x.id === p)
}

export function readDeepResearchSettings(): DeepResearchSettings {
  const all = readSettings()
  const raw = (all.deepResearch as Partial<DeepResearchSettings> | undefined) ?? {}
  const cascade = Array.isArray(raw.providerCascade)
    ? raw.providerCascade.filter(isKnownProvider)
    : []
  const depthTier = raw.depthTier && ['auto', 'quick', 'standard', 'exhaustive'].includes(raw.depthTier)
    ? raw.depthTier
    : DEFAULT_DEEP_RESEARCH_SETTINGS.depthTier
  return {
    providerCascade: cascade.length > 0 ? cascade : DEFAULT_DEEP_RESEARCH_SETTINGS.providerCascade,
    autoTrigger: typeof raw.autoTrigger === 'boolean' ? raw.autoTrigger : DEFAULT_DEEP_RESEARCH_SETTINGS.autoTrigger,
    depthTier,
    classifierModel: typeof raw.classifierModel === 'string' && raw.classifierModel
      ? raw.classifierModel
      : undefined,
    synthesizerModel: typeof raw.synthesizerModel === 'string' && raw.synthesizerModel
      ? raw.synthesizerModel
      : undefined
  }
}

// Minimal inline canonicalizer for D2 — D5 will extract a more thorough
// version into `research/url-canonicalize.ts` and the cascade will import
// from there. Until then the rules below catch the most common dupes.
const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_eid', 'mc_cid']
const TRACKING_PARAMS_EXACT = new Set([
  'fbclid', 'gclid', 'msclkid', 'yclid', 'dclid', 'igshid', '_hsenc', '_hsmi'
])

function quickCanonical(url: string): string {
  try {
    const u = new URL(url)
    u.hostname = u.hostname.toLowerCase()
    // strip www. for dedup purposes only; we keep the original URL too
    if (u.hostname.startsWith('www.')) u.hostname = u.hostname.slice(4)
    u.hash = ''
    const keep: Array<[string, string]> = []
    u.searchParams.forEach((v, k) => {
      if (TRACKING_PARAMS_EXACT.has(k)) return
      if (TRACKING_PARAM_PREFIXES.some((p) => k.startsWith(p))) return
      keep.push([k, v])
    })
    u.search = ''
    keep.sort(([a], [b]) => a.localeCompare(b))
    for (const [k, v] of keep) u.searchParams.append(k, v)
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '')
    }
    return u.toString()
  } catch {
    return url
  }
}

export interface CascadeOpts extends WebSearchOpts {
  /** Override the cascade order; defaults to settings.deepResearch.providerCascade. */
  providers?: WebSearchProviderId[]
  /** If true, merge results from ALL configured providers; otherwise stop at first non-empty. */
  mergeAll?: boolean
}

export interface CascadeError {
  provider: WebSearchProviderId
  error: string
}

export interface CascadeResult {
  results: WebSearchResult[]
  providersUsed: WebSearchProviderId[]
  errors: CascadeError[]
}

function isTransient(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err)
  return /HTTP\s+(429|5\d{2})/i.test(msg) || /network|timeout|abort|fetch failed/i.test(msg)
}

/**
 * Run a query through the configured cascade. Stops at the first provider
 * that returns ≥1 result unless `mergeAll` is true, in which case every
 * configured provider is queried in parallel and the results merged.
 *
 * When every configured provider in the cascade errors or returns nothing,
 * returns an empty `results` array with the error trail populated —
 * callers can present a clean "no results" message rather than a thrown
 * exception. A thrown exception only escapes for non-transient errors
 * (e.g. a programming bug); transient HTTP errors are captured into the
 * `errors` array.
 */
export async function searchCascade(
  query: string,
  opts: CascadeOpts = {}
): Promise<CascadeResult> {
  const { providers, mergeAll, ...searchOpts } = opts
  const order = providers ?? readDeepResearchSettings().providerCascade

  const configured = order.filter((id) => isProviderConfigured(id))
  if (configured.length === 0) {
    return {
      results: [],
      providersUsed: [],
      errors: [{ provider: order[0] ?? 'duckduckgo', error: 'No configured search providers in cascade.' }]
    }
  }

  if (mergeAll) {
    return runMerged(query, configured, searchOpts)
  }
  return runFirstNonEmpty(query, configured, searchOpts)
}

async function runFirstNonEmpty(
  query: string,
  order: WebSearchProviderId[],
  opts: WebSearchOpts
): Promise<CascadeResult> {
  const errors: CascadeError[] = []
  for (const id of order) {
    const adapter = getWebSearchAdapterById(id)
    if (!adapter) {
      errors.push({ provider: id, error: 'Adapter not configured.' })
      continue
    }
    try {
      const results = await safeSearch(adapter, query, opts)
      if (results.length > 0) {
        return {
          results: dedupeByCanonical(results),
          providersUsed: [id],
          errors
        }
      }
      errors.push({ provider: id, error: 'Empty result set.' })
    } catch (err) {
      if (!isTransient(err)) {
        // Programming bug or hard failure — surface immediately. Transient
        // (429/5xx/network) errors are captured + we try the next provider.
        errors.push({ provider: id, error: (err as Error).message ?? String(err) })
        throw new CascadeFailureError(`Cascade aborted at ${id}: ${(err as Error).message}`, errors)
      }
      errors.push({ provider: id, error: (err as Error).message ?? String(err) })
    }
  }
  return { results: [], providersUsed: [], errors }
}

async function runMerged(
  query: string,
  order: WebSearchProviderId[],
  opts: WebSearchOpts
): Promise<CascadeResult> {
  const errors: CascadeError[] = []
  const used: WebSearchProviderId[] = []
  const all: WebSearchResult[] = []
  await Promise.all(
    order.map(async (id) => {
      const adapter = getWebSearchAdapterById(id)
      if (!adapter) {
        errors.push({ provider: id, error: 'Adapter not configured.' })
        return
      }
      try {
        const results = await safeSearch(adapter, query, opts)
        if (results.length > 0) {
          used.push(id)
          all.push(...results)
        } else {
          errors.push({ provider: id, error: 'Empty result set.' })
        }
      } catch (err) {
        errors.push({ provider: id, error: (err as Error).message ?? String(err) })
      }
    })
  )
  return {
    results: dedupeByCanonical(all),
    providersUsed: used,
    errors
  }
}

async function safeSearch(
  adapter: WebSearchAdapter,
  query: string,
  opts: WebSearchOpts
): Promise<WebSearchResult[]> {
  const results = await adapter.search(query, opts)
  return results.filter((r) => r.url && r.title)
}

export function dedupeByCanonical(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>()
  const out: WebSearchResult[] = []
  for (const r of results) {
    const key = quickCanonical(r.url)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

export class CascadeFailureError extends Error {
  readonly errors: CascadeError[]
  constructor(message: string, errors: CascadeError[]) {
    super(message)
    this.name = 'CascadeFailureError'
    this.errors = errors
  }
}

// Exported for D5 collector to share canonicalisation rules until D5 lands
// the full url-canonicalize helper.
export const _cascadeInternals = { quickCanonical }
