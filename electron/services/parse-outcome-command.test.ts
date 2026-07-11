import { describe, it, expect } from 'vitest'
import {
  parseOutcomeCommand,
  resolveOutcomeSpec,
  clampOutcomeToLoopBudget
} from './parse-outcome-command'
import { ORCHESTRATION_CONFIG_DEFAULTS } from './orchestration-config'

// AO-9 — the /outcome parser + downward-clamp resolver.

describe('parseOutcomeCommand', () => {
  it('parses a quoted goal and all flags with suffixes', () => {
    const p = parseOutcomeCommand(
      '/outcome "build a DCF model" --tokens 200k --wall 20m --candidates 3 --strategy fanout'
    )
    expect(p.goal).toBe('build a DCF model')
    expect(p.tokens).toBe(200_000)
    expect(p.wallMs).toBe(20 * 60_000)
    expect(p.candidates).toBe(3)
    expect(p.strategy).toBe('fanout')
    expect(p.errors).toEqual([])
  })

  it('parses an unquoted goal up to the first flag', () => {
    const p = parseOutcomeCommand('/outcome refactor the auth module --strategy critic')
    expect(p.goal).toBe('refactor the auth module')
    expect(p.strategy).toBe('critic')
  })

  it('defaults strategy to single and leaves budgets unset when absent', () => {
    const p = parseOutcomeCommand('/outcome just do the thing')
    expect(p.strategy).toBe('single')
    expect(p.tokens).toBeUndefined()
    expect(p.wallMs).toBeUndefined()
    expect(p.errors).toEqual([])
  })

  it('m suffix on tokens means millions; bare wall means minutes; h means hours', () => {
    expect(parseOutcomeCommand('/outcome g --tokens 2m').tokens).toBe(2_000_000)
    expect(parseOutcomeCommand('/outcome g --wall 90').wallMs).toBe(90 * 60_000)
    expect(parseOutcomeCommand('/outcome g --wall 1h').wallMs).toBe(3_600_000)
    expect(parseOutcomeCommand('/outcome g --wall 30s').wallMs).toBe(30_000)
  })

  it('collects errors for a missing goal and bad flag values', () => {
    const p = parseOutcomeCommand('/outcome --tokens lots --candidates 0 --strategy wat')
    expect(p.errors.some((e) => /goal is required/.test(e))).toBe(true)
    expect(p.errors.some((e) => /--tokens/.test(e))).toBe(true)
    expect(p.errors.some((e) => /--candidates/.test(e))).toBe(true)
    expect(p.errors.some((e) => /--strategy/.test(e))).toBe(true)
  })
})

describe('resolveOutcomeSpec — ceilings clamp DOWNWARD', () => {
  const cfg = {
    ...ORCHESTRATION_CONFIG_DEFAULTS,
    maxTokensPerRun: 400_000,
    maxWallclockMs: 1_800_000,
    maxCandidates: 4
  }

  it('a request below the settings ceiling tightens it', () => {
    const spec = resolveOutcomeSpec(
      parseOutcomeCommand('/outcome g --tokens 100k --candidates 2'),
      cfg
    )
    expect(spec.tokensCeiling).toBe(100_000)
    expect(spec.candidates).toBe(2)
  })

  it('a request ABOVE the settings ceiling is clamped down to it', () => {
    const spec = resolveOutcomeSpec(
      parseOutcomeCommand('/outcome g --tokens 999k --candidates 50'),
      cfg
    )
    expect(spec.tokensCeiling).toBe(400_000)
    expect(spec.candidates).toBe(4)
  })

  it('an absent request leaves the settings ceiling in place', () => {
    const spec = resolveOutcomeSpec(parseOutcomeCommand('/outcome g'), cfg)
    expect(spec.tokensCeiling).toBe(400_000)
    expect(spec.wallMsCeiling).toBe(1_800_000)
    expect(spec.candidates).toBe(4)
  })

  it('an unbounded settings ceiling (0) adopts the request', () => {
    const spec = resolveOutcomeSpec(parseOutcomeCommand('/outcome g --tokens 50k'), {
      ...cfg,
      maxTokensPerRun: 0
    })
    expect(spec.tokensCeiling).toBe(50_000)
  })
})

describe('clampOutcomeToLoopBudget — loop ceilings are the outer bound', () => {
  it('clamps the inner outcome budget to the loop slice', () => {
    expect(clampOutcomeToLoopBudget(300_000, 100_000)).toBe(100_000)
    expect(clampOutcomeToLoopBudget(50_000, 100_000)).toBe(50_000)
  })

  it('an unbounded loop slice (0) leaves the outcome budget', () => {
    expect(clampOutcomeToLoopBudget(300_000, 0)).toBe(300_000)
  })
})
