import { expect, it } from 'vitest'
import { partitionTaskRows, reconcileTaskRows, taskRunning } from './task-navigation'
import type { Conversation } from './types'
import type { TurnId } from './turn-control-types'
const task = (id: string, extra: Partial<Conversation> = {}): Conversation => ({ id, title: id, model: 'fixture', createdAt: 1, updatedAt: 1, messageCount: 0, ...extra })
it('deduplicates paged identities while retaining latest metadata and requested order', () => {
  const rows = reconcileTaskRows([task('b'), task('a'), task('b', { updatedAt: 3, title: 'new' })])
  expect(rows.map(row => row.id)).toEqual(['b', 'a'])
  expect(rows[0].title).toBe('new')
})
it('merges newer task metadata without adding tasks outside the selected archive/search list', () => {
  const rows = reconcileTaskRows([task('a')], [task('a', { updatedAt: 2, archived: true, pinnedAt: 2, projectId: 'project', forkedFromId: 'parent', forkedFromTurnId: 'turn' }), task('outside')])
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ archived: true, pinnedAt: 2, projectId: 'project', forkedFromId: 'parent', forkedFromTurnId: 'turn' })
})
it('does not let an older title overwrite a newer session row', () => {
  expect(reconcileTaskRows([task('a', { updatedAt: 3, title: 'new' })], [task('a', { updatedAt: 2, title: 'old' })])[0].title).toBe('new')
})
it('preserves missing-project identity and legacy unassigned tasks', () => {
  const groups = partitionTaskRows([task('a', { projectId: 'missing' }), task('b'), task('a')])
  expect([...groups.keys()]).toEqual(['missing', null])
  expect(groups.get('missing')?.map(row => row.id)).toEqual(['a'])
  expect(groups.get(null)?.map(row => row.id)).toEqual(['b'])
})
it('uses each task turn identity rather than active-view streaming state', () => {
  const states = { owner: { activeTurn: { turnId: 'turn' as TurnId, conversationId: 'owner', kind: 'regular' as const, status: 'running' as const, startedAt: 1 }, followUps: [], observedAt: 1, revision: 1 } }
  expect(taskRunning('owner', states)).toBe(true)
  expect(taskRunning('other', states)).toBe(false)
})
