// Stub — full implementation in Prompt 10

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

class McpManager {
  getAllTools(): { serverId: string; tools: McpTool[] }[] {
    return []
  }

  async callTool(_serverId: string, _toolName: string, _args: Record<string, unknown>): Promise<unknown> {
    throw new Error('MCP not initialized')
  }
}

export const mcpManager = new McpManager()
