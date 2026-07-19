import { describe, expect, it, vi } from 'vitest'
import {
  BrowserDeveloperInspection,
  type ScreenshotAnnotationArgs
} from './browser-developer-inspection'
import type { BrowserDeveloperCdpAdapter } from './browser-developer-observer'
import type { CdpMessageListener } from './browser-cdp-session'

function harness() {
  const listeners = new Set<CdpMessageListener>()
  const urls = ['https://example.test/', 'https://example.test/']
  const sendCommand = vi.fn(async (_targetId: string, method: string, params?: Record<string, unknown>) => {
    if (method === 'Runtime.evaluate') {
      if (params?.expression === 'location.href') {
        return { result: { value: urls.shift() ?? 'https://example.test/' } }
      }
      return { result: { value: { readyState: 'complete', token: '[REDACTED]' } } }
    }
    if (method === 'DOMSnapshot.captureSnapshot') {
      return {
        strings: ['#document', 'HTML', 'https://example.test/', 'Title', 'lang', 'en', 'block'],
        documents: [{
          documentURL: 2, title: 3, baseURL: 2,
          nodes: {
            parentIndex: [-1, 0], nodeType: [9, 1], nodeName: [0, 1], nodeValue: [0, 0],
            backendNodeId: [1, 2], attributes: [[], [4, 5]]
          },
          layout: { nodeIndex: [1], bounds: [[0, 0, 100, 100]], styles: [[6]] }
        }]
      }
    }
    if (method === 'Accessibility.getFullAXTree') {
      return { nodes: [{ nodeId: '1', role: { value: 'button' }, name: { value: 'Save' } }] }
    }
    if (method === 'Performance.getMetrics') {
      return { metrics: [{ name: 'Nodes', value: 12 }, { name: 'SecretMetric', value: 99 }] }
    }
    if (method === 'Page.getLayoutMetrics') {
      return { cssContentSize: { width: 800, height: 1200 } }
    }
    if (method === 'Page.captureScreenshot') {
      return { data: Buffer.from('png-bytes').toString('base64') }
    }
    if (method === 'Tracing.end') {
      for (const listener of listeners) {
        listener({}, 'Tracing.dataCollected', {
          value: [{ name: 'layout', cat: 'devtools.timeline', ph: 'X', ts: 1, dur: 2 }]
        })
        listener({}, 'Tracing.tracingComplete', {})
      }
    }
    return {}
  })
  const adapter: BrowserDeveloperCdpAdapter = {
    attach: vi.fn(() => ({
      targetId: 'tab-1', protocolVersion: '1.3', attached: true, reattached: false
    })),
    subscribe: vi.fn((_targetId, listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    sendCommand
  }
  const screenshotWriter = vi.fn(() => 'C:\\tmp\\browser-shot.png')
  let now = 5_000
  const inspection = new BrowserDeveloperInspection(adapter, () => true, screenshotWriter, () => ++now)
  return { adapter, inspection, screenshotWriter, sendCommand, urls }
}

describe('BD-3 BrowserDeveloperInspection', () => {
  it('returns a bounded structured DOM snapshot with allowlisted computed styles', async () => {
    const h = harness()
    const result = await h.inspection.captureDomSnapshot({ computed_styles: ['display'], max_nodes: 1 })
    expect(result).toMatchObject({ kind: 'dom', returnedNodes: 1, availableNodes: 2, truncated: true })
    expect((result.nodes as Array<Record<string, unknown>>)[0]).toMatchObject({
      nodeName: '#document', styles: { display: '' }
    })
    await expect(
      h.inspection.captureDomSnapshot({ computed_styles: ['background-image'] })
    ).rejects.toThrow('outside the fixed allowlist')
  })

  it('returns a bounded accessibility tree without page-authored code', async () => {
    const h = harness()
    const result = await h.inspection.captureDomSnapshot({ kind: 'accessibility' })
    expect(result).toMatchObject({
      kind: 'accessibility', returnedNodes: 1,
      nodes: [{ nodeId: '1', role: 'button', name: 'Save' }]
    })
  })

  it('uses only fixed runtime probes and rejects navigation races', async () => {
    const h = harness()
    const result = await h.inspection.inspectRuntime({ kind: 'document_state' })
    expect(result).toMatchObject({ kind: 'document_state', value: { readyState: 'complete' } })
    const expressions = h.sendCommand.mock.calls
      .filter((call) => call[1] === 'Runtime.evaluate')
      .map((call) => call[2]?.expression)
    expect(expressions).toHaveLength(3)
    expect(expressions[1]).toContain('document.readyState')

    const race = harness()
    race.urls.splice(0, race.urls.length, 'https://before.test/', 'https://after.test/')
    await expect(race.inspection.captureDomSnapshot()).rejects.toThrow('navigated during inspection')
  })

  it('filters performance metrics and returns layout measurements', async () => {
    const h = harness()
    const result = await h.inspection.inspectPerformance()
    expect(result.metrics).toEqual({ Nodes: 12 })
    expect(result.layout).toMatchObject({ cssContentSize: { width: 800, height: 1200 } })
  })

  it('captures a bounded trace window and cancels an active trace cleanly', async () => {
    const h = harness()
    const trace = await h.inspection.captureTraceWindow({ duration_ms: 100, max_events: 1 })
    expect(trace).toMatchObject({ observedEvents: 1, returnedEvents: 1, truncated: false })
    expect(trace.events).toEqual([
      { name: 'layout', category: 'devtools.timeline', phase: 'X', timestamp: 1,
        duration: 2, processId: undefined, threadId: undefined }
    ])

    const cancelled = harness()
    const controller = new AbortController()
    const pending = cancelled.inspection.captureTraceWindow({ duration_ms: 500 }, controller.signal)
    setTimeout(() => controller.abort(), 0)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelled.sendCommand.mock.calls.some((call) => call[1] === 'Tracing.end')).toBe(true)
  })

  it('stores one capped screenshot and returns validated annotation references', async () => {
    const h = harness()
    const args: ScreenshotAnnotationArgs = {
      annotations: [{ label: 'Submit', x: 10, y: 20, width: 30, height: 40, color: '#ff0000' }]
    }
    const result = await h.inspection.captureAnnotatedScreenshot(args)
    expect(result).toMatchObject({
      referenceId: 'browser-screenshot:tab-1:5001',
      path: 'C:\\tmp\\browser-shot.png',
      annotations: [{ id: 'annotation-1', label: 'Submit', x: 10, y: 20, width: 30, height: 40, color: '#ff0000' }]
    })
    expect(h.screenshotWriter).toHaveBeenCalledOnce()
  })

  it('fails closed while disabled or pre-cancelled', async () => {
    const h = harness()
    const disabled = new BrowserDeveloperInspection(h.adapter, () => false, h.screenshotWriter)
    await expect(disabled.inspectPerformance()).rejects.toThrow('Browser Developer Mode is disabled')

    const controller = new AbortController()
    controller.abort()
    await expect(h.inspection.inspectPerformance({}, controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    })
  })
})
