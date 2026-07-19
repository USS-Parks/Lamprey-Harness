import { mcpManager, type McpResourceContent } from './mcp-manager'
import { toolRegistry } from './tool-registry'

interface ListArgs {
  server?: string
  cursor?: string
}

interface ReadArgs {
  server: string
  uri: string
}

interface CanonicalResourceBlock {
  type: 'resource'
  resource:
    | { uri: string; mimeType: string; text: string; _meta: { server: string } }
    | { uri: string; mimeType: string; blob: string; _meta: { server: string } }
}

interface CanonicalImageBlock {
  type: 'image' | 'audio'
  data: string
  mimeType: string
  _meta: { server: string; uri: string }
}

type CanonicalMcpContentBlock = CanonicalResourceBlock | CanonicalImageBlock

const SERVER_PROPERTY = {
  type: 'string',
  description:
    'Exact configured MCP server id. Omit on list operations to query the first page from every connected resource-capable server.'
} as const

const CURSOR_PROPERTY = {
  type: 'string',
  description:
    'Opaque cursor returned by this same server. A cursor requires server so pagination cannot cross provenance boundaries.'
} as const

function listServerIds(server?: string): string[] {
  if (server) return [server]
  return mcpManager
    .getServers()
    .filter((entry) => entry.status === 'connected')
    .filter((entry) => mcpManager.getResourceCapabilities(entry.id).supported)
    .map((entry) => entry.id)
    .sort((a, b) => a.localeCompare(b))
}

function parseListArgs(args: Record<string, unknown>): ListArgs {
  const server = typeof args.server === 'string' && args.server.length > 0 ? args.server : undefined
  const cursor = typeof args.cursor === 'string' && args.cursor.length > 0 ? args.cursor : undefined
  if (cursor && !server) throw new Error('MCP pagination cursor requires an exact server id')
  return { server, cursor }
}

function parseReadArgs(args: Record<string, unknown>): ReadArgs {
  const server = typeof args.server === 'string' ? args.server : ''
  const uri = typeof args.uri === 'string' ? args.uri : ''
  if (!server) throw new Error('MCP resource read requires server')
  if (!uri) throw new Error('MCP resource read requires uri')
  return { server, uri }
}

function validateBase64(blob: string): void {
  if (blob.length === 0 || blob.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(blob)) {
    throw new Error('MCP resource blob is not valid base64')
  }
}

export function toCanonicalMcpContentBlock(
  server: string,
  content: McpResourceContent
): CanonicalMcpContentBlock {
  if ('text' in content) {
    return {
      type: 'resource',
      resource: {
        uri: content.uri,
        mimeType: content.mimeType ?? 'text/plain',
        text: content.text,
        _meta: { server }
      }
    }
  }

  validateBase64(content.blob)
  const mimeType = content.mimeType ?? 'application/octet-stream'
  if (mimeType.toLowerCase().startsWith('image/')) {
    return {
      type: 'image',
      data: content.blob,
      mimeType,
      _meta: { server, uri: content.uri }
    }
  }
  if (mimeType.toLowerCase().startsWith('audio/')) {
    return {
      type: 'audio',
      data: content.blob,
      mimeType,
      _meta: { server, uri: content.uri }
    }
  }
  return {
    type: 'resource',
    resource: {
      uri: content.uri,
      mimeType,
      blob: content.blob,
      _meta: { server }
    }
  }
}

toolRegistry.registerNative(
  {
    id: 'list_mcp_resources',
    name: 'list_mcp_resources',
    title: 'List MCP resources',
    description:
      'List concrete resources exposed by one MCP server, or the first page from every connected resource-capable server. Results retain exact server provenance.',
    providerKind: 'native',
    providerId: 'mcp',
    inputSchema: {
      type: 'object',
      properties: { server: SERVER_PROPERTY, cursor: CURSOR_PROPERTY },
      additionalProperties: false
    },
    risks: ['read', 'network'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    lazy: true,
    mutates: false
  },
  async (args, ctx) => {
    const { server, cursor } = parseListArgs(args)
    const servers = listServerIds(server)
    const pages = await Promise.all(
      servers.map(async (serverId) => {
        const page = await mcpManager.listResources(serverId, cursor, ctx.signal)
        return {
          server: serverId,
          resources: page.items.map((resource) => ({ server: serverId, ...resource })),
          nextCursor: page.nextCursor
        }
      })
    )
    return JSON.stringify({ pages })
  }
)

toolRegistry.registerNative(
  {
    id: 'list_mcp_resource_templates',
    name: 'list_mcp_resource_templates',
    title: 'List MCP resource templates',
    description:
      'List URI templates exposed by one MCP server, or the first page from every connected resource-capable server. Results retain exact server provenance.',
    providerKind: 'native',
    providerId: 'mcp',
    inputSchema: {
      type: 'object',
      properties: { server: SERVER_PROPERTY, cursor: CURSOR_PROPERTY },
      additionalProperties: false
    },
    risks: ['read', 'network'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    lazy: true,
    mutates: false
  },
  async (args, ctx) => {
    const { server, cursor } = parseListArgs(args)
    const servers = listServerIds(server)
    const pages = await Promise.all(
      servers.map(async (serverId) => {
        const page = await mcpManager.listResourceTemplates(serverId, cursor, ctx.signal)
        return {
          server: serverId,
          resourceTemplates: page.items.map((template) => ({ server: serverId, ...template })),
          nextCursor: page.nextCursor
        }
      })
    )
    return JSON.stringify({ pages })
  }
)

toolRegistry.registerNative(
  {
    id: 'read_mcp_resource',
    name: 'read_mcp_resource',
    title: 'Read MCP resource',
    description:
      'Read one exact resource URI from one exact MCP server. Text, image, audio, and generic blobs return as canonical content blocks with server and URI provenance.',
    providerKind: 'native',
    providerId: 'mcp',
    inputSchema: {
      type: 'object',
      properties: {
        server: { ...SERVER_PROPERTY, description: 'Exact configured MCP server id.' },
        uri: { type: 'string', description: 'Exact absolute resource URI returned by that server.' }
      },
      required: ['server', 'uri'],
      additionalProperties: false
    },
    risks: ['read', 'network'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    lazy: true,
    mutates: false
  },
  async (args, ctx) => {
    const { server, uri } = parseReadArgs(args)
    const contents = await mcpManager.readResource(server, uri, ctx.signal)
    const mismatched = contents.find((content) => content.uri !== uri)
    if (mismatched) {
      throw new Error(
        `MCP server '${server}' returned '${mismatched.uri}' while reading exact URI '${uri}'`
      )
    }
    return JSON.stringify({
      server,
      uri,
      content: contents.map((content) => toCanonicalMcpContentBlock(server, content))
    })
  }
)
