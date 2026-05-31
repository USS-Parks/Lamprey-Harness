import { useEffect, useState } from 'react'

interface StreamStatusLineProps {
  startedAt: number | null
  content: string
  reasoning?: string | null
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}m ${r}s`
}

function estimateTokens(text: string): number {
  // Cheap estimate: ~4 chars per token across most tokenizers. Close enough
  // for a live status line; exact counts come from the backend on finish.
  if (!text) return 0
  return Math.max(1, Math.round(text.length / 4))
}

export function StreamStatusLine({ startedAt, content, reasoning }: StreamStatusLineProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (!startedAt) return null

  const elapsed = formatElapsed(now - startedAt)
  const outputTokens = estimateTokens(content) + estimateTokens(reasoning ?? '')
  const phase = reasoning && !content ? 'thinking' : 'streaming'

  return (
    <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-[var(--text-muted)]">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
      <span>{elapsed}</span>
      <span aria-hidden>·</span>
      <span>{phase}</span>
      <span aria-hidden>·</span>
      <span>~{outputTokens.toLocaleString()} tokens</span>
    </div>
  )
}
