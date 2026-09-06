import type { RefObject } from 'react'
import { useSessionsStore } from '@/stores/sessions-store'

export function SessionSearchBar({ inputRef }: { inputRef?: RefObject<HTMLInputElement | null> }) {
  const query = useSessionsStore(s => s.query)
  const setQuery = useSessionsStore(s => s.setQuery)
  return <div className="relative px-2">
    <input ref={inputRef} type="search" aria-label="Search tasks" placeholder="Search tasks…" value={query} onChange={event => setQuery(event.target.value)} className="min-h-8 w-full rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 pr-8 text-xs focus:border-[var(--accent)]" />
    {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-0 min-h-8 min-w-8">×</button>}
  </div>
}
