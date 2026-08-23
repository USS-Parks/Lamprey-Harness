// Customize C6: bundled connector catalog rendered by AddConnectorFlow.
// Mirrors `resources/connectors/catalog.json` (the on-disk source of
// truth installers can copy verbatim) — keeping both is intentional so
// the renderer ships a typed module and the on-disk file can be edited
// without a rebuild.
import type { McpServerConfig } from '@/lib/types'

export interface CatalogEntry extends Omit<McpServerConfig, 'status' | 'authStatus' | 'authError'> {
  env?: Record<string, string>
  description: string
  category: string
}

export const CONNECTORS_CATALOG: CatalogEntry[] = [
  {
    id: 'playwright',
    name: 'Playwright Browser',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    auth: 'none',
    enabled: true,
    description:
      'Headless Chromium driving via Playwright. Lets the agent navigate URLs, click elements, and snapshot pages.',
    category: 'Browser'
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './'],
    auth: 'none',
    enabled: true,
    description:
      'Read + write files inside the current workspace. Defaults to the project root; pass an explicit directory in args to scope it.',
    category: 'Files'
  },
  {
    id: 'github',
    name: 'GitHub',
    transport: 'stdio',
    command: 'docker',
    args: [
      'run',
      '-i',
      '--rm',
      '-e',
      'GITHUB_PERSONAL_ACCESS_TOKEN',
      'ghcr.io/github/github-mcp-server'
    ],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    auth: 'none',
    enabled: true,
    description:
      'Official GitHub MCP server (Docker). Requires Docker. Set GITHUB_PERSONAL_ACCESS_TOKEN in the env block. Replaces the deprecated @modelcontextprotocol/server-github npm package.',
    category: 'Dev tools'
  },
  {
    id: 'postgres',
    name: 'Postgres',
    transport: 'stdio',
    command: 'npx',
    args: [
      '-y',
      '@bytebase/dbhub',
      '--transport',
      'stdio',
      '--dsn',
      'postgres://user:pass@localhost:5432/dbname'
    ],
    auth: 'none',
    enabled: true,
    description:
      'Read queries against Postgres via Bytebase DBHub. Replace the placeholder DSN. Replaces the deprecated @modelcontextprotocol/server-postgres package.',
    category: 'Databases'
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-server-sqlite-npx', './db.sqlite'],
    auth: 'none',
    enabled: true,
    description:
      'Query a SQLite database file. Replace the placeholder path. Replaces the unpublished @modelcontextprotocol/server-sqlite package.',
    category: 'Databases'
  },
  {
    id: 'memory',
    name: 'Knowledge Graph Memory',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    auth: 'none',
    enabled: true,
    description:
      'Persistent knowledge-graph memory the agent can write to and recall from across turns.',
    category: 'Knowledge'
  },
  {
    id: 'linear',
    name: 'Linear',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
    auth: 'none',
    enabled: true,
    description:
      'Official Linear MCP (remote) via mcp-remote. Completes OAuth on first run. Issues, projects, and comments.',
    category: 'Project'
  },
  {
    id: 'sentry',
    name: 'Sentry',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@sentry/mcp-server'],
    env: { SENTRY_ACCESS_TOKEN: '' },
    auth: 'none',
    enabled: true,
    description:
      'Official Sentry MCP. Set SENTRY_ACCESS_TOKEN (user auth token). Optional SENTRY_HOST for self-hosted.',
    category: 'Observability'
  },
  {
    id: 'notion',
    name: 'Notion',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: { NOTION_TOKEN: '' },
    auth: 'none',
    enabled: true,
    description:
      'Official Notion API MCP. Set NOTION_TOKEN to an internal integration token (ntn_…). Connect pages to the integration in Notion.',
    category: 'Knowledge'
  },
  {
    id: 'slack',
    name: 'Slack',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'slack-mcp-server', '--transport', 'stdio'],
    env: { SLACK_MCP_XOXP_TOKEN: '' },
    auth: 'none',
    enabled: true,
    description:
      'Community Slack MCP (korotovsky). Set SLACK_MCP_XOXP_TOKEN to a user OAuth token. Official mcp.slack.com needs a partner Slack app, so it is not the one-click template.',
    category: 'Chat'
  }
]
