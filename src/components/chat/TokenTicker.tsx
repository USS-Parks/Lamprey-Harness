import { useChatStore } from '@/stores/chat-store'

/* Char/token heuristic that matches StreamStatusLine — exact counts come
   from the backend, this is just a directional ticker. */
function estTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.round(text.length / 4))
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export function TokenTicker() {
  const messages = useChatStore((s) => s.messages)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const activeConversationId = useChatStore((s) => s.activeConversationId)

  if (!activeConversationId) return null

  let input = 0
  let output = 0
  for (const m of messages) {
    if (m.role === 'user') input += estTokens(m.content)
    else if (m.role === 'assistant') output += estTokens(m.content)
  }
  output += estTokens(streamingContent)
  const total = input + output
  if (total === 0) return null

  return (
    <div className="mb-2 flex items-center justify-end gap-3 px-1 font-mono text-[11px] text-[var(--text-muted)]">
      <span title="Estimated user input tokens this conversation">
        ↑ {formatTokens(input)}
      </span>
      <span title="Estimated assistant output tokens this conversation">
        ↓ {formatTokens(output)}
      </span>
      <span aria-hidden className="text-[var(--border)]">·</span>
      <span title="Estimated total tokens this conversation">
        Σ {formatTokens(total)} tokens
      </span>
    </div>
  )
}
