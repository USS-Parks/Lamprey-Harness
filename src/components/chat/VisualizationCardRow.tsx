import { useEffect, useMemo, useState } from 'react'
import type { VisualizationAttachment } from '@/lib/types'
import {
  artifactExportMime,
  inlineVisualizationKind,
  parseChartVisualization,
  parseTableVisualization,
  svgDataUrl,
  type ChartVisualization
} from '@/lib/visualization-presentation'
import { toast } from '@/stores/toast-store'
import { ArtifactEditorDialog } from './ArtifactEditorDialog'

interface ArtifactRevisionPayload {
  artifact: { exportFilename?: string | null; currentRevision: number }
  revision: { content: string; revision: number }
}

export function VisualizationCardRow({
  visualizations
}: {
  visualizations: VisualizationAttachment[]
}) {
  if (!visualizations.length) return null
  return (
    <div className="mt-3 flex w-full flex-col gap-2" aria-label="Visualizations">
      {visualizations.map((visualization) => (
        <VisualizationCard key={visualization.callId} visualization={visualization} />
      ))}
    </div>
  )
}

function VisualizationCard({ visualization }: { visualization: VisualizationAttachment }) {
  const [expanded, setExpanded] = useState(true)
  const [payload, setPayload] = useState<ArtifactRevisionPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setPayload(null)
    setLoadError(null)
    if (visualization.status !== 'ready' || !visualization.artifactId) return () => undefined
    void window.api.artifact
      .read(visualization.artifactId)
      .then((result) => {
        if (cancelled) return
        if (!result.success) {
          setLoadError(result.error ?? 'Could not load visualization')
          return
        }
        setPayload(result.data as ArtifactRevisionPayload)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, visualization.artifactId, visualization.status])

  const content = payload?.revision.content
  const status = visualization.status === 'ready' && !content ? 'loading' : visualization.status
  const error = visualization.error ?? loadError

  const openSandbox = () => {
    if (!content) return
    void window.api.artifact.openInWindow(visualization.type, content)
  }

  const exportArtifact = () => {
    if (!content) return
    const blob = new Blob([content], { type: artifactExportMime(visualization.type) })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download =
      payload?.artifact.exportFilename ??
      `${visualization.title.replace(/[^a-z0-9._-]+/gi, '-') || 'visualization'}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section
      className="overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--bg-secondary)]"
      data-visualization-id={visualization.artifactId ?? visualization.callId}
      aria-busy={status === 'loading'}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span aria-hidden className="text-[var(--accent)]">
          ◇
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--text-primary)]">
            {visualization.title}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
            {visualization.type} · {status}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded px-2 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]"
          aria-expanded={expanded}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        <button
          type="button"
          onClick={openSandbox}
          disabled={!content}
          className="rounded px-2 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] disabled:opacity-40"
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          disabled={!visualization.artifactId || !content}
          className="rounded px-2 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] disabled:opacity-40"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={exportArtifact}
          disabled={!content}
          className="rounded px-2 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] disabled:opacity-40"
        >
          Export
        </button>
      </header>
      {expanded && (
        <div className="border-t border-[var(--panel-border)] px-3 py-3">
          {status === 'loading' && (
            <div className="animate-pulse text-sm text-[var(--text-muted)]">
              Rendering visualization…
            </div>
          )}
          {(status === 'error' || error) && (
            <div role="alert" className="text-sm text-[var(--danger)]">
              {error ?? 'Visualization failed'}
            </div>
          )}
          {content && <SafeInlinePreview type={visualization.type} content={content} />}
          <p className="mt-3 border-t border-[var(--panel-border)] pt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-secondary)]">Text alternative: </span>
            {visualization.fallbackText}
          </p>
        </div>
      )}
      {editorOpen && visualization.artifactId && (
        <ArtifactEditorDialog
          artifactId={visualization.artifactId}
          title={visualization.title}
          onClose={() => setEditorOpen(false)}
          onRevisionAccepted={() => setRefreshKey((value) => value + 1)}
        />
      )}
    </section>
  )
}

function SafeInlinePreview({
  type,
  content
}: {
  type: VisualizationAttachment['type']
  content: string
}) {
  const kind = inlineVisualizationKind(type)
  if (kind === 'sandbox-only') {
    return (
      <div className="rounded-md bg-[var(--bg-primary)] p-4 text-sm text-[var(--text-secondary)]">
        Interactive content is isolated from the chat. Use Open to run it in the artifact sandbox.
      </div>
    )
  }
  if (kind === 'table') return <TablePreview content={content} />
  if (kind === 'chart') return <ChartPreview content={content} />
  if (kind === 'svg') {
    return <img src={svgDataUrl(content)} alt="" className="max-h-96 max-w-full" />
  }
  return <MermaidPreview content={content} />
}

function MermaidPreview({ content }: { content: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const id = `lamprey-mermaid-${crypto.randomUUID()}`
    void import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        const rendered = await mermaid.render(id, content)
        if (!cancelled) setSrc(svgDataUrl(rendered.svg))
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [content])
  if (error)
    return (
      <div role="alert" className="text-sm text-[var(--danger)]">
        {error}
      </div>
    )
  if (!src) return <div className="text-sm text-[var(--text-muted)]">Rendering diagram…</div>
  return <img src={src} alt="" className="max-h-96 max-w-full" />
}

function TablePreview({ content }: { content: string }) {
  const table = useMemo(() => parseTableVisualization(content), [content])
  return (
    <div className="max-h-96 overflow-auto rounded-md border border-[var(--panel-border)]">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead className="sticky top-0 bg-[var(--bg-primary)]">
          <tr>
            {table.columns.map((column) => (
              <th key={column.key} className="border-b border-[var(--panel-border)] px-2 py-1.5">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} className="odd:bg-[var(--bg-primary)]/40">
              {table.columns.map((column) => (
                <td key={column.key} className="px-2 py-1.5">
                  {String(row[column.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartPreview({ content }: { content: string }) {
  const chart = useMemo(() => parseChartVisualization(content), [content])
  return (
    <div className="rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3">
      <StaticChart chart={chart} />
    </div>
  )
}

function StaticChart({ chart }: { chart: ChartVisualization }) {
  const width = 640
  const height = 220
  const pad = 24
  const points = chart.data
    .flatMap((row, rowIndex) =>
      chart.yKeys.map((key, keyIndex) => ({
        rowIndex,
        keyIndex,
        value: Number(row[key]),
        label: String(row[chart.xKey] ?? rowIndex + 1)
      }))
    )
    .filter((point) => Number.isFinite(point.value))
  const max = Math.max(1, ...points.map((point) => Math.abs(point.value)))
  const colors = ['var(--accent)', '#4f9cf9', '#d38df2', '#f4a261', '#2a9d8f']
  const x = (index: number) =>
    pad + (index / Math.max(1, chart.data.length - 1)) * (width - pad * 2)
  const y = (value: number) => height - pad - (Math.max(0, value) / max) * (height - pad * 2)
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${chart.type} chart`}
      className="h-auto w-full"
    >
      <line
        x1={pad}
        y1={height - pad}
        x2={width - pad}
        y2={height - pad}
        stroke="var(--panel-border)"
      />
      {chart.type === 'bar'
        ? points.map((point, index) => {
            const groupWidth = (width - pad * 2) / Math.max(1, chart.data.length)
            const barWidth = Math.max(2, groupWidth / Math.max(1, chart.yKeys.length) - 2)
            return (
              <rect
                key={index}
                x={pad + point.rowIndex * groupWidth + point.keyIndex * (barWidth + 2)}
                y={y(point.value)}
                width={barWidth}
                height={Math.max(1, height - pad - y(point.value))}
                fill={colors[point.keyIndex % colors.length]}
              >
                <title>
                  {point.label}: {point.value}
                </title>
              </rect>
            )
          })
        : chart.yKeys.map((key, keyIndex) => {
            const series = points.filter((point) => point.keyIndex === keyIndex)
            const path = series
              .map(
                (point, index) =>
                  `${index === 0 ? 'M' : 'L'} ${x(point.rowIndex)} ${y(point.value)}`
              )
              .join(' ')
            return (
              <path
                key={key}
                d={path}
                fill="none"
                stroke={colors[keyIndex % colors.length]}
                strokeWidth="2"
              >
                <title>{key}</title>
              </path>
            )
          })}
    </svg>
  )
}
