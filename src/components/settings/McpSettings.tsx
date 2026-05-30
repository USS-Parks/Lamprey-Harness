import { useState } from 'react'
import { useMcpStore } from '@/stores/mcp-store'

export function McpSettings() {
  const servers = useMcpStore((s) => s.servers)
  const reconnect = useMcpStore((s) => s.reconnect)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [oauthStatus, setOauthStatus] = useState<string | null>(null)

  const handleGoogleOAuth = async () => {
    setOauthLoading(true)
    setOauthStatus(null)
    try {
      const result = await window.api.mcp.setupGoogleOAuth()
      if (result.success) {
        setOauthStatus('Connected successfully')
      } else {
        setOauthStatus(`Error: ${result.error}`)
      }
    } catch {
      setOauthStatus('OAuth flow failed')
    }
    setOauthLoading(false)
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-[var(--success)]'
      case 'connecting': return 'text-[var(--warning)]'
      case 'error': return 'text-[var(--error)]'
      default: return 'text-[var(--text-muted)]'
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)]">MCP Servers</h3>

      <div className="space-y-2">
        {servers.map((server) => (
          <div
            key={server.id}
            className="flex items-center gap-3 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3"
          >
            <span className={`inline-block h-2 w-2 rounded-full ${
              server.status === 'connected' ? 'bg-[var(--success)]' :
              server.status === 'connecting' ? 'bg-[var(--warning)] animate-pulse' :
              server.status === 'error' ? 'bg-[var(--error)]' :
              'bg-[var(--text-muted)]'
            }`} />

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-[var(--text-primary)]">
                  {server.name}
                </span>
                <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] uppercase">
                  {server.transport}
                </span>
              </div>
              <span className={`font-mono text-[11px] capitalize ${statusColor(server.status)}`}>
                {server.status}
                {server.error && ` — ${server.error}`}
              </span>
            </div>

            <button
              onClick={() => reconnect(server.id)}
              disabled={server.status === 'connecting'}
              className="rounded bg-[var(--bg-tertiary)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              Reconnect
            </button>
          </div>
        ))}

        {servers.length === 0 && (
          <p className="font-mono text-xs text-[var(--text-muted)]">No MCP servers configured.</p>
        )}
      </div>

      {servers.some((s) => s.auth === 'google-oauth') && (
        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <h4 className="font-mono text-xs font-semibold text-[var(--text-primary)]">Google Account</h4>
          <p className="font-mono text-[11px] text-[var(--text-secondary)]">
            Connect your Google account to enable Gmail and Drive MCP servers.
          </p>
          <button
            onClick={handleGoogleOAuth}
            disabled={oauthLoading}
            className="rounded bg-[var(--accent-dim)] px-3 py-1.5 font-mono text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
          >
            {oauthLoading ? 'Connecting...' : 'Connect Google Account'}
          </button>
          {oauthStatus && (
            <p className={`font-mono text-[11px] ${oauthStatus.startsWith('Error') ? 'text-[var(--error)]' : 'text-[var(--success)]'}`}>
              {oauthStatus}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
