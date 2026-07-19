import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  assertBrowserDeveloperUrlAllowed,
  browserDeveloperActionPolicy,
  canonicalBrowserOrigin,
  resolveBrowserDeveloperSitePolicy
} from './browser-developer-policy'

describe('BD-4 Browser Developer site and action policy', () => {
  it('canonicalizes exact HTTP(S) origins and rejects unsupported targets', () => {
    expect(canonicalBrowserOrigin('HTTPS://Example.COM:443/path?q=1')).toBe('https://example.com')
    expect(canonicalBrowserOrigin('http://localhost:5173/a')).toBe('http://localhost:5173')
    expect(canonicalBrowserOrigin('file:///c:/secret')).toBeNull()
    expect(canonicalBrowserOrigin('javascript:alert(1)')).toBeNull()
  })

  it('fails closed while disabled and treats missing policy as ask', () => {
    expect(() => resolveBrowserDeveloperSitePolicy('https://example.test', {})).toThrow(
      'Browser Developer Mode is disabled'
    )
    const settings = { browserDeveloperModeEnabled: true, browserDeveloperSitePolicies: {} }
    expect(resolveBrowserDeveloperSitePolicy('https://example.test/a', settings)).toEqual({
      origin: 'https://example.test', decision: 'ask', allowed: false
    })
    expect(() => assertBrowserDeveloperUrlAllowed('https://example.test/a', settings)).toThrow(
      'not trusted'
    )
  })

  it('enforces exact-origin allow and deny without wildcard or sibling bleed', () => {
    const settings = {
      browserDeveloperModeEnabled: true,
      browserDeveloperSitePolicies: {
        'https://example.test': 'allow',
        'https://blocked.test': 'deny'
      }
    }
    expect(assertBrowserDeveloperUrlAllowed('https://example.test/private', settings).allowed).toBe(true)
    expect(() => assertBrowserDeveloperUrlAllowed('https://blocked.test', settings)).toThrow('denied')
    expect(() => assertBrowserDeveloperUrlAllowed('https://sub.example.test', settings)).toThrow(
      'not trusted'
    )
  })

  it('maps metadata, sensitive context, and mutation onto canonical tool risks', () => {
    expect(browserDeveloperActionPolicy('metadata')).toEqual({
      action: 'metadata', risks: ['read'], requiresApproval: false
    })
    expect(browserDeveloperActionPolicy('sensitive')).toEqual({
      action: 'sensitive', risks: ['read', 'network', 'secret'], requiresApproval: true
    })
    expect(browserDeveloperActionPolicy('mutation')).toEqual({
      action: 'mutation', risks: ['write', 'network', 'destructive'], requiresApproval: true
    })
  })

  it('is wired before CDP attachment and reuses chat dangerous-call approval', () => {
    const manager = readFileSync(join(process.cwd(), 'electron/services/browser-manager.ts'), 'utf8')
    const chat = readFileSync(join(process.cwd(), 'electron/ipc/chat.ts'), 'utf8')
    const pack = readFileSync(
      join(process.cwd(), 'electron/services/browser-developer-tool-pack.ts'),
      'utf8'
    )
    const policyIndex = manager.indexOf('assertBrowserDeveloperUrlAllowed(tab.url)')
    const attachIndex = manager.indexOf('browserCdpSessions.attach(', policyIndex)
    expect(policyIndex).toBeGreaterThan(0)
    expect(attachIndex).toBeGreaterThan(policyIndex)
    expect(chat).toContain("import { inspectShellCommand } from '../services/dangerous-command-policy'")
    expect(chat).toContain('isDangerousShellCommand || isFallbackMutating')
    expect(pack).toMatch(/id: 'browser_network_body'[\s\S]*risks: \['read', 'network', 'secret'\][\s\S]*requiresApproval: true/)
  })
})
