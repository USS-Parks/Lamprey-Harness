import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/stores/toast-store'

interface ArtifactSource { type: string; content: string }

/** Hosts the existing sandbox view; durable source remains in the artifact ledger. */
export function ArtifactPanel({ artifactId }: { artifactId: string }) {
  const region = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState<ArtifactSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reportBounds = useCallback(() => {
    const rect = region.current?.getBoundingClientRect()
    if (!rect) return
    void window.api.artifact.resize({ x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) })
  }, [])

  useEffect(() => {
    let cancelled = false
    setSource(null)
    setError(null)
    void (async () => {
      try {
        const result = await window.api.artifact.read(artifactId)
        if (cancelled) return
        if (!result.success) throw new Error(result.error)
        const next = { type: result.data.artifact.artifactType, content: result.data.revision.content }
        const rendered = await window.api.artifact.render(next.type, next.content)
        if (cancelled) return
        if (!rendered.success) throw new Error(rendered.error)
        setSource(next)
        reportBounds()
      } catch (failure) { if (!cancelled) setError(String(failure)) }
    })()
    const observer = new ResizeObserver(reportBounds)
    if (region.current) observer.observe(region.current)
    return () => {
      cancelled = true
      observer.disconnect()
      void window.api.artifact.hide()
    }
  }, [artifactId, reportBounds])

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-[var(--panel-border)] px-3 text-xs text-[var(--text-secondary)]">
      <span className="flex-1">{source?.type ?? 'Artifact'}</span>
      <button disabled={!source} className="min-h-8 rounded px-2 hover:bg-[var(--bg-tertiary)] disabled:opacity-50" onClick={() => { if (source) void navigator.clipboard.writeText(source.content).then(() => toast.success('Source copied.'), failure => toast.error(String(failure))) }}>Copy source</button>
      <button disabled={!source} className="min-h-8 rounded px-2 hover:bg-[var(--bg-tertiary)] disabled:opacity-50" onClick={() => { if (source) void window.api.artifact.openInWindow(source.type, source.content) }}>Open in window</button>
    </div>
    {error && <p role="alert" className="p-3 text-sm text-[var(--error)]">{error} Close this tab and reopen the artifact to retry.</p>}
    {!source && !error && <p role="status" className="p-3 text-sm text-[var(--text-muted)]">Loading artifact…</p>}
    <div ref={region} aria-label="Artifact preview" className="min-h-0 flex-1" />
  </div>
}
