import { describe, it, expect, beforeEach } from 'vitest'
import {
  activateLazySurface,
  isLazyActive,
  isSurfaceDowngraded,
  unlockTools,
  getUnlockedTools,
  recordMalformedSearch,
  clearToolUnlockState,
  setToolUnlockPersist,
  __resetToolUnlockStateForTesting,
  MALFORMED_SEARCH_DOWNGRADE_THRESHOLD
} from './tool-unlock-state'

const C = 'conv-1'

function memoryPersist() {
  const rows = new Map<string, Set<string>>()
  return {
    load(id: string): string[] {
      return [...(rows.get(id) ?? [])]
    },
    save(id: string, names: string[]): void {
      let set = rows.get(id)
      if (!set) {
        set = new Set<string>()
        rows.set(id, set)
      }
      for (const n of names) set.add(n)
    },
    clear(id: string): void {
      rows.delete(id)
    }
  }
}

describe('tool-unlock-state (HY2)', () => {
  beforeEach(() => {
    setToolUnlockPersist(null)
    __resetToolUnlockStateForTesting()
  })

  it('starts inactive with no unlocked tools', () => {
    expect(isLazyActive(C)).toBe(false)
    expect(getUnlockedTools(C)).toEqual([])
    expect(isSurfaceDowngraded(C)).toBe(false)
  })

  it('activates the lazy surface', () => {
    activateLazySurface(C)
    expect(isLazyActive(C)).toBe(true)
  })

  it('accumulates unlocked tools (dedup, additive)', () => {
    unlockTools(C, ['browser_screenshot', 'image_generate'])
    unlockTools(C, ['browser_screenshot', 'web_open'])
    expect(getUnlockedTools(C).sort()).toEqual(['browser_screenshot', 'image_generate', 'web_open'])
  })

  it('ignores empty unlock lists', () => {
    unlockTools(C, [])
    expect(getUnlockedTools(C)).toEqual([])
  })

  it('isolates state per conversation', () => {
    activateLazySurface('a')
    unlockTools('a', ['image_generate'])
    expect(isLazyActive('b')).toBe(false)
    expect(getUnlockedTools('b')).toEqual([])
  })

  it('downgrades to full after the malformed-search threshold', () => {
    activateLazySurface(C)
    for (let i = 1; i < MALFORMED_SEARCH_DOWNGRADE_THRESHOLD; i++) {
      const n = recordMalformedSearch(C)
      expect(n).toBe(i)
      expect(isSurfaceDowngraded(C)).toBe(false)
      expect(isLazyActive(C)).toBe(true)
    }
    const final = recordMalformedSearch(C)
    expect(final).toBe(MALFORMED_SEARCH_DOWNGRADE_THRESHOLD)
    expect(isSurfaceDowngraded(C)).toBe(true)
    expect(isLazyActive(C)).toBe(false)
  })

  it('a downgraded conversation cannot be re-activated', () => {
    for (let i = 0; i < MALFORMED_SEARCH_DOWNGRADE_THRESHOLD; i++) recordMalformedSearch(C)
    expect(isSurfaceDowngraded(C)).toBe(true)
    activateLazySurface(C)
    expect(isLazyActive(C)).toBe(false)
  })

  it('clearToolUnlockState wipes everything for a conversation', () => {
    activateLazySurface(C)
    unlockTools(C, ['image_generate'])
    recordMalformedSearch(C)
    clearToolUnlockState(C)
    expect(isLazyActive(C)).toBe(false)
    expect(getUnlockedTools(C)).toEqual([])
    expect(isSurfaceDowngraded(C)).toBe(false)
  })

  it('AC-19: persisted unlocks survive a memory reset (restart shape)', () => {
    setToolUnlockPersist(memoryPersist())
    unlockTools(C, ['web_open', 'image_generate'])
    __resetToolUnlockStateForTesting()
    expect(getUnlockedTools(C).sort()).toEqual(['image_generate', 'web_open'])
  })

  it('AC-19: clearToolUnlockState drops persist so delete does not leak', () => {
    setToolUnlockPersist(memoryPersist())
    unlockTools(C, ['web_open'])
    clearToolUnlockState(C)
    __resetToolUnlockStateForTesting()
    expect(getUnlockedTools(C)).toEqual([])
  })

  it('TL14: downgraded getUnlockedTools returns [] so unlocks cannot leak', () => {
    setToolUnlockPersist(memoryPersist())
    unlockTools(C, ['browser_screenshot'])
    for (let i = 0; i < MALFORMED_SEARCH_DOWNGRADE_THRESHOLD; i++) recordMalformedSearch(C)
    expect(isSurfaceDowngraded(C)).toBe(true)
    expect(getUnlockedTools(C)).toEqual([])
  })
})
