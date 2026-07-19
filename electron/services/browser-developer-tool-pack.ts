import {
  browserDeveloperObserver,
  type ConsoleObservationArgs,
  type NetworkBodyArgs,
  type NetworkObservationArgs
} from './browser-developer-observer'
import { toolRegistry } from './tool-registry'

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
