import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getConversation: vi.fn(), getProject: vi.fn(), getActiveWorkspace: vi.fn() }))
vi.mock('./conversation-store', () => ({ getConversation: mocks.getConversation }))
vi.mock('./projects-store', () => ({ getProject: mocks.getProject }))
vi.mock('./workspace-state', () => ({ getActiveWorkspace: mocks.getActiveWorkspace }))
import { getTaskWorkspace } from './task-workspace'
beforeEach(() => { vi.resetAllMocks(); mocks.getActiveWorkspace.mockReturnValue('/default'); mocks.getProject.mockReturnValue({ path: '/project' }) })
describe('task workspace authority', () => {
  it('uses the configured folder only when no task location is recorded', () => {
    expect(getTaskWorkspace()).toBe('/default')
    mocks.getConversation.mockReturnValue({ projectId: null, worktreePath: null })
    expect(getTaskWorkspace('local')).toBe('/default')
  })
  it('uses the worktree ahead of the project and global folder', () => {
    mocks.getConversation.mockReturnValue({ projectId: 'project', worktreePath: '/worktree' })
    expect(getTaskWorkspace('task')).toBe('/worktree')
    expect(mocks.getActiveWorkspace).not.toHaveBeenCalled()
  })
  it('uses the owning project for a local task', () => {
    mocks.getConversation.mockReturnValue({ projectId: 'project', worktreePath: null })
    expect(getTaskWorkspace('task')).toBe('/project')
    expect(mocks.getProject).toHaveBeenCalledWith('project')
  })
  it('rejects a missing task rather than operating in the default folder', () => {
    mocks.getConversation.mockReturnValue(null)
    expect(() => getTaskWorkspace('missing')).toThrow('no longer exists')
    expect(() => getTaskWorkspace('')).toThrow('valid task ID')
    expect(mocks.getActiveWorkspace).not.toHaveBeenCalled()
  })
})
