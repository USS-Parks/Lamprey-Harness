import type { ArtifactType } from './artifact-schema'

export const MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024
export const MAX_ARTIFACT_FALLBACK_BYTES = 32 * 1024
export const MAX_ARTIFACT_ANNOTATION_BYTES = 16 * 1024

export const VISUALIZATION_TYPES = [
  'mermaid',
  'chart',
  'table',
  'html',
  'svg',
  'jsx',
  'react'
] as const

export type VisualizationType = (typeof VISUALIZATION_TYPES)[number]

const MERMAID_START =
  /^(?:---[\s\S]*?---\s*)?(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|timeline|mindmap|quadrantChart|xychart-beta|sankey-beta|block-beta|packet-beta|architecture-beta|gitGraph|journey|requirementDiagram|C4\w*)\b/i
const EXTERNAL_URI = /(?:https?:|file:|ftp:|javascript:|data:text\/html)/i

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function assertBoundedText(value: string, label: string, maxBytes: number): void {
  if (!value.trim()) throw new Error(`${label} is required`)
  if (value.includes('\0')) throw new Error(`${label} contains a NUL byte`)
  const size = byteLength(value)
  if (size > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes (got ${size})`)
}

function parseJsonObject(content: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function validateMermaid(content: string): void {
  if (/%%\s*\{/i.test(content)) throw new Error('mermaid init directives are not allowed')
  if (!MERMAID_START.test(content.trim())) {
    throw new Error('mermaid content must start with a supported diagram declaration')
  }
  if (/^\s*click\s+/im.test(content)) throw new Error('mermaid click directives are not allowed')
  if (EXTERNAL_URI.test(content)) throw new Error('mermaid external URLs are not allowed')
}

function validateChart(content: string): void {
  const chart = parseJsonObject(content, 'chart content')
  const type = chart.type
  if (!['bar', 'line', 'area', 'pie', 'scatter'].includes(String(type))) {
    throw new Error('chart type must be bar, line, area, pie, or scatter')
  }
  if (!Array.isArray(chart.data) || chart.data.length === 0 || chart.data.length > 5000) {
    throw new Error('chart data must contain 1 to 5000 rows')
  }
  for (const row of chart.data) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('chart rows must be JSON objects')
    }
  }
  if (typeof chart.xKey !== 'string' || !chart.xKey) throw new Error('chart xKey is required')
  if (
    !Array.isArray(chart.yKeys) ||
    chart.yKeys.length === 0 ||
    chart.yKeys.length > 20 ||
    chart.yKeys.some((key) => typeof key !== 'string' || !key)
  ) {
    throw new Error('chart yKeys must contain 1 to 20 non-empty strings')
  }
}

function validateTable(content: string): void {
  const table = parseJsonObject(content, 'table content')
  if (!Array.isArray(table.columns) || table.columns.length === 0 || table.columns.length > 50) {
    throw new Error('table columns must contain 1 to 50 entries')
  }
  const keys = new Set<string>()
  for (const value of table.columns) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('table columns must be objects')
    }
    const column = value as Record<string, unknown>
    if (typeof column.key !== 'string' || !column.key)
      throw new Error('table column key is required')
    if (typeof column.label !== 'string' || !column.label) {
      throw new Error('table column label is required')
    }
    if (keys.has(column.key)) throw new Error(`duplicate table column key: ${column.key}`)
    keys.add(column.key)
  }
  if (!Array.isArray(table.rows) || table.rows.length > 5000) {
    throw new Error('table rows must be an array with at most 5000 entries')
  }
  for (const value of table.rows) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('table rows must be objects')
    }
    const row = value as Record<string, unknown>
    for (const [key, cell] of Object.entries(row)) {
      if (!keys.has(key)) throw new Error(`table row contains unknown column: ${key}`)
      if (cell !== null && !['string', 'number', 'boolean'].includes(typeof cell)) {
        throw new Error('table cells must be scalar JSON values')
      }
    }
  }
}

function validateSvg(content: string): void {
  if (!/^\s*<svg\b/i.test(content)) throw new Error('SVG content must start with an <svg> element')
  if (/<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(content)) {
    throw new Error('SVG scripts and embedded documents are not allowed')
  }
  if (/\son[a-z]+\s*=/i.test(content))
    throw new Error('SVG event-handler attributes are not allowed')
  if (EXTERNAL_URI.test(content)) throw new Error('SVG external URLs are not allowed')
}

function validateHtml(content: string): void {
  if (/<\s*(?:iframe|object|embed|base|meta)\b/i.test(content)) {
    throw new Error('HTML embedded documents and document-policy overrides are not allowed')
  }
  if (/<script\b[^>]*\bsrc\s*=/i.test(content)) {
    throw new Error('external HTML scripts are not allowed')
  }
  if (EXTERNAL_URI.test(content)) throw new Error('HTML external URLs are not allowed')
}

function validateJsx(content: string): void {
  if (/^\s*import\s/m.test(content) || /\brequire\s*\(/.test(content)) {
    throw new Error('JSX imports and require calls are not allowed')
  }
  if (
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker)\b/.test(content) ||
    /\b(?:window\.open|location\s*=|location\.)/.test(content) ||
    /\b(?:process|electron)\b/.test(content)
  ) {
    throw new Error('JSX network, navigation, worker, and host APIs are not allowed')
  }
  if (EXTERNAL_URI.test(content)) throw new Error('JSX external URLs are not allowed')
}

export function isVisualizationType(type: ArtifactType): type is VisualizationType {
  return (VISUALIZATION_TYPES as readonly string[]).includes(type)
}

export function validateArtifactContent(type: ArtifactType, content: string): void {
  assertBoundedText(content, 'artifact content', MAX_ARTIFACT_CONTENT_BYTES)
  switch (type) {
    case 'mermaid':
      validateMermaid(content)
      break
    case 'chart':
      validateChart(content)
      break
    case 'table':
      validateTable(content)
      break
    case 'svg':
      validateSvg(content)
      break
    case 'html':
      validateHtml(content)
      break
    case 'jsx':
    case 'react':
      validateJsx(content)
      break
    default:
      break
  }
}

export function validateVisualizationFallback(fallbackText: string): void {
  assertBoundedText(fallbackText, 'visualization fallbackText', MAX_ARTIFACT_FALLBACK_BYTES)
}

export function validateAnnotationBody(body: string): void {
  assertBoundedText(body, 'annotation body', MAX_ARTIFACT_ANNOTATION_BYTES)
}
