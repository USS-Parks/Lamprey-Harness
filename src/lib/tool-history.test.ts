import { describe, expect, it } from 'vitest'
import { hydrateToolHistory, loadToolLedger, mergeToolHistory } from './tool-history'
import { isGroupable } from './tool-call-grouping'
import type { LampreyToolCall, Message } from './types'
const record = (id: string, status: LampreyToolCall['status'] = 'done'): LampreyToolCall => ({ id, toolId: 'read_file', name: 'read_file', conversationId: 'owner', args: { path: 'a' }, startedAt: Number(id) || 1, status, result: 'preview' })
const message = (id: string, args = '{"path":"a"}'): Message => ({ id: `m${id}`, conversationId: 'owner', role: 'assistant', content: '', timestamp: Number(id), toolCalls: [{ id, type: 'function', function: { name: 'read_file', arguments: args } }] })
describe('stored tool history', () => {
  it('uses recorded outcomes, not the presence or wording of results', () => {
    const calls = hydrateToolHistory(['1', '2', '3', '4'].map(id => message(id)), [record('1'), record('2', 'error'), record('3', 'denied')])
    expect(calls.map(call => call.status)).toEqual(['success', 'error', 'denied', 'unknown'])
    expect(isGroupable(calls[3])).toBe(false)
  })
  it('recovers the full message result beyond the bounded ledger preview', () => {
    const content = 'full result '.repeat(1000) + 'END'
    const result: Message = { id: 'result', conversationId: 'owner', role: 'tool', content, timestamp: 2, toolCallId: '1' }
    expect(hydrateToolHistory([message('1'), result], [record('1')])[0]).toMatchObject({ result: content, resultIsPreview: false })
    expect(hydrateToolHistory([message('1')], [record('1')])[0].resultIsPreview).toBe(true)
  })
  it('preserves malformed arguments for inspection', () => {
    expect(hydrateToolHistory([message('1', '{broken')], [record('1')])[0].rawArguments).toBe('{broken')
  })
  it('does not revive old unfinished calls as running', () => {
    expect(hydrateToolHistory([], [record('1', 'running')])[0].status).toBe('unknown')
    expect(hydrateToolHistory([], [record('1', 'running')], 1)[0].status).toBe('running')
    expect(hydrateToolHistory([], [record('1', 'running')], 2)[0].status).toBe('unknown')
  })
  it('pages beyond 500 records and excludes another task', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => record(String(i)))
    rows.push({ ...record('foreign'), conversationId: 'other' })
    const offsets: number[] = []
    const result = await loadToolLedger('owner', async (_owner, limit, offset) => { offsets.push(offset); return { success: true, data: rows.slice(offset, offset + limit) } })
    expect(offsets).toEqual([0, 500, 1000]); expect(result).toHaveLength(1001)
  })
  it('exposes a storage failure rather than an empty success', async () => {
    await expect(loadToolLedger('owner', async () => ({ success: false, error: 'unavailable' }))).rejects.toThrow('unavailable')
  })
  it('deduplicates replayed calls while preserving live completion and ordering', () => {
    const history = hydrateToolHistory([], [record('2'), record('1')])
    const live = { ...history[0], status: 'error' as const, result: 'live failure' }
    expect(mergeToolHistory(history, [live])).toEqual([live, history[1]])
  })
})
