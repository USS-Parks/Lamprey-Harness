import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  browserDeveloperCdpAdapter,
  redactSensitiveText,
  type BrowserDeveloperCdpAdapter
} from './browser-developer-observer'
import { readSettings } from './settings-helper'

const MAX_SNAPSHOT_NODES = 500
const MAX_AX_NODES = 500
const MAX_ATTRIBUTES = 32
const MAX_TEXT = 2_000
const MAX_RESULT_BYTES = 200_000
const MAX_TRACE_MS = 10_000
const MAX_TRACE_EVENTS = 1_000
const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024
const MAX_ANNOTATIONS = 50
const MAX_EVIDENCE_RECORDS = 100

const COMPUTED_STYLE_ALLOWLIST = new Set([
  'display', 'visibility', 'position', 'width', 'height', 'color', 'background-color',
  'font-family', 'font-size', 'font-weight', 'overflow', 'z-index'
])

const RUNTIME_PROBES = {
  document_state: `(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    characterSet: document.characterSet,
    contentType: document.contentType
  }))()`,
  viewport: `(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    visualViewport: window.visualViewport ? {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      scale: window.visualViewport.scale,
      offsetLeft: window.visualViewport.offsetLeft,
      offsetTop: window.visualViewport.offsetTop
    } : null
  }))()`,
  active_element: `(() => {
    const el = document.activeElement;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      tagName: el.tagName,
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className.slice(0, 500) : null,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
  })()`
} as const

export type BrowserRuntimeProbe = keyof typeof RUNTIME_PROBES

export interface DomSnapshotArgs {
  tab_id?: string
  kind?: 'dom' | 'accessibility'
  max_nodes?: number
  computed_styles?: string[]
}

export interface RuntimeInspectArgs {
  tab_id?: string
  kind: BrowserRuntimeProbe
}

export interface PerformanceInspectArgs {
  tab_id?: string
}

export interface TraceWindowArgs {
  tab_id?: string
  duration_ms?: number
  max_events?: number
}

export interface ScreenshotAnnotation {
  label: string
  x: number
  y: number
  width?: number
  height?: number
  color?: string
}

export interface ScreenshotAnnotationArgs {
  tab_id?: string
  annotations?: ScreenshotAnnotation[]
}

export interface BrowserDeveloperEvidence {
  referenceId: string
  targetId: string
  url: string
  path: string
  bytes: number
  annotations: Array<Record<string, unknown>>
  at: number
}

interface RuntimeEvaluateResult {
  result?: { value?: unknown; description?: string }
  exceptionDetails?: { text?: string }
}

interface ScreenshotWriter {
  (targetId: string, bytes: Buffer, at: number): string
}

function enabled(): boolean {
  return readSettings().browserDeveloperModeEnabled === true
}

function abortError(): Error {
  const error = new Error('Browser inspection cancelled')
  error.name = 'AbortError'
  return error
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value!)))
}

function boundedText(value: unknown, max = MAX_TEXT): string {
  return redactSensitiveText(String(value ?? '')).slice(0, max)
}

function defaultScreenshotWriter(targetId: string, bytes: Buffer, at: number): string {
  const dir = join(app.getPath('userData'), 'artifacts', 'browser-developer')
  mkdirSync(dir, { recursive: true })
  const safeTarget = targetId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const path = join(dir, `${safeTarget}-${at}.png`)
  writeFileSync(path, bytes)
  return path
}

function assertResultSize(value: unknown, label: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
  if (bytes > MAX_RESULT_BYTES) throw new Error(`${label} exceeded ${MAX_RESULT_BYTES} bytes`)
}

function decodeString(strings: unknown, index: unknown): string {
  if (!Array.isArray(strings) || typeof index !== 'number') return ''
  return boundedText(strings[index])
}

function decodeAttributes(strings: unknown[], raw: unknown): Record<string, string> {
  if (!Array.isArray(raw)) return {}
  const result: Record<string, string> = {}
  for (let index = 0; index + 1 < raw.length && index < MAX_ATTRIBUTES * 2; index += 2) {
    const name = decodeString(strings, raw[index])
    if (name) result[name] = decodeString(strings, raw[index + 1])
  }
  return result
}

