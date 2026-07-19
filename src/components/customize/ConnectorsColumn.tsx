import { useEffect, useMemo, useState } from 'react'
import type { McpServerConfig } from '@/lib/types'
import { useMcpStore } from '@/stores/mcp-store'
import { toast } from '@/stores/toast-store'
import { ensurePlaintextConsentIfNeeded } from '@/lib/keychain-consent'
import {
  canOpenMcpResourceExternally,
  classifyMcpResourceContent
} from '@/lib/mcp-resource-preview'
import { AddConnectorFlow } from './AddConnectorFlow'

type ServerWithStatus = McpServerConfig & { error?: string }

function statusBadge(server: ServerWithStatus): { dotClass: string; label: string; sub?: string } {
  switch (server.status) {
    case 'connected':
      return { dotClass: 'bg-[var(--success)]', label: 'Connected' }
    case 'connecting':
      return { dotClass: 'bg-[var(--warning)] animate-pulse', label: 'Connecting' }
    case 'error':
      return { dotClass: 'bg-[var(--error)]', label: 'Error', sub: server.error }
    default:
      return { dotClass: 'bg-[var(--text-muted)]', label: 'Disconnected' }
  }
}

function authBadge(server: McpServerConfig): { label: string; className: string } | null {
  if (server.auth === 'none') return null
  const className =
    server.authStatus === 'connected'
      ? 'text-[var(--success)]'
      : server.authStatus === 'error' || server.authStatus === 'expired'
        ? 'text-[var(--error)]'
        : 'text-[var(--accent)]'
  return { label: `${server.auth}: ${server.authStatus}`, className }
}

function ResourcePreview() {
  const preview = useMcpStore((state) => state.preview)
  const closePreview = useMcpStore((state) => state.closePreview)
  if (!preview) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="flex max-h-[75vh] w-[680px] flex-col overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--bg-secondary)] shadow-2xl">
        <header className="flex items-center gap-2 border-b border-[var(--panel-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">Resource preview</div>
            <div className="truncate font-mono text-[10px] text-[var(--text-muted)]">{preview.uri}</div>
          </div>
          <button onClick={closePreview} className="rounded px-2 py-1 text-[12px] hover:bg-[var(--bg-tertiary)]">Close</button>
        </header>
        <div className="space-y-3 overflow-y-auto p-4">
          {preview.loading && <p className="text-[12px] text-[var(--text-muted)]">Loading preview…</p>}
          {preview.error && <p className="text-[12px] text-[var(--error)]">{preview.error}</p>}
          {preview.contents.map((content, index) => {
            const item = classifyMcpResourceContent(content)
            if (item.kind === 'text') {
              return (
                <pre key={index} className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg-primary)] p-3 font-mono text-[11px] text-[var(--text-primary)]">
                  {item.text}
                </pre>
              )
            }
            if (item.kind === 'image') {
              return <img key={index} src={item.dataUrl} alt="MCP resource preview" className="max-h-96 max-w-full rounded object-contain" />
            }
            return (
              <div key={index} className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3 text-[11px] text-[var(--text-secondary)]">
                Binary content is not rendered. {item.mimeType}; approximately {item.byteEstimate ?? 0} bytes.
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface GoogleOAuthPanelProps {
  onComplete: () => Promise<void>
}

function GoogleOAuthPanel({ onComplete }: GoogleOAuthPanelProps) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const onSaveCreds = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return
    const consent = await ensurePlaintextConsentIfNeeded()
    if (!consent) return
    setSaving(true)
    try {
      const result = await window.api.settings.saveGoogleCredentials(clientId.trim(), clientSecret.trim())
      if (result.success) {
        toast.success('Google credentials saved')
        setStatus('Credentials saved. Click Connect to authorize.')
      } else toast.error(`Failed to save credentials: ${result.error}`)
    } finally {
      setSaving(false)
    }
  }

  const onAuthorize = async () => {
    const consent = await ensurePlaintextConsentIfNeeded()
    if (!consent) {
      toast.error('Google connect cancelled — plaintext storage not authorised.')
      return
    }
    setOauthBusy(true)
    setStatus(null)
    try {
      const result = await window.api.mcp.setupGoogleOAuth()
      if (result.success) {
        setStatus('Connected.')
        toast.success('Google account connected')
        await onComplete()
      } else {
        setStatus(`Error: ${result.error}`)
        toast.error(`Google OAuth failed: ${result.error}`)
      }
    } catch (error) {
      setStatus('OAuth flow failed')
      toast.error(`OAuth flow failed: ${(error as Error).message ?? 'unknown error'}`)
    } finally {
      setOauthBusy(false)
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--panel-border)] bg-[var(--bg-tertiary)]/30 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Google OAuth</span>
        <span className="text-[11px] text-[var(--text-secondary)]">Required for Gmail / Drive connectors.</span>
      </div>
      <input type="password" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="client_id" className="w-full rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
      <input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="client_secret" className="w-full rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
      <div className="flex items-center gap-2">
        <button onClick={() => void onSaveCreds()} disabled={saving || !clientId.trim() || !clientSecret.trim()} className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] hover:border-[var(--accent)] disabled:opacity-50">Save credentials</button>
        <button onClick={() => void onAuthorize()} disabled={oauthBusy} className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-[11px] text-white hover:opacity-90 disabled:opacity-50">{oauthBusy ? 'Waiting…' : 'Connect Google'}</button>
      </div>
      {status && <p className={`text-[11px] ${status.startsWith('Error') ? 'text-[var(--error)]' : 'text-[var(--text-secondary)]'}`}>{status}</p>}
    </div>
  )
}

