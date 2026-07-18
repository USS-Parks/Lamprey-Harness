import { describe, expect, it, vi } from 'vitest'
import { forkTaskAtTurn } from './fork-task'

const source = { id: 'source', title: 'Source', model: 'm', projectId: 'p' }
const terminalTurn = {
  id: 'turn-1',
  conversationId: 'source',
  status: 'completed',
  completedAt: 20
}

function deps(overrides: Record<string, unknown> = {}): any {
  return {
    getConversation: vi.fn(() => source),
    getMessages: vi.fn(() => [
      { id: 'm1', timestamp: 10, role: 'user', content: 'before' },
      { id: 'm2', timestamp: 20, role: 'assistant', content: 'boundary' },
      { id: 'm3', timestamp: 21, role: 'user', content: 'after' }
    ]),
    createConversation: vi.fn(() => ({ id: 'child' })),
    updateConversationTitle: vi.fn(),
    saveMessage: vi.fn(),
    deleteConversation: vi.fn(),
    listTurns: vi.fn(() => [terminalTurn]),
    copyAttachments: vi.fn(() => 2),
    record: vi.fn(),
    newId: () => 'fork-1',
    ...overrides
  }
}

describe('fork_task at historical turn', () => {
  it('copies history only through a completed turn and stores the backlink', async () => {
    const d = deps()
    const result = await forkTaskAtTurn({ sourceConversationId: 'source', turnId: 'turn-1' }, d)
    expect(result).toMatchObject({
      conversationId: 'child',
      sourceTurnId: 'turn-1',
      copiedMessageCount: 2,
      copiedAttachmentCount: 2
    })
    expect(d.createConversation).toHaveBeenCalledWith(
      'm',
      expect.objectContaining({ forkedFromId: 'source', forkedFromTurnId: 'turn-1' })
    )
    expect(d.saveMessage).toHaveBeenCalledTimes(2)
    expect(d.saveMessage.mock.calls.map((call: any[]) => call[0].content)).toEqual([
      'before',
      'boundary'
    ])
  })

  it('rejects a foreign or running turn before creating a task', async () => {
    const missing = deps({ listTurns: vi.fn(() => []) })
    await expect(
      forkTaskAtTurn({ sourceConversationId: 'source', turnId: 'other' }, missing)
    ).rejects.toThrow('does not belong')
    expect(missing.createConversation).not.toHaveBeenCalled()
    const running = deps({
      listTurns: vi.fn(() => [{ ...terminalTurn, status: 'running', completedAt: null }])
    })
    await expect(
      forkTaskAtTurn({ sourceConversationId: 'source', turnId: 'turn-1' }, running)
    ).rejects.toThrow('must be completed')
  })

  it('does not reuse the source worktree and can create an isolated one', async () => {
    const manager = {
      create: vi.fn(async () => ({ path: 'C:/isolated', branch: 'codex/fork-1' })),
      finalize: vi.fn()
    }
    const d = deps({ worktreeManager: manager })
    const result = await forkTaskAtTurn(
      { sourceConversationId: 'source', turnId: 'turn-1', isolateWorktree: true },
      d
    )
    expect(result.worktreePath).toBe('C:/isolated')
    expect(d.createConversation).toHaveBeenCalledWith(
      'm',
      expect.objectContaining({ kind: 'worktree', worktreePath: 'C:/isolated' })
    )
  })

  it('removes partial resources when copying fails', async () => {
    const manager = {
      create: vi.fn(async () => ({ path: 'C:/isolated', branch: 'b' })),
      finalize: vi.fn()
    }
    const d = deps({
      worktreeManager: manager,
      saveMessage: vi.fn(() => {
        throw new Error('copy failed')
      })
    })
    await expect(
      forkTaskAtTurn({ sourceConversationId: 'source', turnId: 'turn-1', isolateWorktree: true }, d)
    ).rejects.toThrow('copy failed')
    expect(d.deleteConversation).toHaveBeenCalledWith('child')
    expect(manager.finalize).toHaveBeenCalledWith({ path: 'C:/isolated', branch: 'b' })
  })
})
