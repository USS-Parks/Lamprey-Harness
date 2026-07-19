import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { createServer } from 'http'
import { mcpManager } from '../services/mcp-manager'
import type { McpServerConfig } from '../services/mcp-manager'
import * as keychain from '../services/keychain'
import { createOAuthSession, validateOAuthCallback } from '../services/oauth-state'
import { MCP_OAUTH_CALLBACK_PORT } from '../services/mcp-hosted-session'

export function sanitizeAddServerInput(raw: unknown): McpServerConfig | string {
  if (!raw || typeof raw !== 'object') return 'Connector config must be an object'
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id.trim() : ''
  if (!id) return 'Connector id is required (kebab-case)'
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return 'Connector id must be kebab-case (a-z, 0-9, -)'
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : id
  const transport =
    obj.transport === 'stdio' || obj.transport === 'sse' || obj.transport === 'streamable-http'
      ? obj.transport
      : null
  if (!transport) return 'transport must be "stdio", "sse", or "streamable-http"'
  const auth = obj.auth === 'google-oauth' || obj.auth === 'oauth' ? obj.auth : 'none'
  if (transport === 'stdio' && auth !== 'none') return 'stdio transport does not support hosted OAuth'
  const enabled = obj.enabled === false ? false : true
  const cfg: McpServerConfig = { id, name, transport, auth, enabled }
  if (transport === 'sse' || transport === 'streamable-http') {
    if (typeof obj.url !== 'string' || !obj.url.trim()) return 'sse transport requires a url'
    cfg.url = obj.url.trim()
  } else {
    if (typeof obj.command !== 'string' || !obj.command.trim())
      return 'stdio transport requires a command'
    cfg.command = obj.command.trim()
    if (Array.isArray(obj.args)) {
      cfg.args = obj.args.filter((a): a is string => typeof a === 'string')
    }
    if (obj.env && typeof obj.env === 'object' && !Array.isArray(obj.env)) {
      const env: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj.env as Record<string, unknown>)) {
        if (typeof v === 'string') env[k] = v
      }
      cfg.env = env
    }
  }
  return cfg
}

