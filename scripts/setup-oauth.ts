/**
 * CLI fallback for Google OAuth setup.
 * Usage: npx tsx scripts/setup-oauth.ts <client_id> <client_secret>
 *
 * Opens the authorization URL, starts a localhost callback server,
 * exchanges the code for tokens, and prints them for manual entry.
 */

import { createServer } from 'http'

const REDIRECT_PORT = 9876
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`
const SCOPES = 'https://mail.google.com/ https://www.googleapis.com/auth/drive'

const clientId = process.argv[2]
const clientSecret = process.argv[3]

if (!clientId || !clientSecret) {
  console.error('Usage: npx tsx scripts/setup-oauth.ts <client_id> <client_secret>')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPES)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

console.log('\n=== Lamprey Google OAuth Setup ===\n')
console.log('Open this URL in your browser:\n')
console.log(authUrl.toString())
console.log('\nWaiting for callback on localhost:' + REDIRECT_PORT + '...\n')

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h2>Authorization denied.</h2>')
    console.error('Authorization denied:', error)
    server.close()
    process.exit(1)
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Missing code')
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<h2>Lamprey connected!</h2><p>You can close this tab.</p>')

  console.log('Authorization code received. Exchanging for tokens...\n')

  try {
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
      const body = await tokenResponse.text()
      console.error(`Token exchange failed (${tokenResponse.status}):`, body)
      server.close()
      process.exit(1)
    }

    const data = (await tokenResponse.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }

    console.log('=== Tokens ===\n')
    console.log('access_token:', data.access_token)
    console.log('refresh_token:', data.refresh_token || '(not returned)')
    console.log('expires_in:', data.expires_in, 'seconds')
    console.log('\nPaste these into Lamprey settings if the in-app flow failed.')
  } catch (err: any) {
    console.error('Token exchange error:', err.message)
  }

  server.close()
})

server.listen(REDIRECT_PORT, '127.0.0.1')
