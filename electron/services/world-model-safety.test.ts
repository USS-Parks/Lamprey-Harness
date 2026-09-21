import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// WM-16 — safety locks for the workspace world model. The layer ships ON as a
// deliberate past-era extension, so the invariants that keep it from ever
// silently changing behavior when off, mutating on its own, or looping a turn
// forever are source-locked here. The verify/repair/rollforward/budget/
// follow-through LOGIC is covered by the running pure suites; this file locks
// the structural guarantees a future edit could quietly break.

const root = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('WM-16 — off mode is inert', () => {
  it('the per-call gate skips entirely unless mode is verify or above', () => {
    const src = read('electron/services/chat-tool-dispatch.ts')
    // The whole gate body is guarded by modeAtLeast(..., 'verify').
    expect(src).toMatch(/modeAtLeast\(wmConfig\.mode, 'verify'\)/)
  })

  it('recording is a no-op in off mode', () => {
    const src = read('electron/services/workspace-world-model.ts')
    // recordWorldModelOutcome returns early when mode is off.
    const dispatch = read('electron/services/chat-tool-dispatch.ts')
    expect(dispatch).toMatch(/resolveWorldModelConfig\(readSettings\(\)\)\.mode === 'off'\) return/)
    // The state module itself never reads settings — it only records what it's told.
    expect(src).not.toMatch(/readSettings/)
  })

  it('goal extraction and follow-through only run in full mode', () => {
    const src = read('electron/ipc/chat.ts')
    expect(src).toMatch(/wmConfig\.mode === 'full'[\s\S]*?looksMutatingIntent/)
    expect(src).toMatch(/wmConfig\.mode === 'full' && wmConfig\.followThroughRounds > 0/)
  })

  it('the default ships full but off is a real, resolvable mode', () => {
    expect(read('electron/services/default-app-settings.ts')).toMatch(/workspaceWorldModel: 'full'/)
    expect(read('electron/services/world-model-config.ts')).toMatch(/'off', 'verify', 'repair', 'full'/)
  })
})

describe('WM-16 — repairs never mutate on their own', () => {
  it('the repair edit families are the only three, all rewriting the CALL', () => {
    const src = read('electron/services/world-model-repair.ts')
    expect(src).toMatch(/'normalize-path' \| 'resolve-basename' \| 'reanchor-whitespace'/)
    // The repair module writes NOTHING to disk: no write/unlink/mkdir imports.
    expect(src).not.toMatch(/writeFileSync|unlinkSync|mkdirSync|rmSync|appendFileSync/)
  })

  it('an applicable repair replaces the call arguments, then dispatch runs normally', () => {
    const src = read('electron/services/chat-tool-dispatch.ts')
    expect(src).toMatch(/if \(repair\.outcome === 'repaired'\)/)
    // The repaired args flow into the same tc that the normal path dispatches.
    expect(src).toMatch(/arguments: JSON\.stringify\(repair\.args\)/)
  })
})

describe('WM-16 — budgets and follow-through cannot re-arm within a turn', () => {
  it('only beginWorldModelTurn resets the intervention + follow-through counters', () => {
    const src = read('electron/services/world-model-budget.ts')
    // recordWorldModelIntervention and recordFollowThroughRound ONLY increment.
    expect(src).toMatch(/s\.interventions\+\+/)
    expect(src).toMatch(/s\.followThroughRounds\+\+/)
    // The only place downgraded flips back to false is beginWorldModelTurn.
    const resets = [...src.matchAll(/downgraded: false/g)]
    expect(resets.length).toBe(2) // stateFor initial + beginWorldModelTurn
    expect(src).toMatch(/export function beginWorldModelTurn/)
  })

  it('the dispatch gate honors the per-turn downgrade', () => {
    const src = read('electron/services/chat-tool-dispatch.ts')
    expect(src).toMatch(/!isWorldModelTurnDowngraded\(conversationId\)/)
  })

  it('follow-through settles finally once rounds are exhausted', () => {
    const src = read('electron/services/goal-followthrough.ts')
    expect(src).toMatch(/roundsUsed > input\.maxRounds \|\| input\.atRoundCap/)
    expect(src).toMatch(/recordEvaluationOutcomes\(input\.conversationId, evaluations, \{ final: true \}\)/)
  })

  it('the tool-round cap remains the hard recursion ceiling', () => {
    const src = read('electron/ipc/chat.ts')
    // Follow-through passes atRoundCap when the next round would hit the cap.
    expect(src).toMatch(/atRoundCap: round \+ 1 >= MAX_TOOL_ROUNDS/)
  })
})

describe('WM-16 — a world-model defect never breaks a turn', () => {
  it('the per-call gate is wrapped so a failure degrades to normal dispatch', () => {
    const src = read('electron/services/chat-tool-dispatch.ts')
    expect(src).toMatch(/} catch \(wmErr\) \{[\s\S]*?world-model-gate-failed/)
  })

  it('rollforward is wrapped the same way', () => {
    const src = read('electron/services/chat-tool-dispatch.ts')
    expect(src).toMatch(/} catch \(rfErr\) \{[\s\S]*?rollforward-failed/)
  })

  it('goal extraction failure is caught and the turn proceeds without a ledger', () => {
    const src = read('electron/ipc/chat.ts')
    expect(src).toMatch(/goal extraction failed; turn proceeds without a ledger/)
  })

  it('follow-through returns "no continuation" on any internal error', () => {
    const src = read('electron/services/goal-followthrough.ts')
    expect(src).toMatch(/check failed; settling normally/)
  })
})