const REDIRECT_PORT = 9876
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`
const SCOPES = 'https://mail.google.com/ https://www.googleapis.com/auth/drive'

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:list', async () => {
    try {
      const servers = mcpManager.getServers()
      return { success: true, data: servers }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:getStatus', async (_event, id: string) => {
    try {
      const servers = mcpManager.getServers()
      const server = servers.find((s) => s.id === id)
      if (!server) return { success: false, error: `Server '${id}' not found` }
      return { success: true, data: { status: server.status, error: server.error } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:getAuthStatus', async (_event, id: string) => {
    try {
      return { success: true, data: mcpManager.getAuthStatus(id) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:listResources', async (_event, id: string, cursor?: string) => {
    try {
      return { success: true, data: await mcpManager.listResources(id, cursor) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:listResourceTemplates', async (_event, id: string, cursor?: string) => {
    try {
      return { success: true, data: await mcpManager.listResourceTemplates(id, cursor) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:readResource', async (_event, id: string, uri: string) => {
    try {
      const contents = await mcpManager.readResource(id, uri)
      if (contents.some((content) => content.uri !== uri)) {
        return { success: false, error: `MCP server '${id}' returned mismatched resource content` }
      }
      return { success: true, data: contents }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:openResource', async (_event, id: string, uri: string) => {
    try {
      const url = new URL(uri)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { success: false, error: 'Only HTTP(S) MCP resource links can open externally' }
      }
      if (url.username || url.password) {
        return { success: false, error: 'MCP resource links containing credentials are refused' }
      }
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const options = {
        type: 'question' as const,
        buttons: ['Cancel', 'Open'],
        defaultId: 0,
        cancelId: 0,
        title: 'Open MCP resource?',
        message: `Open ${url.hostname} outside Lamprey?`,
        detail: `Connector: ${id}\n${url.toString()}`
      }
      const { response } = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)
      if (response !== 1) return { success: false, error: 'Open cancelled by user.' }
      await shell.openExternal(url.toString())
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:reconnect', async (_event, id: string) => {
    try {
      await mcpManager.reconnect(id)
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:reauthorize', async (_event, id: string) => {
    try {
      const request = await mcpManager.beginHostedAuthorization(id)
      const authorizationUrl = new URL(request.authorizationUrl)
      if (authorizationUrl.protocol !== 'https:' && authorizationUrl.protocol !== 'http:') {
        return { success: false, error: 'Hosted MCP authorization URL must use HTTP(S)' }
      }
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const options = {
        type: 'warning' as const,
        buttons: ['Cancel', 'Continue'],
        defaultId: 0,
        cancelId: 0,
        title: 'Authorize hosted connector?',
        message: `Open ${authorizationUrl.hostname} to authorize "${id}"?`,
        detail:
          'The connector controls the requested permissions. Lamprey stores resulting tokens in the encrypted keychain and never sends them to the model.'
      }
      const { response } = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)
      if (response !== 1) {
        return { success: false, error: 'Hosted MCP authorization cancelled by user.' }
      }

      const callback = new Promise<{ code: string; state: string | null }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          server.close()
          reject(new Error('Hosted MCP OAuth timeout — no callback received within 5 minutes'))
        }, 5 * 60_000)
        const server = createServer((req, res) => {
          const url = new URL(req.url ?? '', `http://127.0.0.1:${MCP_OAUTH_CALLBACK_PORT}`)
          if (url.pathname !== '/mcp/oauth/callback') {
            res.writeHead(404).end()
            return
          }
          const error = url.searchParams.get('error')
          const code = url.searchParams.get('code')
          const state = url.searchParams.get('state')
          clearTimeout(timeout)
          server.close()
          if (error || !code) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>Authorization failed.</h2><p>Return to Lamprey for details.</p></body></html>')
            reject(new Error(error ? `Hosted MCP OAuth denied: ${error}` : 'OAuth callback omitted code'))
            return
          }
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><body><h2>Connector authorized.</h2><p>You can close this tab and return to Lamprey.</p></body></html>')
          resolve({ code, state })
        })
        server.listen(MCP_OAUTH_CALLBACK_PORT, '127.0.0.1', () => {
          void shell.openExternal(authorizationUrl.toString()).catch((error) => {
            clearTimeout(timeout)
            server.close()
            reject(new Error(`Failed to open hosted MCP authorization page: ${error.message}`))
          })
        })
        server.on('error', (error) => {
          clearTimeout(timeout)
          reject(new Error(`Failed to start hosted MCP OAuth callback: ${error.message}`, { cause: error }))
        })
      })

      const result = await callback
      if (result.state !== request.state) {
        return { success: false, error: 'MCP OAuth callback state mismatch' }
      }
      await mcpManager.completeHostedAuthorization(id, result)
      return { success: true, data: mcpManager.getAuthStatus(id) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Customize C6: add a fresh connector. Sanitizes user-supplied config
  // (catalog click OR JSON paste from the renderer), then delegates to
  // mcpManager.addServerIfMissing so the id-collision check + persistence
  // path stays in one place.
  ipcMain.handle('mcp:addServer', async (_event, raw: unknown) => {
    try {
      const parsed = sanitizeAddServerInput(raw)
      if (typeof parsed === 'string') {
        return { success: false, error: parsed }
      }
      // JM-20 (SEC-5) — a stdio connector spawns an arbitrary LOCAL PROCESS
      // (the `command` string is free-form and could arrive from a
      // socially-engineered JSON paste). Before this, add-server ran it with
      // no confirmation. Show the exact command line and require explicit
      // approval; the process only spawns if the user consents. SSE
      // connectors (network URL, no local exec) skip the prompt.
      if (parsed.transport === 'stdio') {
        const cmdline = [parsed.command, ...(parsed.args ?? [])].join(' ')
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const opts = {
          type: 'warning' as const,
          buttons: ['Cancel', 'Run this command'],
          defaultId: 0,
          cancelId: 0,
          title: 'Add local connector?',
          message: `"${parsed.name}" will run a local command on your machine every time it connects:`,
          detail: `${cmdline}\n\nOnly approve connectors you trust. This command runs with your account's full permissions.`
        }
        const { response } = win
          ? await dialog.showMessageBox(win, opts)
          : await dialog.showMessageBox(opts)
        if (response !== 1) {
          return { success: false, error: 'Connector not added — local command was not approved.' }
        }
      }
      const added = await mcpManager.addServerIfMissing(parsed)
      if (!added) {
        return { success: false, error: `Connector "${parsed.id}" already exists` }
      }
      return { success: true, data: parsed }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:setupGoogleOAuth', async () => {
    try {
      const clientId = keychain.getKey('google-client-id')
      const clientSecret = keychain.getKey('google-client-secret')

      if (!clientId || !clientSecret) {
        return { success: false, error: 'Google client credentials not configured. Save client_id and client_secret first.' }
      }

      // SEC-9: per-flow CSRF token. Generated here, embedded in the auth
      // URL, verified in the callback handler. Single-use: a stale or
      // replayed state is rejected, even when the random value matches.
      const session = createOAuthSession()

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('state', session.state)

      const code = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          server.close()
          reject(new Error('OAuth timeout — no callback received within 2 minutes'))
        }, 120_000)

        const server = createServer((req, res) => {
          const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`)
          // SEC-9: full decision tree (denied / missing-code / state-
          // mismatch / success) lives in `validateOAuthCallback` so it can
          // be tested without booting the http server. State verification
          // is single-use; a successful match consumes the session.
          const outcome = validateOAuthCallback(url, session)

          if (outcome.kind === 'denied') {
            res.writeHead(outcome.httpStatus, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>Authorization denied.</h2><p>You can close this tab.</p></body></html>')
            clearTimeout(timeout)
            server.close()
            reject(new Error(`OAuth denied: ${outcome.reason}`))
            return
          }

          if (outcome.kind === 'state-mismatch') {
            res.writeHead(outcome.httpStatus, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>OAuth state mismatch.</h2><p>Close this tab and start the flow again from Lamprey.</p></body></html>')
            clearTimeout(timeout)
            server.close()
            reject(new Error(outcome.reason))
            return
          }

          if (outcome.kind === 'missing-code') {
            res.writeHead(outcome.httpStatus, { 'Content-Type': 'text/plain' })
            res.end(outcome.reason)
            return
          }

          // outcome.kind === 'success'
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><body><h2>Lamprey connected!</h2><p>You can close this tab and return to the app.</p></body></html>')
          clearTimeout(timeout)
          server.close()
          resolve(outcome.code)
        })

        server.listen(REDIRECT_PORT, '127.0.0.1', () => {
          shell.openExternal(authUrl.toString())
        })

        server.on('error', (err) => {
          clearTimeout(timeout)
          reject(new Error(`Failed to start OAuth server: ${err.message}`, { cause: err }))
        })
      })

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      })

      if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text()
        return { success: false, error: `Token exchange failed (${tokenResponse.status}): ${errorBody}` }
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string
        refresh_token?: string
        expires_in: number
      }

      keychain.setKey('google-access-token', tokenData.access_token)
      if (tokenData.refresh_token) {
        keychain.setKey('google-refresh-token', tokenData.refresh_token)
      }
      keychain.setKey('google-token-expiry', String(Date.now() + tokenData.expires_in * 1000))

      console.log('[oauth] Tokens stored. Connecting Google MCP servers...')

      const connectResults: string[] = []
      for (const id of ['gmail', 'drive']) {
        try {
          await mcpManager.reconnect(id)
          connectResults.push(`${id}: connected`)
        } catch (err: any) {
          connectResults.push(`${id}: ${err.message}`)
        }
      }

      console.log('[oauth] Connection results:', connectResults.join(', '))
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // mcp:approveToolCall is registered in chat.ts (handles confirmation flow)
}