function normalizeDomSnapshot(raw: any, maxNodes: number, computedStyles: string[]): Record<string, unknown> {
  const strings = Array.isArray(raw?.strings) ? raw.strings : []
  const document = Array.isArray(raw?.documents) ? raw.documents[0] : undefined
  const nodes = document?.nodes ?? {}
  const layout = document?.layout ?? {}
  const layoutByNode = new Map<number, { bounds?: unknown; styles?: unknown }>()
  if (Array.isArray(layout.nodeIndex)) {
    for (let index = 0; index < layout.nodeIndex.length; index += 1) {
      const nodeIndex = layout.nodeIndex[index]
      if (typeof nodeIndex === 'number') {
        layoutByNode.set(nodeIndex, { bounds: layout.bounds?.[index], styles: layout.styles?.[index] })
      }
    }
  }
  const available = Array.isArray(nodes.nodeName) ? nodes.nodeName.length : 0
  const count = Math.min(available, maxNodes)
  const normalized = []
  for (let index = 0; index < count; index += 1) {
    const layoutEntry = layoutByNode.get(index)
    const styleIndexes = Array.isArray(layoutEntry?.styles) ? layoutEntry.styles : []
    const styles: Record<string, string> = {}
    for (let styleIndex = 0; styleIndex < computedStyles.length; styleIndex += 1) {
      styles[computedStyles[styleIndex]!] = decodeString(strings, styleIndexes[styleIndex])
    }
    normalized.push({
      index,
      parentIndex: nodes.parentIndex?.[index] ?? null,
      nodeType: nodes.nodeType?.[index] ?? null,
      nodeName: decodeString(strings, nodes.nodeName?.[index]),
      nodeValue: decodeString(strings, nodes.nodeValue?.[index]),
      backendNodeId: nodes.backendNodeId?.[index] ?? null,
      attributes: decodeAttributes(strings, nodes.attributes?.[index]),
      bounds: Array.isArray(layoutEntry?.bounds) ? layoutEntry?.bounds : undefined,
      styles
    })
  }
  return {
    document: {
      url: decodeString(strings, document?.documentURL),
      title: decodeString(strings, document?.title),
      baseUrl: decodeString(strings, document?.baseURL)
    },
    availableNodes: available,
    returnedNodes: normalized.length,
    truncated: available > normalized.length,
    computedStyles,
    nodes: normalized
  }
}

function axValue(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return undefined
  const value = (raw as { value?: unknown }).value
  return typeof value === 'string' ? boundedText(value) : value
}

function normalizeAxTree(raw: any, maxNodes: number): Record<string, unknown> {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : []
  const returned = nodes.slice(0, maxNodes).map((node: any) => ({
    nodeId: String(node.nodeId ?? ''),
    parentId: node.parentId ? String(node.parentId) : undefined,
    ignored: node.ignored === true,
    role: axValue(node.role),
    name: axValue(node.name),
    description: axValue(node.description),
    value: axValue(node.value),
    properties: Array.isArray(node.properties)
      ? node.properties.slice(0, 24).map((property: any) => ({
          name: boundedText(property.name, 120), value: axValue(property.value)
        }))
      : []
  }))
  return {
    availableNodes: nodes.length,
    returnedNodes: returned.length,
    truncated: nodes.length > returned.length,
    nodes: returned
  }
}

export class BrowserDeveloperInspection {
  private readonly evidence: BrowserDeveloperEvidence[] = []

  constructor(
    private readonly adapter: BrowserDeveloperCdpAdapter = browserDeveloperCdpAdapter,
    private readonly isEnabled = enabled,
    private readonly screenshotWriter: ScreenshotWriter = defaultScreenshotWriter,
    private readonly now = () => Date.now()
  ) {}

  async captureDomSnapshot(args: DomSnapshotArgs = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const targetId = this.attach(args.tab_id, signal)
    const startUrl = await this.currentUrl(targetId, signal)
    const kind = args.kind ?? 'dom'
    const maxNodes = clampInteger(args.max_nodes, 200, 1, kind === 'dom' ? MAX_SNAPSHOT_NODES : MAX_AX_NODES)
    let result: Record<string, unknown>
    if (kind === 'accessibility') {
      await this.adapter.sendCommand(targetId, 'Accessibility.enable', undefined, { signal })
      result = normalizeAxTree(
        await this.adapter.sendCommand(targetId, 'Accessibility.getFullAXTree', {}, { signal }),
        maxNodes
      )
    } else {
      const computedStyles = [...new Set(args.computed_styles ?? [])]
      if (computedStyles.some((name) => !COMPUTED_STYLE_ALLOWLIST.has(name))) {
        throw new Error('computed_styles contains a property outside the fixed allowlist')
      }
      const raw = await this.adapter.sendCommand(targetId, 'DOMSnapshot.captureSnapshot', {
        computedStyles,
        includeDOMRects: true,
        includePaintOrder: false,
        includeBlendedBackgroundColors: false,
        includeTextColorOpacities: false
      }, { signal })
      result = normalizeDomSnapshot(raw, maxNodes, computedStyles)
    }
    await this.assertStableNavigation(targetId, startUrl, signal)
    assertResultSize(result, `${kind} snapshot`)
    return { targetId, kind, url: startUrl, ...result }
  }

