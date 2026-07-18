import { describe, expect, it } from 'vitest'
import { diffContainsLine } from './pr-review-flow'

describe('PR-3 review line mapping', () => {
  const patch = '@@ -10,3 +10,4 @@ context\n old\n+new\n same\n@@ -30 +31,2 @@ later\n-old\n+new'

  it('maps old and new side ranges from unified diff headers', () => {
    expect(diffContainsLine(patch, 10, 'LEFT')).toBe(true)
    expect(diffContainsLine(patch, 12, 'LEFT')).toBe(true)
    expect(diffContainsLine(patch, 13, 'LEFT')).toBe(false)
    expect(diffContainsLine(patch, 13, 'RIGHT')).toBe(true)
    expect(diffContainsLine(patch, 31, 'RIGHT')).toBe(true)
    expect(diffContainsLine(patch, 32, 'RIGHT')).toBe(true)
  })

  it('rejects invalid and out-of-range anchors', () => {
    expect(diffContainsLine(patch, 0, 'RIGHT')).toBe(false)
    expect(diffContainsLine(patch, 999, 'LEFT')).toBe(false)
  })
})
