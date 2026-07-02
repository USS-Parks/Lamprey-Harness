import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// JM-2 (July 2026 Maintenance) — wiring locks for the loop→turn seam. The
// production seam lives across loop-controller / loop-runner / ipc/chat and
// its stores need the native binding, so these are source-reading contract
// locks (WC-8 pattern): they pin the load-bearing lines that made LP-1 real.

const root = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('JM-2 loop iteration prompt reaches the model', () => {
  it('the production runTurn persists the iteration prompt before running the turn', () => {
    const src = read('electron/services/loop-controller.ts')
    const runTurn = src.slice(src.indexOf('runTurn: async (input)'))
    const saveIdx = runTurn.indexOf('saveMessage({')
    const runnerIdx = runTurn.indexOf('await runner({')
    expect(saveIdx).toBeGreaterThan(-1)
    expect(runnerIdx).toBeGreaterThan(-1)
    expect(saveIdx).toBeLessThan(runnerIdx)
    expect(runTurn).toMatch(/role: 'user',\s*\n\s*content: input\.promptBody/)
  })

  it('runHeadlessTurn builds API messages from persisted history (promptBody is hook-only)', () => {
    const src = read('electron/ipc/chat.ts')
    const fn = src.slice(src.indexOf('export async function runHeadlessTurn'))
    expect(fn).toMatch(/getEffectiveMessages\(conversationId\)/)
    expect(fn).toMatch(/buildApiMessagesFromStoredMessages\(systemPrompt, promptHistory/)
  })

  it('fireDueWakeups keeps its persist-then-run contract', () => {
    const src = read('electron/services/loop-runner.ts')
    const fn = src.slice(src.indexOf('export function fireDueWakeups'))
    const saveIdx = fn.indexOf('saveMessage({')
    const runIdx = fn.indexOf('runner({')
    expect(saveIdx).toBeGreaterThan(-1)
    expect(runIdx).toBeGreaterThan(-1)
    expect(saveIdx).toBeLessThan(runIdx)
  })
})

describe('JM-3 overlap guards', () => {
  it('tickLoops skips loops with an iteration already in flight', () => {
    const src = read('electron/services/loop-controller.ts')
    expect(src).toMatch(/const inFlightLoops = new Set<string>\(\)/)
    expect(src).toMatch(/\.filter\(\(l\) => !inFlightLoops\.has\(l\.id\)\)/)
    expect(src).toMatch(/inFlightLoops\.delete\(loop\.id\)/)
    expect(src).toMatch(/if \(tickInFlight\) return/)
  })

  it('wake-up turns drain sequentially instead of firing in parallel', () => {
    const src = read('electron/services/loop-runner.ts')
    expect(src).toMatch(/enqueueWakeupTurn\(/)
    const fn = src.slice(src.indexOf('export function fireDueWakeups'))
    expect(fn).not.toMatch(/void turnRunner\(/)
  })

  it('an automation never runs concurrently with itself', () => {
    const src = read('electron/services/automations-runner.ts')
    expect(src).toMatch(/runningAutomations\.has\(autoId\)\) return/)
    expect(src).toMatch(/runningAutomations\.delete\(autoId\)/)
  })
})