  async inspectRuntime(args: RuntimeInspectArgs, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const expression = RUNTIME_PROBES[args.kind]
    if (!expression) throw new Error('kind must be document_state, viewport, or active_element')
    const targetId = this.attach(args.tab_id, signal)
    const startUrl = await this.currentUrl(targetId, signal)
    const raw = await this.evaluate(targetId, expression, signal)
    await this.assertStableNavigation(targetId, startUrl, signal)
    assertResultSize(raw, 'runtime inspection')
    return { targetId, kind: args.kind, url: startUrl, value: raw }
  }

  async inspectPerformance(args: PerformanceInspectArgs = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const targetId = this.attach(args.tab_id, signal)
    const startUrl = await this.currentUrl(targetId, signal)
    await this.adapter.sendCommand(targetId, 'Performance.enable', undefined, { signal })
    const [performance, layout] = await Promise.all([
      this.adapter.sendCommand(targetId, 'Performance.getMetrics', {}, { signal }),
      this.adapter.sendCommand(targetId, 'Page.getLayoutMetrics', {}, { signal })
    ]) as [any, any]
    await this.assertStableNavigation(targetId, startUrl, signal)
    const allowedMetrics = new Set([
      'Timestamp', 'Documents', 'Frames', 'JSEventListeners', 'Nodes', 'LayoutCount',
      'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration',
      'TaskDuration', 'JSHeapUsedSize', 'JSHeapTotalSize', 'DomContentLoaded', 'NavigationStart'
    ])
    const metrics = Object.fromEntries(
      (Array.isArray(performance?.metrics) ? performance.metrics : [])
        .filter((metric: any) => allowedMetrics.has(metric.name) && typeof metric.value === 'number')
        .map((metric: any) => [metric.name, metric.value])
    )
    const result = {
      targetId,
      url: startUrl,
      metrics,
      layout: {
        layoutViewport: layout?.layoutViewport,
        visualViewport: layout?.visualViewport,
        contentSize: layout?.contentSize,
        cssLayoutViewport: layout?.cssLayoutViewport,
        cssVisualViewport: layout?.cssVisualViewport,
        cssContentSize: layout?.cssContentSize
      }
    }
    assertResultSize(result, 'performance inspection')
    return result
  }

  async captureTraceWindow(args: TraceWindowArgs = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const targetId = this.attach(args.tab_id, signal)
    const durationMs = clampInteger(args.duration_ms, 1_000, 100, MAX_TRACE_MS)
    const maxEvents = clampInteger(args.max_events, 300, 1, MAX_TRACE_EVENTS)
    const startUrl = await this.currentUrl(targetId, signal)
    const events: Array<Record<string, unknown>> = []
    let observedEvents = 0
    let completeTrace: (() => void) | null = null
    const complete = new Promise<void>((resolve) => { completeTrace = resolve })
    const unsubscribe = this.adapter.subscribe(targetId, (_event, method, params) => {
      if (method === 'Tracing.dataCollected') {
        const values = (params as { value?: unknown[] })?.value
        if (!Array.isArray(values)) return
        observedEvents += values.length
        for (const raw of values) {
          if (events.length >= maxEvents || !raw || typeof raw !== 'object') break
          const event = raw as Record<string, unknown>
          events.push({
            name: boundedText(event.name, 300),
            category: boundedText(event.cat, 300),
            phase: boundedText(event.ph, 20),
            timestamp: event.ts,
            duration: event.dur,
            processId: event.pid,
            threadId: event.tid
          })
        }
      } else if (method === 'Tracing.tracingComplete') {
        completeTrace?.()
      }
    })
    let traceStarted = false
    try {
      await this.adapter.sendCommand(targetId, 'Tracing.start', {
        categories: 'devtools.timeline,blink.user_timing,loading',
        options: 'sampling-frequency=1000',
        transferMode: 'ReportEvents'
      }, { signal })
      traceStarted = true
      await this.delay(durationMs, signal)
      await this.adapter.sendCommand(targetId, 'Tracing.end', {}, { signal })
      traceStarted = false
      await Promise.race([complete, this.delay(2_000, signal)])
      const endUrl = await this.currentUrl(targetId, signal)
      const result = {
        targetId,
        durationMs,
        startUrl,
        endUrl,
        navigationChanged: startUrl !== endUrl,
        observedEvents,
        returnedEvents: events.length,
        truncated: observedEvents > events.length,
        events
      }
      assertResultSize(result, 'trace window')
      return result
    } finally {
      unsubscribe()
      if (traceStarted) {
        void this.adapter.sendCommand(targetId, 'Tracing.end').catch(() => undefined)
      }
    }
  }

