import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function read(rel: string): string {
  return readFileSync(join(__dirname, '..', '..', rel), 'utf-8')
}

function currentState(src: string): string {
  const start = src.indexOf('## Current State')
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('\n## ', start + 1)
  return next === -1 ? src.slice(start) : src.slice(start, next)
}

describe('OD-4 honest gaps with teeth', () => {
  it('K2: unsigned builds stay a permanent non-goal in electron-builder.yml', () => {
    const yml = read('electron-builder.yml')
    expect(yml).toMatch(/signAndEditExecutable:\s*false/)
    expect(yml).not.toMatch(/signAndEditExecutable:\s*true/)
  })

  it('K1: interrupt records turn.interrupted / interrupted and returns cancelled', () => {
    const src = read('electron/services/turn-interrupt.ts')
    expect(src).toMatch(/type:\s*'turn\.interrupted'/)
    expect(src).toMatch(/disposition:\s*'interrupted'/)
    expect(src).toMatch(/status:\s*'cancelled'/)
  })

  it('Current State still names the parked items so they cannot vanish', () => {
    for (const file of ['CLAUDE.md', 'AGENTS.md'] as const) {
      const state = currentState(read(file))
      expect(state, file).toMatch(/R1–R4/)
      expect(state, file).toMatch(/supportsTools/)
      expect(state, file).toMatch(/OpenWiki/)
      expect(state, file).toMatch(/unsigned/)
      expect(state, file).toMatch(/turn\.interrupted/)
    }
  })
})
