import type { OrchestrationConfig } from './orchestration-config'

// Agentic Orchestration Phase AO-9 — the outcome + budget entry point. The
// blog's end state as a command: "I want this outcome and here's a budget. Go."
//
//   /outcome "<goal>" [--tokens 200k] [--wall 20m] [--candidates 3]
//            [--strategy fanout|critic|single]
//
// Pure parser (the LP-8 pattern) + a resolver that applies settings defaults and
// clamps every ceiling DOWNWARD against the settings ceiling — an /outcome can
// ask for less budget than the settings allow, never more.

export type OutcomeStrategy = 'fanout' | 'critic' | 'single'

export interface ParsedOutcome {
  goal: string
  tokens?: number
  wallMs?: number
  candidates?: number
  strategy: OutcomeStrategy
  errors: string[]
}

/** Parse a token count with an optional k / m suffix (200k → 200000). */
function parseCount(raw: string): number | undefined {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([km])?$/i)
  if (!m) return undefined
  const n = parseFloat(m[1])
  const mult = m[2]?.toLowerCase() === 'm' ? 1_000_000 : m[2]?.toLowerCase() === 'k' ? 1_000 : 1
  return Math.round(n * mult)
}

/** Parse a duration with an optional s / m / h suffix → milliseconds (bare = minutes). */
function parseDuration(raw: string): number | undefined {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([smh])?$/i)
  if (!m) return undefined
  const n = parseFloat(m[1])
  const unit = m[2]?.toLowerCase()
  const ms = unit === 's' ? n * 1_000 : unit === 'h' ? n * 3_600_000 : n * 60_000 // default minutes
  return Math.round(ms)
}

export function parseOutcomeCommand(input: string): ParsedOutcome {
  const errors: string[] = []
  let s = input.trim()
  s = s.replace(/^\/outcome\b\s*/i, '')

  // Goal: a leading quoted string, else everything up to the first flag.
  let goal: string
  const quoted = s.match(/^"([^"]*)"|^'([^']*)'/)
  if (quoted) {
    goal = (quoted[1] ?? quoted[2] ?? '').trim()
    s = s.slice(quoted[0].length).trim()
  } else {
    // First known flag, whether at the start (no goal) or after the goal text.
    const flagMatch = s.match(/(^|\s)--(?:tokens|wall|candidates|strategy)\b/i)
    if (flagMatch) {
      const idx = (flagMatch.index ?? 0) + (flagMatch[1] ? flagMatch[1].length : 0)
      goal = s.slice(0, idx).trim()
      s = s.slice(idx).trim()
    } else {
      goal = s.trim()
      s = ''
    }
  }
  if (!goal) errors.push('outcome goal is required (e.g. /outcome "build X" --tokens 200k)')

  const out: ParsedOutcome = { goal, strategy: 'single', errors }

  // Flags.
  const flagRe = /--(tokens|wall|candidates|strategy)\s+("[^"]*"|'[^']*'|\S+)/gi
  let match: RegExpExecArray | null
  while ((match = flagRe.exec(s)) !== null) {
    const key = match[1].toLowerCase()
    const val = match[2].replace(/^["']|["']$/g, '')
    if (key === 'tokens') {
      const n = parseCount(val)
      if (n === undefined) errors.push(`--tokens: could not parse "${val}"`)
      else out.tokens = n
    } else if (key === 'wall') {
      const n = parseDuration(val)
      if (n === undefined) errors.push(`--wall: could not parse "${val}"`)
      else out.wallMs = n
    } else if (key === 'candidates') {
      const n = parseInt(val, 10)
      if (!Number.isFinite(n) || n < 1) errors.push(`--candidates: expected a positive integer`)
      else out.candidates = n
    } else if (key === 'strategy') {
      const v = val.toLowerCase()
      if (v === 'fanout' || v === 'critic' || v === 'single') out.strategy = v
      else errors.push(`--strategy: expected fanout|critic|single, got "${val}"`)
    }
  }

  return out
}

export interface OutcomeSpec {
  goal: string
  strategy: OutcomeStrategy
  /** All clamped downward against the settings ceilings — never above them. */
  tokensCeiling: number
  wallMsCeiling: number
  candidates: number
}

/** Downward clamp: a requested value tightens the settings ceiling; a request
 *  above (or absent) leaves the settings ceiling in place. A settings ceiling
 *  of 0 (unbounded) adopts the request as the cap. */
function clampDown(requested: number | undefined, settingCeiling: number): number {
  if (requested === undefined || requested <= 0) return settingCeiling
  if (settingCeiling <= 0) return requested
  return Math.min(requested, settingCeiling)
}

export function resolveOutcomeSpec(parsed: ParsedOutcome, cfg: OrchestrationConfig): OutcomeSpec {
  return {
    goal: parsed.goal,
    strategy: parsed.strategy,
    tokensCeiling: clampDown(parsed.tokens, cfg.maxTokensPerRun),
    wallMsCeiling: clampDown(parsed.wallMs, cfg.maxWallclockMs),
    candidates: clampDown(parsed.candidates, cfg.maxCandidates)
  }
}

/** Loop integration — a backlog task may carry an outcome; the inner outcome
 *  budget must never exceed the loop's per-iteration slice (loop ceilings are
 *  the outer bound). Returns the outcome budget clamped to the loop slice. */
export function clampOutcomeToLoopBudget(outcomeTokens: number, loopTokenSlice: number): number {
  if (loopTokenSlice <= 0) return outcomeTokens
  if (outcomeTokens <= 0) return loopTokenSlice
  return Math.min(outcomeTokens, loopTokenSlice)
}
