// WM-6 — per-turn intervention budget: exhaustion downgrades for the rest
// of the turn and only beginWorldModelTurn re-arms.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetWorldModelBudgetForTesting,
  beginWorldModelTurn,
  clearWorldModelBudget,
  getWorldModelInterventions,
  isWorldModelTurnDowngraded,
  recordWorldModelIntervention
} from './world-model-budget'

const CONV = 'conv-wm6'

beforeEach(() => __resetWorldModelBudgetForTesting())

describe('world-model turn budget', () => {
  it('crosses the threshold exactly once and stays downgraded', () => {
    beginWorldModelTurn(CONV)
    expect(recordWorldModelIntervention(CONV, 3)).toBe(false)
    expect(recordWorldModelIntervention(CONV, 3)).toBe(false)
    expect(isWorldModelTurnDowngraded(CONV)).toBe(false)
    expect(recordWorldModelIntervention(CONV, 3)).toBe(true)
    expect(isWorldModelTurnDowngraded(CONV)).toBe(true)
    // Further interventions never re-signal the crossing.
    expect(recordWorldModelIntervention(CONV, 3)).toBe(false)
    expect(getWorldModelInterventions(CONV)).toBe(4)
  })

  it('only beginWorldModelTurn re-arms a downgraded conversation', () => {
    beginWorldModelTurn(CONV)
    recordWorldModelIntervention(CONV, 1)
    expect(isWorldModelTurnDowngraded(CONV)).toBe(true)
    beginWorldModelTurn(CONV)
    expect(isWorldModelTurnDowngraded(CONV)).toBe(false)
    expect(getWorldModelInterventions(CONV)).toBe(0)
  })

  it('budget 0 never downgrades (unlimited verdicts, repair disabled elsewhere)', () => {
    beginWorldModelTurn(CONV)
    for (let i = 0; i < 10; i++) expect(recordWorldModelIntervention(CONV, 0)).toBe(false)
    expect(isWorldModelTurnDowngraded(CONV)).toBe(false)
  })

  it('clearWorldModelBudget drops the conversation state', () => {
    beginWorldModelTurn(CONV)
    recordWorldModelIntervention(CONV, 1)
    clearWorldModelBudget(CONV)
    expect(isWorldModelTurnDowngraded(CONV)).toBe(false)
    expect(getWorldModelInterventions(CONV)).toBe(0)
  })

  it('conversations are independent', () => {
    beginWorldModelTurn('a')
    beginWorldModelTurn('b')
    recordWorldModelIntervention('a', 1)
    expect(isWorldModelTurnDowngraded('a')).toBe(true)
    expect(isWorldModelTurnDowngraded('b')).toBe(false)
  })
})
