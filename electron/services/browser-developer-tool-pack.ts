import {
  browserDeveloperObserver,
  type ConsoleObservationArgs,
  type NetworkBodyArgs,
  type NetworkObservationArgs
} from './browser-developer-observer'
import { toolRegistry } from './tool-registry'
import {
  browserDeveloperInspection,
  type DomSnapshotArgs,
  type PerformanceInspectArgs,
  type RuntimeInspectArgs,
  type ScreenshotAnnotationArgs,
  type TraceWindowArgs
} from './browser-developer-inspection'

toolRegistry.registerNative(
  {
    id: 'browser_console_observe',
    name: 'browser_console_observe',
    title: 'Browser Developer: Console',
    description: 'List or clear bounded console, exception, and browser-log observations for an attached in-app browser tab. Supports stable cursors and level/source/text/navigation filters. Browser Developer Mode must be enabled.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'string', description: 'Optional browser tab id. Defaults to the active tab.' },
        action: { type: 'string', enum: ['list', 'clear'], description: 'List observations or clear the target buffer. Default list.' },
        after_cursor: { type: 'string', description: 'Opaque cursor returned by the previous page.' },
        limit: { type: 'number', description: 'Page size. Default 100, maximum 200.' },
        level: { type: 'string', enum: ['log', 'warning', 'error', 'info', 'debug'] },
        source: { type: 'string', enum: ['console', 'exception', 'log'] },
        text: { type: 'string', description: 'Case-insensitive substring filter.' },
        navigation_id: { type: 'number', description: 'Optional exact top-frame navigation generation.' }
      },
      additionalProperties: false
    },
    risks: ['read'],
    requiresApproval: false,
    enabled: true,
    lazy: true,
    parallelizable: true,
    mutates: false
  },
  async (args, context) => JSON.stringify(
    await browserDeveloperObserver.observeConsole(args as unknown as ConsoleObservationArgs, context.signal)
  )
)

toolRegistry.registerNative(
  {
    id: 'browser_dom_snapshot',
    name: 'browser_dom_snapshot',
    title: 'Browser Developer: DOM snapshot',
    description: 'Capture a bounded structured DOM or accessibility snapshot through CDP. DOM nodes are decoded into names, values, attributes, bounds, and an allowlisted set of computed styles. No page-authored code is accepted.',
    providerKind: 'native', providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'string' },
        kind: { type: 'string', enum: ['dom', 'accessibility'] },
        max_nodes: { type: 'number', description: 'Maximum returned nodes. Default 200, hard maximum 500.' },
        computed_styles: {
          type: 'array',
          items: { type: 'string', enum: ['display', 'visibility', 'position', 'width', 'height', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'overflow', 'z-index'] },
          description: 'DOM-only fixed computed-style allowlist.'
        }
      },
      additionalProperties: false
    },
    risks: ['read'], requiresApproval: false, enabled: true, lazy: true,
    parallelizable: true, mutates: false
  },
  async (args, context) => JSON.stringify(
    await browserDeveloperInspection.captureDomSnapshot(args as unknown as DomSnapshotArgs, context.signal)
  )
)

toolRegistry.registerNative(
  {
    id: 'browser_runtime_inspect',
    name: 'browser_runtime_inspect',
    title: 'Browser Developer: Runtime inspection',
    description: 'Run one fixed, side-effect-checked runtime probe: document_state, viewport, or active_element. Arbitrary expressions and user-supplied JavaScript are not accepted.',
    providerKind: 'native', providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'string' },
        kind: { type: 'string', enum: ['document_state', 'viewport', 'active_element'] }
      },
      required: ['kind'],
      additionalProperties: false
    },
    risks: ['read'], requiresApproval: false, enabled: true, lazy: true,
    parallelizable: true, mutates: false
  },
  async (args, context) => JSON.stringify(
    await browserDeveloperInspection.inspectRuntime(args as unknown as RuntimeInspectArgs, context.signal)
  )
)

toolRegistry.registerNative(
  {
    id: 'browser_performance_inspect',
    name: 'browser_performance_inspect',
    title: 'Browser Developer: Performance',
    description: 'Read a fixed allowlist of CDP performance metrics and viewport/content layout measurements. Rejects mixed evidence when the page navigates during capture.',
    providerKind: 'native', providerId: 'internal',
    inputSchema: {
      type: 'object', properties: { tab_id: { type: 'string' } }, additionalProperties: false
    },
    risks: ['read'], requiresApproval: false, enabled: true, lazy: true,
    parallelizable: true, mutates: false
  },
  async (args, context) => JSON.stringify(
    await browserDeveloperInspection.inspectPerformance(args as unknown as PerformanceInspectArgs, context.signal)
  )
)

