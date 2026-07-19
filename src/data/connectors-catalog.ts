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
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: '' },
    auth: 'none',
    enabled: true,
    description:
      'Read repositories, open PRs, manage issues. Set GITHUB_TOKEN in the env block to authenticate.',
    category: 'Dev tools'
  },
  {
    id: 'postgres',
    name: 'Postgres',
    transport: 'stdio',
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-postgres',
      'postgresql://user:pass@localhost:5432/dbname'
    ],
    auth: 'none',
    enabled: true,
    description:
      'Run read-only queries against a Postgres database. Replace the placeholder connection string in args.',
    category: 'Databases'
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', './db.sqlite'],
    auth: 'none',
    enabled: true,
    description:
      'Query a SQLite database file. Replace the placeholder path in args with your `.sqlite` file.',
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
    id: 'fetch',
    name: 'HTTP Fetch',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    auth: 'none',
    enabled: true,
    description:
      'Fetch arbitrary URLs and convert them to Markdown for grounded reading.',
    category: 'Web'
  }
]
