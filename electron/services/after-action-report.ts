import { getConversation, getMessages } from './conversation-store'
import { listChangeContracts, type ChangeContract } from './change-contract-store'
import { listTimeline, type EventRecord } from './event-log'
import { listToolCallsForConversation } from './tool-calls-store'

type CauseSeverity = 'info' | 'warning' | 'error'

export interface AfterActionCause {
  severity: CauseSeverity
  title: string
  detail: string
}

export interface AfterActionTimelineItem {
  id: string
  at: number
  type: string
  severity: CauseSeverity
  summary: string
  correlationId?: string
}

export interface AfterActionToolItem {
  id: string
  name: string
  status: string
  startedAt: number
  durationMs?: number
  argsPreview: string
  resultPreview?: string
  errorPreview?: string
}

export interface AfterActionReport {
  conversationId: string
  title: string
  model: string
  generatedAt: number
  createdAt: number
  updatedAt: number
  counts: {
    messages: number
    userPrompts: number
    assistantTurns: number
    emptyAssistantTurns: number
    toolRequestTurns: number
    toolResults: number
    events: number
    toolCalls: number
    toolErrors: number
    toolDenied: number
    chatErrors: number
    modelRequestsStarted: number
    modelRequestsCompleted: number
    modelRequestsFailed: number
    approvals: number
  }
  latestUserPrompt?: string
  latestAssistantText?: string
  causes: AfterActionCause[]
  timeline: AfterActionTimelineItem[]
  recentTools: AfterActionToolItem[]
  proof: {
    activeContracts: ChangeContract[]
    gatePassed: number
    gateFailed: number
    gateWaived: number
    latestFailureReason?: string
  }
}

const PREVIEW_CHARS = 280

function preview(value: unknown, max = PREVIEW_CHARS): string {
  if (value === undefined || value === null) return ''
  const text =
    typeof value === 'string'
      ? value
      : (() => {
          try {
            return JSON.stringify(value)
          } catch {
            return String(value)
          }
        })()
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return compact.slice(0, Math.max(0, max - 14)) + '... (truncated)'
}

function payloadPreview(e: EventRecord): string {
  const p = e.payload ?? {}
  if (typeof p.errorPreview === 'string') return p.errorPreview
  if (typeof p.resultPreview === 'string') return p.resultPreview
  if (typeof p.outputPreview === 'string') return p.outputPreview
  if (typeof p.provider === 'string' || typeof p.model === 'string') {
    return [p.provider, p.model, p.apiModelId].filter(Boolean).join(' / ')
  }
  if (typeof p.toolId === 'string') return String(p.toolId)
  return preview(p)
}

function summarizeEvent(e: EventRecord): string {
  const detail = payloadPreview(e)
  return detail ? `${e.type}: ${preview(detail, 180)}` : e.type
}

function terminalModelCounts(events: EventRecord[]): {
  started: number
  completed: number
  failed: number
  openByCorrelation: string[]
} {
  const byCorrelation = new Map<
    string,
    { started: number; terminal: number }
  >()
  let started = 0
  let completed = 0
  let failed = 0

  for (const e of events) {
    if (!e.type.startsWith('model.request.')) continue
    if (e.type === 'model.request.started') started += 1
    if (e.type === 'model.request.completed') completed += 1
    if (e.type === 'model.request.failed') failed += 1
    if (!e.correlationId) continue
    const row = byCorrelation.get(e.correlationId) ?? { started: 0, terminal: 0 }
    if (e.type === 'model.request.started') row.started += 1
    if (e.type === 'model.request.completed' || e.type === 'model.request.failed') {
      row.terminal += 1
    }
    byCorrelation.set(e.correlationId, row)
  }

  const openByCorrelation = [...byCorrelation.entries()]
    .filter(([, v]) => v.started > v.terminal)
    .map(([id]) => id)

  return { started, completed, failed, openByCorrelation }
}