export function ConnectorsColumn() {
  const servers = useMcpStore((state) => state.servers)
  const inventories = useMcpStore((state) => state.inventories)
  const latestElicitation = useMcpStore((state) => state.latestElicitation)
  const loadServers = useMcpStore((state) => state.loadServers)
  const reconnect = useMcpStore((state) => state.reconnect)
  const reauthorize = useMcpStore((state) => state.reauthorize)
  const loadInventory = useMcpStore((state) => state.loadInventory)
  const loadMoreResources = useMcpStore((state) => state.loadMoreResources)
  const loadMoreTemplates = useMcpStore((state) => state.loadMoreTemplates)
  const readResource = useMcpStore((state) => state.readResource)
  const [filter, setFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [expandedServer, setExpandedServer] = useState<string | null>(null)

  useEffect(() => void loadServers(), [loadServers])

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return servers
    return servers.filter((server) => server.name.toLowerCase().includes(query) || server.id.toLowerCase().includes(query))
  }, [servers, filter])

  const toggleResources = async (serverId: string) => {
    if (expandedServer === serverId) {
      setExpandedServer(null)
      return
    }
    setExpandedServer(serverId)
    await loadInventory(serverId)
  }

  const onReauthorize = async (serverId: string) => {
    const result = await reauthorize(serverId)
    if (result.success) toast.success('Connector authorization completed')
    else toast.error(result.error ?? 'Connector authorization failed')
  }

  const onOpenResource = async (serverId: string, uri: string) => {
    const result = await window.api.mcp.openResource(serverId, uri)
    if (!result.success && result.error !== 'Open cancelled by user.') toast.error(result.error)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--panel-border)] px-3 py-2">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${servers.length} connector${servers.length === 1 ? '' : 's'}…`} className="min-w-0 flex-1 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
        <button onClick={() => setAddOpen(true)} className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 text-[12px] hover:border-[var(--accent)]" title="Add a connector">+ Add</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">{servers.length === 0 ? 'No connectors configured yet.' : 'No connectors match this filter.'}</div>}
        {filtered.map((server) => {
          const badge = statusBadge(server)
          const auth = authBadge(server)
          const inventory = inventories[server.id]
          const elicitation = latestElicitation[server.id]
          return (
            <div key={server.id} className="group mb-1 rounded border border-transparent p-2 hover:border-[var(--panel-border)] hover:bg-[var(--bg-tertiary)]">
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${badge.dotClass}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{server.name}</span>
                    <span className="rounded bg-[var(--bg-tertiary)] px-1 font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{server.transport}</span>
                    {auth && <span className={`rounded bg-[var(--bg-tertiary)] px-1 font-mono text-[9px] uppercase tracking-wider ${auth.className}`}>{auth.label}</span>}
                    {server.pluginId && <span className="rounded bg-[var(--bg-tertiary)] px-1 font-mono text-[9px] uppercase tracking-wider text-[var(--accent)]" title={`From plugin: ${server.pluginId}`}>plugin: {server.pluginId}</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{badge.label}{badge.sub ? ` — ${badge.sub}` : ''}</div>
                  {server.authError && <div className="mt-0.5 text-[10px] text-[var(--error)]">{server.authError}</div>}
                  {elicitation && <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">Consent: {elicitation.status}{elicitation.domain ? ` (${elicitation.domain})` : ''}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {server.auth === 'oauth' && <button onClick={() => void onReauthorize(server.id)} disabled={server.authStatus === 'authorizing'} className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] hover:border-[var(--accent)] disabled:opacity-50">Reauthorize</button>}
                  <button onClick={() => void reconnect(server.id)} disabled={server.status === 'connecting'} className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] hover:border-[var(--accent)] disabled:opacity-50">Reconnect</button>
                  {server.status === 'connected' && <button onClick={() => void toggleResources(server.id)} className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] hover:border-[var(--accent)]">{expandedServer === server.id ? 'Hide' : 'Resources'}</button>}
                </div>
              </div>
              {expandedServer === server.id && (
                <div className="ml-4 mt-2 space-y-2 border-t border-[var(--panel-border)] pt-2">
                  {inventory?.loading && <p className="text-[11px] text-[var(--text-muted)]">Loading resources and templates…</p>}
                  {inventory?.error && <p className="text-[11px] text-[var(--error)]">{inventory.error}</p>}
                  {inventory && !inventory.loading && inventory.resources.length === 0 && inventory.resourceTemplates.length === 0 && !inventory.error && <p className="text-[11px] text-[var(--text-muted)]">This connector exposes no resources or templates.</p>}
                  {inventory?.resources.map((resource) => (
                    <div key={resource.uri} className="flex items-start gap-2 rounded bg-[var(--bg-primary)] p-2">
                      <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium">{resource.title ?? resource.name}</div><div className="truncate font-mono text-[9px] text-[var(--text-muted)]">{resource.uri}</div></div>
                      <button onClick={() => void readResource(server.id, resource.uri)} className="rounded border border-[var(--panel-border)] px-2 py-0.5 text-[10px] hover:border-[var(--accent)]">Preview</button>
                      {canOpenMcpResourceExternally(resource.uri) && <button onClick={() => void onOpenResource(server.id, resource.uri)} className="rounded border border-[var(--panel-border)] px-2 py-0.5 text-[10px] hover:border-[var(--accent)]">Open</button>}
                    </div>
                  ))}
                  {inventory?.nextResourceCursor && <button onClick={() => void loadMoreResources(server.id)} className="text-[10px] text-[var(--accent)] hover:underline">Load more resources</button>}
                  {inventory && inventory.resourceTemplates.length > 0 && <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Templates</div>}
                  {inventory?.resourceTemplates.map((template) => <div key={template.uriTemplate} className="rounded bg-[var(--bg-primary)] p-2"><div className="text-[11px] font-medium">{template.title ?? template.name}</div><div className="break-all font-mono text-[9px] text-[var(--text-muted)]">{template.uriTemplate}</div></div>)}
                  {inventory?.nextTemplateCursor && <button onClick={() => void loadMoreTemplates(server.id)} className="text-[10px] text-[var(--accent)] hover:underline">Load more templates</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {servers.some((server) => server.auth === 'google-oauth') && <GoogleOAuthPanel onComplete={loadServers} />}
      {addOpen && <AddConnectorFlow onClose={() => setAddOpen(false)} />}
      <ResourcePreview />
    </div>
  )
}
