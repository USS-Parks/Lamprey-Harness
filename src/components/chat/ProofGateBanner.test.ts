import { describe, expect, it } from 'vitest'
import { parseProofGateNotice } from './proof-gate-notice'

describe('parseProofGateNotice', () => {
  it('extracts proof gate details and strips the notice from the body', () => {
    const parsed = parseProofGateNotice(
      'Done.\n\nProof gate: untrusted completion. No fresh passing proof receipt after the last mutation. contract: ctr_1 failed receipts: rcpt_a, rcpt_b skipped receipts: rcpt_c'
    )

    expect(parsed).toEqual({
      body: 'Done.',
      reason: 'No fresh passing proof receipt after the last mutation.',
      contractId: 'ctr_1',
      failedReceiptIds: ['rcpt_a', 'rcpt_b'],
      skippedReceiptIds: ['rcpt_c']
    })
  })

  it('ignores ordinary assistant messages', () => {
    expect(parseProofGateNotice('No proof warning here.')).toBeNull()
  })
})
