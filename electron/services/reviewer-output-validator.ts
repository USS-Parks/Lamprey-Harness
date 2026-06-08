export type ReviewerVerdict = 'SHIP' | 'CHANGES'

export interface ReviewerValidationResult {
  valid: boolean
  verdict?: ReviewerVerdict
  reasons: string[]
}

const VERDICT_RE = /(?:^|\n)\s*(SHIP|CHANGES)\s*(?:\n|$)/i
const CHECKED_RE = /\b(checked|failure mode|failure modes|risk|risks|regression|edge case)\b/i
const EVIDENCE_RE =
  /\b(evidence|consulted|file|files|receipt|receipts|diff|contract|tool|tools|prf_[a-z0-9_-]+|[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+(?::\d+)?)\b/i
const VAGUE_SHIP_RE = /\b(looks good|reviewed everything|seems fine|no issues)\b/i

export function validateReviewerOutput(output: string): ReviewerValidationResult {
  const text = String(output ?? '').trim()
  const reasons: string[] = []
  const verdictMatch = text.match(VERDICT_RE)
  const verdict = verdictMatch?.[1]?.toUpperCase() as ReviewerVerdict | undefined

  if (!verdict) {
    reasons.push('missing final verdict line: SHIP or CHANGES')
  }
  if (!CHECKED_RE.test(text)) {
    reasons.push('missing checked failure modes or risks')
  }
  if (!EVIDENCE_RE.test(text)) {
    reasons.push('missing evidence references: files, receipts, diff, contract, or tool metadata')
  }
  if (verdict === 'SHIP' && VAGUE_SHIP_RE.test(text) && !CHECKED_RE.test(text)) {
    reasons.push('vague no-issues review is not enough for SHIP')
  }

  return {
    valid: reasons.length === 0,
    verdict,
    reasons
  }
}

export function buildReviewerCorrectionPrompt(reasons: string[]): string {
  return [
    'Your previous review did not satisfy the reviewer contract.',
    `Fix these validation gaps: ${reasons.join('; ')}.`,
    'Return a corrected review that lists checked failure modes or risks, names the evidence consulted, notes unchecked gaps when any remain, and ends with exactly one verdict line: SHIP or CHANGES.'
  ].join('\n')
}
