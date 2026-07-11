import { app } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Agentic Orchestration Phase AO-1 — resolved orchestration configuration from
// settings.json. Pure `resolveOrchestrationConfig` is unit-tested;
// `readOrchestrationConfig` is the fs wrapper used by the strategies, IPC, and
// the dispatch-array gate. Defaults mirror DEFAULT_APP_SETTINGS exactly.
//
// The `enabled` flag is the master toggle: when false, zero orchestration tools
// reach the model, slash commands refuse, and agents:* IPC is inert. Ceilings
// bound every orchestrated run; a ceiling of 0 disables that individual cap
// (the LP-7 0-disables convention).

export interface OrchestrationConfig {
  enabled: boolean
  maxTokensPerRun: number
  maxWallclockMs: number
  maxCandidates: number
  maxDepth: number
  advisorModel: string
}

export const ORCHESTRATION_CONFIG_DEFAULTS: OrchestrationConfig = {
  enabled: false,
  maxTokensPerRun: 400_000,
  maxWallclockMs: 1_800_000,
  maxCandidates: 4,
  maxDepth: 2,
  advisorModel: ''
}

function posIntOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
}

/** Pure: resolve an OrchestrationConfig from a raw settings object (or null). */
export function resolveOrchestrationConfig(
  raw: Record<string, unknown> | null
): OrchestrationConfig {
  if (!raw) return { ...ORCHESTRATION_CONFIG_DEFAULTS }
  return {
    enabled:
      typeof raw.orchestrationEnabled === 'boolean'
        ? raw.orchestrationEnabled
        : ORCHESTRATION_CONFIG_DEFAULTS.enabled,
    maxTokensPerRun: posIntOr(
      raw.orchMaxTokensPerRun,
      ORCHESTRATION_CONFIG_DEFAULTS.maxTokensPerRun
    ),
    maxWallclockMs: posIntOr(raw.orchMaxWallclockMs, ORCHESTRATION_CONFIG_DEFAULTS.maxWallclockMs),
    // Candidates and depth have a floor of 1 when their cap is active (a
    // 0 means "unbounded" per the 0-disables convention, resolved at the
    // enforcement site — not clamped up here).
    maxCandidates: posIntOr(raw.orchMaxCandidates, ORCHESTRATION_CONFIG_DEFAULTS.maxCandidates),
    maxDepth: posIntOr(raw.orchMaxDepth, ORCHESTRATION_CONFIG_DEFAULTS.maxDepth),
    advisorModel:
      typeof raw.orchAdvisorModel === 'string'
        ? raw.orchAdvisorModel.trim()
        : ORCHESTRATION_CONFIG_DEFAULTS.advisorModel
  }
}

export function readOrchestrationConfig(): OrchestrationConfig {
  try {
    const path = join(app.getPath('userData'), 'settings.json')
    if (!existsSync(path)) return { ...ORCHESTRATION_CONFIG_DEFAULTS }
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
    return resolveOrchestrationConfig(raw)
  } catch {
    return { ...ORCHESTRATION_CONFIG_DEFAULTS }
  }
}
