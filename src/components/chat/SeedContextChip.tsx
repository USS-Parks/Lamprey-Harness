import { useState } from 'react'

export interface ParsedSeedContext {
  body: string
  source?: string
  kind?: string
  fromMessageId?: string
}

const SEED_RE = /^\s*<seed_context\b([^>]*)>\n?([\s\S]*?)\n?<\/seed_context>\s*$/i

function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return match?.[1]
}

export function parseSeedContext(content: string): ParsedSeedContext | null {
  const match = content.match(SEED_RE)
  if (!match) return null
  return {
    source: attr(match[1], 'source'),
    kind: attr(match[1], 'kind'),
    fromMessageId: attr(match[1], 'from_message_id'),
    body: match[2].trim()
  }
}

export function SeedContextChip({ seed }: { seed: ParsedSeedContext }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-2 rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)]/70 text-[13px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[var(--text-secondary)]"
      >
        <span>
          Seeded from {seed.kind ?? 'context'}
          {seed.fromMessageId ? `:${seed.fromMessageId.slice(0, 8)}` : ''}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <pre className="m-0 max-h-64 overflow-auto border-t border-[var(--panel-border)] p-3 text-xs text-[var(--text-primary)]">
          {seed.body}
        </pre>
      )}
    </div>
  )
}
