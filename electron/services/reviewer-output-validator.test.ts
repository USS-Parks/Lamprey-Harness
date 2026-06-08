import { describe, expect, it } from 'vitest'
import {
  buildReviewerCorrectionPrompt,
  validateReviewerOutput
} from './reviewer-output-validator'

describe('reviewer output validator', () => {
  it('rejects vague rubber-stamp reviews', () => {
    const result = validateReviewerOutput('Reviewed everything, looks good.\nSHIP')

    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('missing checked failure modes or risks')
  })

  it('accepts checked no-issue reviews with evidence', () => {
    const result = validateReviewerOutput(
      [
        'Checked failure modes: stale proof, missing waiver persistence, and UI copy drift.',
        'Evidence consulted: src/components/chat/ProofGateBanner.tsx, receipt prf_123, and the diff packet.',
        'Unchecked gaps: none.',
        'SHIP'
      ].join('\n')
    )

    expect(result).toEqual({ valid: true, verdict: 'SHIP', reasons: [] })
  })

  it('accepts changes verdicts when checked evidence is named', () => {
    const result = validateReviewerOutput(
      [
        'Checked risks: append-only contract drift.',
        'Evidence: electron/services/change-contract-store.ts:10.',
        'Finding: waiver event is missing.',
        'CHANGES'
      ].join('\n')
    )

    expect(result.valid).toBe(true)
    expect(result.verdict).toBe('CHANGES')
  })

  it('builds a correction prompt from validation reasons', () => {
    const prompt = buildReviewerCorrectionPrompt(['missing final verdict line: SHIP or CHANGES'])

    expect(prompt).toContain('previous review did not satisfy')
    expect(prompt).toContain('missing final verdict line')
    expect(prompt).toContain('SHIP or CHANGES')
  })
})