  async captureAnnotatedScreenshot(
    args: ScreenshotAnnotationArgs = {},
    signal?: AbortSignal
  ): Promise<BrowserDeveloperEvidence> {
    const targetId = this.attach(args.tab_id, signal)
    const startUrl = await this.currentUrl(targetId, signal)
    const annotations = (args.annotations ?? []).slice(0, MAX_ANNOTATIONS).map((annotation, index) => {
      if (!Number.isFinite(annotation.x) || !Number.isFinite(annotation.y)) {
        throw new Error(`annotations[${index}] requires finite x and y coordinates`)
      }
      return {
        id: `annotation-${index + 1}`,
        label: boundedText(annotation.label, 120),
        x: Math.max(0, annotation.x),
        y: Math.max(0, annotation.y),
        width: Number.isFinite(annotation.width) ? Math.max(0, annotation.width!) : undefined,
        height: Number.isFinite(annotation.height) ? Math.max(0, annotation.height!) : undefined,
        color: /^#[0-9a-f]{6}$/i.test(annotation.color ?? '') ? annotation.color : '#ffb020'
      }
    })
    const result = await this.adapter.sendCommand(targetId, 'Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false
    }, { signal }) as { data?: unknown }
    const encoded = typeof result?.data === 'string' ? result.data : ''
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.length === 0) throw new Error('CDP returned an empty screenshot')
    if (bytes.length > MAX_SCREENSHOT_BYTES) {
      throw new Error(`Screenshot exceeded ${MAX_SCREENSHOT_BYTES} bytes`)
    }
    await this.assertStableNavigation(targetId, startUrl, signal)
    const at = this.now()
    const path = this.screenshotWriter(targetId, bytes, at)
    const evidence: BrowserDeveloperEvidence = {
      referenceId: `browser-screenshot:${targetId}:${at}`,
      targetId,
      url: startUrl,
      path,
      bytes: bytes.length,
      annotations,
      at
    }
    this.evidence.push(evidence)
    if (this.evidence.length > MAX_EVIDENCE_RECORDS) {
      this.evidence.splice(0, this.evidence.length - MAX_EVIDENCE_RECORDS)
    }
    return evidence
  }

  listEvidence(targetId?: string): BrowserDeveloperEvidence[] {
    return this.evidence
      .filter((record) => !targetId || record.targetId === targetId)
      .map((record) => ({ ...record, annotations: record.annotations.map((item) => ({ ...item })) }))
  }

  clearEvidence(targetId?: string): number {
    const before = this.evidence.length
    if (!targetId) {
      this.evidence.length = 0
      return before
    }
    for (let index = this.evidence.length - 1; index >= 0; index -= 1) {
      if (this.evidence[index]?.targetId === targetId) this.evidence.splice(index, 1)
    }
    return before - this.evidence.length
  }

  private attach(tabId?: string, signal?: AbortSignal): string {
    if (!this.isEnabled()) throw new Error('Browser Developer Mode is disabled')
    if (signal?.aborted) throw abortError()
    return this.adapter.attach(tabId, signal).targetId
  }

  private async currentUrl(targetId: string, signal?: AbortSignal): Promise<string> {
    const result = await this.evaluate(targetId, 'location.href', signal)
    return boundedText(result, 8_192)
  }

  private async assertStableNavigation(targetId: string, expectedUrl: string, signal?: AbortSignal): Promise<void> {
    const current = await this.currentUrl(targetId, signal)
    if (current !== expectedUrl) throw new Error('Browser target navigated during inspection; evidence was discarded')
  }

  private async evaluate(targetId: string, expression: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.adapter.sendCommand(targetId, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: false,
      silent: true,
      throwOnSideEffect: true,
      timeout: 1_000
    }, { signal }) as RuntimeEvaluateResult
    if (response.exceptionDetails) {
      throw new Error(`Runtime inspection failed: ${boundedText(response.exceptionDetails.text)}`)
    }
    return response.result?.value ?? response.result?.description ?? null
  }

  private async delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw abortError()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, milliseconds)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(abortError())
      }, { once: true })
    })
  }
}

export const browserDeveloperInspection = new BrowserDeveloperInspection()