export function buildAfterActionReport(conversationId: string): AfterActionReport {
  if (!conversationId || typeof conversationId !== 'string') {
    throw new Error('conversationId is required')
  }

  const conversation = getConversation(conversationId)
  if (!conversation) throw new Error('conversation not found')

  const messages = getMessages(conversationId)
  const events = listTimeline({ conversationId, limit: 1000 })
  const tools = listToolCallsForConversation(conversationId, 500)

  const userMessages = messages.filter((m) => m.role === 'user')
  const assistantMessages = messages.filter((m) => m.role === 'assistant')
  const emptyAssistantMessages = assistantMessages.filter(
    (m) => m.content.trim().length === 0
  )
  const toolRequestTurns = assistantMessages.filter(
    (m) => (m.toolCalls?.length ?? 0) > 0
  )
  const toolResults = messages.filter((m) => m.role === 'tool')
  const toolErrors = tools.filter((t) => t.status === 'error')
  const toolDenied = tools.filter((t) => t.status === 'denied')
  const chatErrors = events.filter((e) => e.type === 'chat.error')
  const proofGatePassed = events.filter((e) => e.type === 'proof.gate.passed')
  const proofGateFailed = events.filter((e) => e.type === 'proof.gate.failed')
  const proofGateWaived = events.filter((e) => e.type === 'proof.gate.waived')
  const activeContracts = listChangeContracts({
    conversationId,
    status: 'active',
    limit: 5
  })
  const approvals = events.filter(
    (e) => e.type === 'tool.call.approved' || e.type === 'tool.call.denied'
  )
  const modelCounts = terminalModelCounts(events)

  const causes: AfterActionCause[] = []
  if (emptyAssistantMessages.length > 0) {
    causes.push({
      severity: 'warning',
      title: 'Invisible assistant turns',
      detail:
        `${emptyAssistantMessages.length} assistant turn(s) saved no visible text. ` +
        'If those turns only emitted reasoning or tool calls, the chat can look idle even while Lamprey is working.'
    })
  }
  if (toolRequestTurns.length > 8) {
    causes.push({
      severity: 'warning',
      title: 'Long tool loop',
      detail:
        `${toolRequestTurns.length} assistant turn(s) requested tools. ` +
        'A long read/edit/build loop can feel like a second prompt is needed before a human-readable wrap-up appears.'
    })
  }
  if (toolErrors.length > 0) {
    causes.push({
      severity: 'error',
      title: 'Tool failures',
      detail:
        `${toolErrors.length} tool call(s) ended in error. ` +
        `Most recent: ${toolErrors[0]?.name ?? 'unknown'} - ${preview(toolErrors[0]?.error)}`
    })
  }
  if (chatErrors.length > 0) {
    causes.push({
      severity: 'error',
      title: 'Chat orchestration errors',
      detail: `${chatErrors.length} chat error event(s) were recorded in this conversation.`
    })
  }
  if (proofGateFailed.length > 0) {
    const latest = proofGateFailed.at(-1)
    causes.push({
      severity: 'warning',
      title: 'Untrusted proof gate',
      detail:
        `${proofGateFailed.length} proof gate failure event(s) were recorded. ` +
        `${preview(latest?.payload?.reason, 220)}`
    })
  }
  if (proofGateWaived.length > 0) {
    causes.push({
      severity: 'warning',
      title: 'Proof gate waived',
      detail:
        `${proofGateWaived.length} waiver event(s) were recorded. ` +
        'The contract was closed by explicit user waiver instead of fresh verification.'
    })
  }
  if (activeContracts.length > 0) {
    causes.push({
      severity: 'info',
      title: 'Active change contract',
      detail:
        `${activeContracts.length} active contract(s) still require proof before a trusted completion.`
    })
  }
  if (modelCounts.openByCorrelation.length > 0) {
    causes.push({
      severity: 'warning',
      title: 'Possibly unfinished model request',
      detail:
        `${modelCounts.openByCorrelation.length} correlation id(s) have more model.request.started events than terminal events. ` +
        'That can indicate an in-flight stream, an interrupted stream, or a missing terminal event.'
    })
  }
  if (approvals.length > 0) {
    causes.push({
      severity: 'info',
      title: 'Approval gates were involved',
      detail:
        `${approvals.length} approval/denial event(s) were recorded. ` +
        'Policy or modal decisions may explain pauses between model action and tool execution.'
    })
  }
  if (causes.length === 0) {
    causes.push({
      severity: 'info',
      title: 'No obvious stall markers',
      detail:
        'The stored history does not show empty assistant turns, tool failures, chat errors, or unfinished model requests.'
    })
  }

  const latestUserPrompt = [...userMessages].reverse().find((m) => m.content.trim())
  const latestAssistantText = [...assistantMessages]
    .reverse()
    .find((m) => m.content.trim().length > 0)

  return {
    conversationId,
    title: conversation.title,
    model: conversation.model,
    generatedAt: Date.now(),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    counts: {
      messages: messages.length,
      userPrompts: userMessages.length,
      assistantTurns: assistantMessages.length,
      emptyAssistantTurns: emptyAssistantMessages.length,
      toolRequestTurns: toolRequestTurns.length,
      toolResults: toolResults.length,
      events: events.length,
      toolCalls: tools.length,
      toolErrors: toolErrors.length,
      toolDenied: toolDenied.length,
      chatErrors: chatErrors.length,
      modelRequestsStarted: modelCounts.started,
      modelRequestsCompleted: modelCounts.completed,
      modelRequestsFailed: modelCounts.failed,
      approvals: approvals.length
    },
    latestUserPrompt: latestUserPrompt ? preview(latestUserPrompt.content, 420) : undefined,
    latestAssistantText: latestAssistantText ? preview(latestAssistantText.content, 420) : undefined,
    causes,
    timeline: events.slice(-120).map((e) => ({
      id: e.id,
      at: e.createdAt,
      type: e.type,
      severity: e.severity,
      summary: summarizeEvent(e),
      correlationId: e.correlationId
    })),
    recentTools: tools.slice(0, 40).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      startedAt: t.startedAt,
      durationMs: t.durationMs,
      argsPreview: preview(t.args),
      resultPreview: t.result ? preview(t.result) : undefined,
      errorPreview: t.error ? preview(t.error) : undefined
    })),
    proof: {
      activeContracts,
      gatePassed: proofGatePassed.length,
      gateFailed: proofGateFailed.length,
      gateWaived: proofGateWaived.length,
      latestFailureReason: preview(proofGateFailed.at(-1)?.payload?.reason, 280) || undefined
    }
  }
}
