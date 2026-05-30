import { ipcMain, shell } from 'electron'
import { createServer } from 'http'
import { mcpManager } from '../services/mcp-manager'
import * as keychain from '../services/keychain'

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

  ipcMain.handle('mcp:reconnect', async (_event, id: string) => {
    try {
      await mcpManager.reconnect(id)
      return { success: true, data: null }
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

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')

      const code = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          server.close()
          reject(new Error('OAuth timeout — no callback received within 2 minutes'))
        }, 120_000)

        const server = createServer((req, res) => {
          const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`)
          const authCode = url.searchParams.get('code')
          const error = url.searchParams.get('error')

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>Authorization denied.</h2><p>You can close this tab.</p></body></html>')
            clearTimeout(timeout)
            server.close()
            reject(new Error(`OAuth denied: ${error}`))
            return
          }

          if (authCode) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>Lamprey connected!</h2><p>You can close this tab and return to the app.</p></body></html>')
            clearTimeout(timeout)
            server.close()
            resolve(authCode)
            return
          }

          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing authorization code')
        })

        server.listen(REDIRECT_PORT, '127.0.0.1', () => {
          shell.openExternal(authUrl.toString())
        })

        server.on('error', (err) => {
          clearTimeout(timeout)
          reject(new Error(`Failed to start OAuth server: ${err.message}`))
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
