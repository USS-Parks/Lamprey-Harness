import { expect, it } from 'vitest'
import { SETTINGS_GROUPS, SETTINGS_LEAVES, settingsLeaf } from './settings-navigation'
it('preserves all old settings IDs in exactly six nonempty groups', () => {
  const ids = ['general','models','agenticCoding','api','github','appearance','webTools','currentInfo','imageGen','permissions','planGoal','hooks','automations','loops','orchestration','library','rag','snip','timeouts','tools','seedBudget','reasoning','persistence','activity']
  expect(SETTINGS_LEAVES.map(leaf => leaf.id).sort()).toEqual(ids.sort())
  expect(SETTINGS_GROUPS).toHaveLength(6)
  for (const group of SETTINGS_GROUPS) expect(SETTINGS_LEAVES.some(leaf => leaf.group === group.id)).toBe(true)
  expect(settingsLeaf('rag').group).toBe('extensions')
  expect(settingsLeaf('api').group).toBe('connections')
  expect(settingsLeaf('activity').group).toBe('advanced')
})
it('retains familiar names when a leaf is renamed', () => {
  expect(settingsLeaf('seedBudget').aliases).toContain('Seed Budget')
  expect(settingsLeaf('persistence').aliases).toContain('Persistence')
  expect(settingsLeaf('agenticCoding').aliases).toContain('Coding Mode')
})
