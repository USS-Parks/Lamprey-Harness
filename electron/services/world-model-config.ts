// Workspace World Model Phase (WM-1) — mode + budget resolution.
//
// The setting keys are read here with safe defaults so every world-model
// call site resolves behavior from ONE place. WM-13 adds the keys to
// DEFAULT_APP_SETTINGS, the renderer mirror, and the Settings UI; until
// then settings.json carries them as ordinary optional keys (the merge
// semantics pass unknown keys through untouched).
//
// Modes, cumulative:
//   'off'    — the world model does nothing anywhere. Dispatch is
//              byte-compatible with the pre-phase baseline (locked by
//              world-model-safety.test.ts).
//   'verify' — pre-dispatch validation; violated calls return structured
//              verdicts instead of executing.
//   'repair' — 'verify' plus deterministic repair (non-mutating
//              observations + argument normalization) before verdicts.
//   'full'   — 'repair' plus goal extraction, follow-through, and
//              belief-ordered subtasks. The shipped default per the
//              owner-approved plan (era-lock exception #3).

export type WorldModelMode = 'off' | 'verify' | 'repair' | 'full'

export interface WorldModelConfig {
  mode: WorldModelMode
  /** Verdict-or-repair interventions allowed per turn. 0 disables repair. */
  repairBudget: number
  /** Follow-through continuation rounds allowed per turn. 0 disables. */
  followThroughRounds: number
  /** Model id used for goal extraction; null = the conversation's model. */
  extractionModel: string | null
}

export const DEFAULT_WORLD_MODEL_MODE: WorldModelMode = 'full'
export const DEFAULT_REPAIR_BUDGET = 5
export const DEFAULT_FOLLOW_THROUGH_ROUNDS = 5

const MODES: readonly string[] = ['off', 'verify', 'repair', 'full']

function boundedCount(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return Math.min(Math.floor(value), max)
}

export function resolveWorldModelConfig(settingsRaw: unknown): WorldModelConfig {
  const s = (settingsRaw ?? {}) as {
    workspaceWorldModel?: unknown
    worldModelRepairBudget?: unknown
    worldModelFollowThroughRounds?: unknown
    worldModelExtractionModel?: unknown
  }
  const mode =
    typeof s.workspaceWorldModel === 'string' && MODES.includes(s.workspaceWorldModel)
      ? (s.workspaceWorldModel as WorldModelMode)
      : DEFAULT_WORLD_MODEL_MODE
  return {
    mode,
    repairBudget: boundedCount(s.worldModelRepairBudget, DEFAULT_REPAIR_BUDGET, 25),
    followThroughRounds: boundedCount(
      s.worldModelFollowThroughRounds,
      DEFAULT_FOLLOW_THROUGH_ROUNDS,
      25
    ),
    extractionModel:
      typeof s.worldModelExtractionModel === 'string' && s.worldModelExtractionModel.trim() !== ''
        ? s.worldModelExtractionModel
        : null
  }
}

/** Convenience rank so call sites can ask "at least repair?" without listing modes. */
export function modeAtLeast(mode: WorldModelMode, floor: WorldModelMode): boolean {
  const rank: Record<WorldModelMode, number> = { off: 0, verify: 1, repair: 2, full: 3 }
  return rank[mode] >= rank[floor]
}
