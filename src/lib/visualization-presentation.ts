import type { VisualizationType } from '@/lib/types'

export interface TableVisualization {
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, string | number | boolean | null>>
}

export interface ChartVisualization {
  type: 'bar' | 'line' | 'area' | 'pie' | 'scatter'
  xKey: string
  yKeys: string[]
  data: Array<Record<string, unknown>>
}

export function inlineVisualizationKind(
  type: VisualizationType
): 'mermaid' | 'chart' | 'table' | 'svg' | 'sandbox-only' {
  if (type === 'html' || type === 'jsx' || type === 'react') return 'sandbox-only'
  return type
}

export function parseTableVisualization(content: string): TableVisualization {
  const parsed = JSON.parse(content) as TableVisualization
  if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) {
    throw new Error('Invalid table visualization')
  }
  return parsed
}

export function parseChartVisualization(content: string): ChartVisualization {
  const parsed = JSON.parse(content) as ChartVisualization
  if (!Array.isArray(parsed.data) || !Array.isArray(parsed.yKeys)) {
    throw new Error('Invalid chart visualization')
  }
  return parsed
}

export function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

export function artifactExportMime(type: VisualizationType): string {
  if (type === 'svg' || type === 'mermaid') return 'image/svg+xml'
  if (type === 'html') return 'text/html'
  if (type === 'chart' || type === 'table') return 'application/json'
  return 'text/plain'
}