toolRegistry.registerNative(
  {
    id: 'browser_trace_window',
    name: 'browser_trace_window',
    title: 'Browser Developer: Trace window',
    description: 'Capture a passive, bounded CDP trace window using fixed timeline/loading categories. Duration is capped at 10 seconds and output at 1,000 metadata-only events.',
    providerKind: 'native', providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'string' },
        duration_ms: { type: 'number', description: '100-10000 ms. Default 1000.' },
        max_events: { type: 'number', description: '1-1000 events. Default 300.' }
      },
      additionalProperties: false
    },
    risks: ['read'], requiresApproval: false, enabled: true, lazy: true,
    parallelizable: false, mutates: false
  },
  async (args, context) => JSON.stringify(
    await browserDeveloperInspection.captureTraceWindow(args as unknown as TraceWindowArgs, context.signal)
  )
)

toolRegistry.registerNative(
  {
    id: 'browser_screenshot_annotate',
    name: 'browser_screenshot_annotate',
    title: 'Browser Developer: Screenshot evidence',
    description: 'Capture the visible tab as a bounded PNG evidence artifact and return stable annotation references. Annotations are metadata; page content is not modified.',
    providerKind: 'native', providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'string' },
        annotations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' },
              width: { type: 'number' }, height: { type: 'number' }, color: { type: 'string' }
            },
            required: ['label', 'x', 'y'],
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    risks: ['read'], requiresApproval: false, enabled: true, lazy: true,
    parallelizable: false, mutates: false
  },
  async (args, context) => JSON.stringify(
    await browserDeveloperInspection.captureAnnotatedScreenshot(
      args as unknown as ScreenshotAnnotationArgs,
      context.signal
    )
  )
)

toolRegistry.registerNative(
  {
    id: 'browser_network_observe',
    name: 'browser_network_observe',
    title: 'Browser Developer: Network',
    description: 'List or clear bounded, redacted request/response metadata for an attached in-app browser tab. Supports stable cursors plus URL, method, status, MIME, and navigation filters. Response bodies are never included.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'string', description: 'Optional browser tab id. Defaults to the active tab.' },
        action: { type: 'string', enum: ['list', 'clear'], description: 'List observations or clear the target buffer. Default list.' },
        after_cursor: { type: 'string', description: 'Opaque cursor returned by the previous page.' },
        limit: { type: 'number', description: 'Page size. Default 100, maximum 200.' },
        url: { type: 'string', description: 'Case-insensitive redacted-URL substring filter.' },
        method: { type: 'string', description: 'Exact HTTP method filter.' },
        status_min: { type: 'number' },
        status_max: { type: 'number' },
        mime_type: { type: 'string', description: 'Case-insensitive MIME substring filter.' },
        navigation_id: { type: 'number', description: 'Optional exact top-frame navigation generation.' }
      },
      additionalProperties: false
    },
    risks: ['read', 'network'],
    requiresApproval: false,
    enabled: true,
    lazy: true,
    parallelizable: true,
    mutates: false
  },
  async (args, context) => JSON.stringify(
    await browserDeveloperObserver.observeNetwork(args as unknown as NetworkObservationArgs, context.signal)
  )
)

toolRegistry.registerNative(
  {
    id: 'browser_network_body',
    name: 'browser_network_body',
    title: 'Browser Developer: Response body',
    description: 'Read one exact text-safe response body by request id. This is opt-in, approval-gated, capped at 64 KiB, MIME-aware, and redacts credential-shaped content.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'Exact request id from browser_network_observe.' },
        tab_id: { type: 'string', description: 'Optional browser tab id. Defaults to the active tab.' },
        max_bytes: { type: 'number', description: 'Output cap in UTF-8 bytes. Default 16384, maximum 65536.' }
      },
      required: ['request_id'],
      additionalProperties: false
    },
    risks: ['read', 'network', 'secret'],
    requiresApproval: true,
    enabled: true,
    lazy: true,
    parallelizable: false,
    mutates: false
  },
  async (args, context) => JSON.stringify(
    await browserDeveloperObserver.readNetworkBody(args as unknown as NetworkBodyArgs, context.signal)
  )
)
