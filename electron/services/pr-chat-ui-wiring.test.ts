import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('PR-5 PR Chat renderer wiring', () => {
  it('keeps the existing PR panel and adds bound chat plus selected-hunk sends', () => {
    const panel = read('src/components/github/PullRequestsPanel.tsx')
    const diff = read('src/components/github/PRDiffView.tsx')
    expect(panel).toContain('Chat about this PR')
    expect(panel).toContain('bindPullRequest')
    expect(panel).toContain('sendMessage')
    expect(panel).toContain('onSendHunk')
    expect(diff).toContain('Send hunk')
    expect(diff).toContain('getPullRequestFiles')
  })

  it('keeps annotations, check progress, and review-submit confirmation visible', () => {
    const panel = read('src/components/github/PullRequestsPanel.tsx')
    const checks = read('src/components/github/PRStatusChecks.tsx')
    const composer = read('src/components/github/InlineCommentComposer.tsx')
    expect(panel).toContain('<PRStatusChecks')
    expect(panel).toContain('Review comments')
    expect(panel).toContain('<InlineCommentComposer')
    expect(checks).toContain('setInterval')
    expect(composer).toContain("toast.success('Review posted.')")
  })

  it('renders editable patch cards with send-edit, reject, and explicit accept actions', () => {
    const card = read('src/components/chat/PrPatchCard.tsx')
    const toolCard = read('src/components/chat/ToolUseCard.tsx')
    expect(toolCard).toContain('<PrPatchCard')
    expect(card).toContain('Patch proposal')
    expect(card).toContain('Send edit')
    expect(card).toContain('Reject')
    expect(card).toContain('Accept…')
  })
})
