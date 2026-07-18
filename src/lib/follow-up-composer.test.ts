import { describe, expect, it } from 'vitest'
import { buildCanonicalFollowUpInput } from './follow-up-composer'
import type { ProcessedFile } from './types'

function file(overrides: Partial<ProcessedFile>): ProcessedFile {
  return {
    name: 'file.txt',
    kind: 'text',
    mimeType: 'text/plain',
    size: 4,
    content: 'body',
    previewText: 'body',
    ...overrides
  }
}

describe('ST-9 follow-up composer input parity', () => {
  it('preserves text, image, attachment-text, and local-image order with metadata', () => {
    expect(
      buildCanonicalFollowUpInput('first', [
        file({
          name: 'remote.png',
          kind: 'image',
          mimeType: 'image/png',
          size: 12,
          content: 'data:image/png;base64,AA=='
        }),
        file({ name: 'notes.md', content: 'second' }),
        file({
          name: 'local.jpg',
          kind: 'image',
          mimeType: 'image/jpeg',
          size: 34,
          content: 'data:image/jpeg;base64,BB==',
          sourcePath: 'C:\\workspace\\local.jpg'
        })
      ])
    ).toEqual([
      { type: 'text', text: 'first' },
      {
        type: 'image',
        imageUrl: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
        name: 'remote.png',
        sizeBytes: 12
      },
      { type: 'text', text: '[Attachment notes.md]\n```md\nsecond\n```' },
      {
        type: 'localImage',
        path: 'C:\\workspace\\local.jpg',
        mimeType: 'image/jpeg',
        name: 'local.jpg',
        sizeBytes: 34
      }
    ])
  })

  it('supports attachment-only follow-ups and rejects unreadable input before IPC', () => {
    expect(
      buildCanonicalFollowUpInput('', [
        file({
          name: 'only.png',
          kind: 'image',
          mimeType: 'image/png',
          content: 'data:image/png;base64,AA=='
        })
      ])
    ).toHaveLength(1)
    expect(() => buildCanonicalFollowUpInput('text', [file({ error: 'unreadable' })])).toThrow(
      'file.txt: unreadable'
    )
  })
})
