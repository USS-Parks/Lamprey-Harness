import type { LampreyToolCall, Message } from './types'
import type { ToolCallState } from '@/stores/chat-store'

export async function loadToolLedger(owner: string, fetchPage: (owner: string, limit: number, offset: number) => Promise<{ success: boolean; data?: LampreyToolCall[]; error?: string }>): Promise<LampreyToolCall[]> {
  const records = new Map<string, LampreyToolCall>()
  for (let offset = 0; ; offset += 500) {
    const page = await fetchPage(owner, 500, offset)
    if (!page.success || !Array.isArray(page.data)) throw new Error(page.error ?? 'Tool history is unavailable')
    for (const record of page.data) if (record.conversationId === owner) records.set(record.id, record)
    if (page.data.length < 500) return [...records.values()]
  }
}
function outcome(record: LampreyToolCall | undefined, activeStartedAt?: number): ToolCallState['status'] {
  if (record?.status === 'done') return 'success'
  if (record?.status === 'error') return 'error'
  if (record?.status === 'denied') return 'denied'
  if (record && activeStartedAt !== undefined && record.startedAt >= activeStartedAt) return record.status === 'running' ? 'running' : 'pending'
  return 'unknown'
}

/** Use message rows for full content and the call ledger for outcome authority. */
export function hydrateToolHistory(messages: Message[], records: LampreyToolCall[], activeStartedAt?: number): ToolCallState[] {
  const metadata = new Map(records.map(record => [record.id, record]))
  const results = new Map(messages.filter(message => message.role === 'tool' && message.toolCallId).map(message => [message.toolCallId!, message.content]))
  const calls = new Map<string, ToolCallState>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const call of message.toolCalls ?? []) {
      let args: Record<string, unknown> = {}
      let rawArguments: string | undefined
      try {
        const parsed = JSON.parse(call.function.arguments)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid arguments')
        args = parsed
      } catch { rawArguments = call.function.arguments }
      const record = metadata.get(call.id)
      calls.set(call.id, {
        callId: call.id, serverId: 'history', toolName: call.function.name, args, rawArguments,
        status: outcome(record, activeStartedAt), result: results.get(call.id) ?? record?.error ?? record?.result,
        resultIsPreview: !results.has(call.id) && !!record?.result,
        startedAt: record?.startedAt ?? message.timestamp, duration: record?.durationMs
      })
    }
  }
  for (const record of records) {
    if (calls.has(record.id)) continue
    calls.set(record.id, {
      callId: record.id, serverId: 'history', toolName: record.name, args: record.args,
      status: outcome(record, activeStartedAt), result: results.get(record.id) ?? record.error ?? record.result,
      resultIsPreview: !results.has(record.id) && !!record.result,
      startedAt: record.startedAt, duration: record.durationMs
    })
  }
  return [...calls.values()].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
}
export function mergeToolHistory(history: ToolCallState[], live: ToolCallState[]): ToolCallState[] {
  const calls = new Map(history.map(call => [call.callId, call]))
  for (const call of live) calls.set(call.callId, call)
  return [...calls.values()].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
}
