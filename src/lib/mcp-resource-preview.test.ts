import { describe, expect, it } from 'vitest'
import { canOpenMcpResourceExternally, classifyMcpResourceContent } from './mcp-resource-preview'

describe('MR-4 MCP resource preview policy', () => {
  it('renders text as escaped React text and allows only known raster images', () => {
    expect(
      classifyMcpResourceContent({ uri: 'notes://one', mimeType: 'text/html', text: '<script>x</script>' })
    ).toMatchObject({ kind: 'text', text: '<script>x</script>' })
    expect(
      classifyMcpResourceContent({ uri: 'image://one', mimeType: 'image/png', blob: 'aGVsbG8=' })
    ).toMatchObject({ kind: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=' })
    expect(
      classifyMcpResourceContent({ uri: 'image://two', mimeType: 'image/svg+xml', blob: 'PHN2Zz4=' })
    ).toMatchObject({ kind: 'metadata', mimeType: 'image/svg+xml' })
  })

  it('permits only credential-free HTTP(S) external resources', () => {
    expect(canOpenMcpResourceExternally('https://example.com/resource')).toBe(true)
    expect(canOpenMcpResourceExternally('http://example.com/resource')).toBe(true)
    expect(canOpenMcpResourceExternally('https://token@example.com/resource')).toBe(false)
    expect(canOpenMcpResourceExternally('file:///secret')).toBe(false)
    expect(canOpenMcpResourceExternally('not a uri')).toBe(false)
  })
})
