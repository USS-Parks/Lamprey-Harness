import { patchSettings, readSettings } from './settings-helper'
import type { ToolRisk } from './tool-registry'

export type BrowserDeveloperSiteDecision = 'allow' | 'ask' | 'deny'
export type BrowserDeveloperAction = 'metadata' | 'sensitive' | 'mutation'

export interface BrowserDeveloperActionPolicy {
  action: BrowserDeveloperAction
  risks: ToolRisk[]
  requiresApproval: boolean
}

export interface BrowserDeveloperSitePolicyResult {
  origin: string
  decision: BrowserDeveloperSiteDecision
  allowed: boolean
}

export function canonicalBrowserOrigin(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin.toLowerCase()
  } catch {
    return null
  }
}

export function browserDeveloperActionPolicy(
  action: BrowserDeveloperAction
): BrowserDeveloperActionPolicy {
  if (action === 'sensitive') {
    return { action, risks: ['read', 'network', 'secret'], requiresApproval: true }
  }
  if (action === 'mutation') {
    return {
      action,
      risks: ['write', 'network', 'destructive'],
      requiresApproval: true
    }
  }
  return { action, risks: ['read'], requiresApproval: false }
}

export function resolveBrowserDeveloperSitePolicy(
  rawUrl: string,
  settings: Record<string, unknown> = readSettings()
): BrowserDeveloperSitePolicyResult {
  if (settings.browserDeveloperModeEnabled !== true) {
    throw new Error('Browser Developer Mode is disabled')
  }
  const origin = canonicalBrowserOrigin(rawUrl)
  if (!origin) throw new Error('Browser Developer Mode requires an HTTP(S) target')
  const policies = settings.browserDeveloperSitePolicies
  const decision = policies && typeof policies === 'object' && !Array.isArray(policies)
    ? (policies as Record<string, unknown>)[origin]
    : undefined
  const normalized: BrowserDeveloperSiteDecision =
    decision === 'allow' || decision === 'deny' ? decision : 'ask'
  return { origin, decision: normalized, allowed: normalized === 'allow' }
}

export function assertBrowserDeveloperUrlAllowed(
  rawUrl: string,
  settings?: Record<string, unknown>
): BrowserDeveloperSitePolicyResult {
  const result = resolveBrowserDeveloperSitePolicy(rawUrl, settings)
  if (result.decision === 'deny') {
    throw new Error(`Browser Developer Mode is denied for ${result.origin}`)
  }
  if (!result.allowed) {
    throw new Error(`Browser Developer Mode is not trusted for ${result.origin}`)
  }
  return result
}

export function setBrowserDeveloperSitePolicy(
  rawUrl: string,
  decision: BrowserDeveloperSiteDecision
): BrowserDeveloperSitePolicyResult {
  const origin = canonicalBrowserOrigin(rawUrl)
  if (!origin) throw new Error('Browser Developer Mode requires an HTTP(S) target')
  const settings = readSettings()
  const current = settings.browserDeveloperSitePolicies
  const policies = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {}
  policies[origin] = decision
  patchSettings({ browserDeveloperSitePolicies: policies })
  return { origin, decision, allowed: decision === 'allow' }
}

export function clearBrowserDeveloperSitePolicy(rawUrl: string): boolean {
  const origin = canonicalBrowserOrigin(rawUrl)
  if (!origin) return false
  const settings = readSettings()
  const current = settings.browserDeveloperSitePolicies
  if (!current || typeof current !== 'object' || Array.isArray(current)) return false
  const policies = { ...(current as Record<string, unknown>) }
  if (!(origin in policies)) return false
  delete policies[origin]
  patchSettings({ browserDeveloperSitePolicies: policies })
  return true
}
