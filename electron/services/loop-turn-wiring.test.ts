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
    expect(src).toMatch(/if \(runningAutomations\.has\(automationId\)\)/)
    expect(src).toMatch(/runningAutomations\.delete\(automationId\)/)
  })
})

describe('JM-4 watchdog signal + abort + headless ghost guard', () => {
  it('the abort signal is threaded end-to-end: controller → runner type → runHeadlessTurn', () => {
    const controller = read('electron/services/loop-controller.ts')
    expect(controller).toMatch(/signal: input\.signal/)
    const runner = read('electron/services/loop-runner.ts')
    expect(runner).toMatch(/signal\?: AbortSignal/)
    const chat = read('electron/ipc/chat.ts')
    expect(chat).toMatch(/signal: runnerInput\.signal/)
    expect(chat).toMatch(/turnRuntimeRegistry\.register\(\{/)
    expect(chat).toMatch(/runtime\.linkAbortSignal\(input\.signal\)/)
    expect(chat).toMatch(/runtime\.signal/)
    expect(chat).not.toMatch(/activeAbortControllers/)
  })

  it('the watchdog races a rejection so an ignoring runner cannot wedge the iteration', () => {
    const src = read('electron/services/loop-controller.ts')
    expect(src).toMatch(/Promise\.race\(\[\s*\n\s*turnPromise/)
    expect(src).toMatch(/void turnPromise\.catch\(\(\) => \{\}\)/)
  })

  it('loops:stop and loops:pause abort the in-flight iteration', () => {
    const src = read('electron/ipc/loops.ts')
    const stop = src.slice(src.indexOf("'loops:stop'"))
    const pause = src.slice(src.indexOf("'loops:pause'"))
    expect(stop).toMatch(/abortLoopIteration\(id\)/)
    expect(pause).toMatch(/abortLoopIteration\(id\)/)
  })

  it('runHeadlessTurn has its own ghost-reply guard (loop/wake-up turns are covered)', () => {
    const src = read('electron/ipc/chat.ts')
    const fn = src.slice(src.indexOf('export async function runHeadlessTurn'))
    expect(fn).toMatch(/turnEndedGhosted\(rows\)/)
    expect(fn).toMatch(/buildGhostReplyNotice\(/)
  })
})

describe('JM-7 recovery + integrity', () => {
  it('the workflow sandbox never receives the host Math object', () => {
    const src = read('electron/services/workflow-runner.ts')
    expect(src).toMatch(/sandbox\.Math = Object\.create\(Math\)/)
    expect(src).not.toMatch(/sandbox\.Math = Math\b/)
  })

  it('the controller sweeps stranded in_progress items at startup', () => {
    const controller = read('electron/services/loop-controller.ts')
    const start = controller.slice(controller.indexOf('export function startLoopController'))
    expect(start).toMatch(/sweepStaleIterationState\(\)/)
    const store = read('electron/services/loop-store.ts')
    expect(store).toMatch(/status = 'pending', started_at = NULL WHERE status = 'in_progress'/)
  })

  it('the production seam supplies a real transaction for iteration commits', () => {
    const controller = read('electron/services/loop-controller.ts')
    expect(controller).toMatch(/transact: store\.withLoopTransaction/)
  })

  it('the quit path aborts and drains in-flight loop work before closeDb', () => {
    const main = read('electron/main.ts')
    const quit = main.slice(main.indexOf("app.on('will-quit'"))
    const abortIdx = quit.indexOf('abortAllLoopIterations()')
    const closeIdx = quit.lastIndexOf('\n  closeDb()')
    expect(abortIdx).toBeGreaterThan(-1)
    expect(closeIdx).toBeGreaterThan(abortIdx)
  })
})
