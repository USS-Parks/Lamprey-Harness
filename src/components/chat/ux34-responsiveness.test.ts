import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const here = __dirname
const read = (name: string) => readFileSync(join(here, name), 'utf8')

describe('UX-34 measured responsiveness wiring', () => {
  it('windows the transcript instead of mounting the full history on switch', () => {
    const list = read('MessageList.tsx')
    expect(list).toContain("from '@/lib/transcript-window'")
    expect(list).toContain('initialHiddenPrefix')
    expect(list).toContain('visibleTranscriptSlice')
    expect(list).toContain('data-transcript-spacer')
    expect(list).toContain("from '@/lib/transcript-reveal'")
    expect(list).toMatch(/role === 'system'\s*\?\s*\(\s*<SystemMarker/)
  })

  it('keeps chapter jumps on the shared reveal+scroll helper', () => {
    expect(read('ChapterSidebar.tsx')).toContain("from '@/lib/transcript-reveal'")
    expect(read('ChapterQuickJumper.tsx')).toContain("from '@/lib/transcript-reveal'")
    expect(read('ChapterSidebar.tsx')).not.toContain('document.querySelector')
    expect(read('ChapterQuickJumper.tsx')).not.toContain('document.querySelector')
  })

  it('reuses the cached timestamp helper in MessageBubble', () => {
    const bubble = read('MessageBubble.tsx')
    expect(bubble).toContain('formatMessageTime')
    expect(bubble).not.toContain('toLocaleTimeString')
    expect(bubble).not.toMatch(/function formatTime\(/)
  })

  it('paints loading status before applying the fetched transcript', () => {
    const store = readFileSync(join(here, '../../stores/chat-store.ts'), 'utf8')
    expect(store).toContain("from '@/lib/renderer-paint'")
    expect(store).toContain('waitForPaint()')
  })
})
