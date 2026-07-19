import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// LP-10 — safety hardening. Loops are a deliberate past-era extension that ship
// OFF by default; this suite source-locks the master-toggle gate at every entry
// point and the OFF defaults, so a future edit can't silently arm autonomous
// loops. (The ceiling / runaway / stall / drain LOGIC is covered by the running
// pure tests in loop-controller.test.ts + loop-config.test.ts + loop-tool-logic.test.ts.)

const root = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('LP-10 loop safety gates', () => {
  it('loops:create refuses when loops are disabled', () => {
    const src = read('electron/ipc/loops.ts')
    expect(src).toMatch(/'loops:create'[\s\S]*?if \(!cfg\.enabled\)/)
  })

  it('loops:resume refuses when loops are disabled', () => {
    const src = read('electron/ipc/loops.ts')
    expect(src).toMatch(/'loops:resume'[\s\S]*?if \(!readLoopConfig\(\)\.enabled\)/)
  })

  it('the /loop slash command gates on loopsEnabled', () => {
    const src = read('src/components/chat/ChatInput.tsx')
    expect(src).toMatch(/case '\/loop':[\s\S]*?settings\.loopsEnabled/)
  })

  it('the model loop tools refuse outside an active loop', () => {
    // applyLoop* return { ok:false } when getActiveLoopForConversation is null.
    const src = read('electron/services/loop-tool-logic.ts')
    expect(src).toMatch(/getActiveLoopForConversation/)
    expect(src).toMatch(/no active loop for this conversation/)
  })

  it('loops ship OFF by default in BOTH the canonical defaults and the config resolver', () => {
    expect(read('electron/services/default-app-settings.ts')).toMatch(/loopsEnabled: false/)
    expect(read('electron/services/loop-config.ts')).toMatch(/enabled: false/)
  })

  it('the controller never schedules faster than the runaway floor', () => {
    // computeNextFire + loop_control(continue) both clamp to a floor.
    expect(read('electron/services/loop-controller.ts')).toMatch(/Math\.max\(floor,/)
    expect(read('electron/services/loop-tool-logic.ts')).toMatch(/Math\.max\(floor,/)
  })

  // JM-5 — the master toggle now gates EVERY entry point, not just creation.
  // The v0.15.x gate covered loops:create/resume only; schedule_wakeup,
  // fireDueWakeups, tickLoops, loop_control(continue), and cron automations
  // all ran with loopsEnabled:false (audit findings LP-4/LP-5/LP-6/LP-14).

  it('scheduleWakeup refuses when loops are disabled and caps pending wake-ups', () => {
    const src = read('electron/services/loop-runner.ts')
    const fn = src.slice(src.indexOf('export function scheduleWakeup'))
    expect(fn).toMatch(/if \(!readLoopConfig\(\)\.enabled\)/)
    expect(fn).toMatch(/MAX_PENDING_WAKEUPS_PER_CONVERSATION/)
  })

  it('fireDueWakeups fires nothing while loops are disabled', () => {
    const src = read('electron/services/loop-runner.ts')
    const fn = src.slice(src.indexOf('export function fireDueWakeups'))
    expect(fn).toMatch(/if \(!readLoopConfig\(\)\.enabled\) return \[\]/)
  })

  it('tickLoops halts running loops while loops are disabled', () => {
    const src = read('electron/services/loop-controller.ts')
    const fn = src.slice(src.indexOf('export async function tickLoops'))
    expect(fn).toMatch(/if \(!readLoopConfig\(\)\.enabled\) return/)
  })

  it('loop_control passes the master toggle into the pure logic', () => {
    const src = read('electron/services/loop-tool-pack.ts')
    expect(src).toMatch(/loopsEnabled: readLoopConfig\(\)\.enabled/)
  })

  it('the cron automation tick rides the master toggle', () => {
    const src = read('electron/services/automations-runner.ts')
    const fn = src.slice(src.indexOf('export async function tickAutomationsOnce'))
    expect(fn).toMatch(/if \(!readLoopConfig\(\)\.enabled\) return/)
  })

  it('goal and automation loop bridge entry points fail closed on the master toggle', () => {
    const src = read('electron/services/goal-automation-loop-bridge.ts')
    expect(src).toMatch(/function requireLoopsEnabled[\s\S]*?if \(!config\.enabled\)/)
    expect(src).toMatch(/createGoalOwnedLoop[\s\S]*?requireLoopsEnabled\(\)/)
    expect(src).toMatch(/bindAutomationToGoal[\s\S]*?requireLoopsEnabled\(\)/)
    expect(src).toMatch(/wakeGoalFromAutomation[\s\S]*?requireLoopsEnabled\(\)/)
  })
})
