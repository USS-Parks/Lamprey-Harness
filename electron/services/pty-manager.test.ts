import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { EventEmitter } from 'node:events'
const fixture = vi.hoisted(() => ({ children: [] as Array<EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> }> }))
vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return { spawn: vi.fn(() => {
    const proc = Object.assign(new EventEmitter(), { pid: 9000 + fixture.children.length, stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { write: vi.fn() }, kill: vi.fn() })
    proc.kill.mockImplementation(() => { proc.emit('exit', 0, null); return true })
    fixture.children.push(proc)
    return proc
  }) }
})
import { ptyGetBuffer, ptyKill, ptyKillAll, ptyListSessions, ptySnapshot, ptySpawn, ptyWrite } from './pty-manager'
const window = { isDestroyed: () => false, webContents: { send: vi.fn() } } as unknown as BrowserWindow
afterEach(() => { ptyKillAll(); fixture.children.length = 0 })

describe('terminal snapshot lifecycle', () => {
  it('sequences output, retains it after exit and filters reads by task', () => {
    ptySpawn('snapshot-a', window, { conversationId: 'a' })
    fixture.children[0].stdout.emit('data', Buffer.from('first\n'))
    fixture.children[0].stderr.emit('data', Buffer.from('second\n'))
    expect(ptySnapshot('snapshot-a')).toMatchObject({ sequence: 2, buffer: 'first\nsecond\n', conversationId: 'a', running: true })
    expect(ptyGetBuffer('snapshot-a', 'b')).toBeNull()
    expect(ptyListSessions('b')).toEqual([])
    expect(ptyListSessions('a')).toEqual(['snapshot-a'])
    fixture.children[0].emit('exit', 0, null)
    expect(ptySnapshot('snapshot-a')).toMatchObject({ running: false, sequence: 3 })
    expect(ptyGetBuffer('snapshot-a', 'a')).toContain('first')
    expect(ptyWrite('snapshot-a', 'late')).toBe(false)
  })
  it('rejects duplicate live spawns and allows an explicit restart', () => {
    ptySpawn('restart-a', window, { conversationId: 'a' })
    expect(() => ptySpawn('restart-a', window)).toThrow('already exists')
    expect(ptyKill('restart-a')).toBe(true)
    ptySpawn('restart-a', window, { conversationId: 'a' })
    fixture.children[0].emit('exit', 0, null)
    expect(ptySnapshot('restart-a')?.running).toBe(true)
    expect(ptyListSessions('a')).toEqual(['restart-a'])
  })
  it('reports failed spawn and failed termination honestly', () => {
    ptySpawn('failed-a', window, { conversationId: 'a' })
    fixture.children[0].kill.mockReturnValue(false)
    expect(ptyKill('failed-a')).toBe(false)
    expect(ptySnapshot('failed-a')?.running).toBe(true)
    fixture.children[0].emit('error', Error('fixture unavailable'))
    expect(ptySnapshot('failed-a')).toMatchObject({ running: false })
    expect(ptyGetBuffer('failed-a')).toContain('fixture unavailable')
  })
})
