const PREFIX = 'Proof gate: untrusted completion.'

export interface ParsedProofGateNotice {
  body: string
  reason: string
  contractId?: string
  failedReceiptIds: string[]
  skippedReceiptIds: string[]
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function parseProofGateNotice(content: string): ParsedProofGateNotice | null {
  const idx = content.lastIndexOf(PREFIX)
  if (idx < 0) return null

  const before = content.slice(0, idx).trimEnd()
  const notice = content.slice(idx + PREFIX.length).trim()
  const contractMatch = notice.match(/\bcontract:\s+(\S+)/)
  const failedMatch = notice.match(/\bfailed receipts:\s+(.+?)(?:\s+skipped receipts:|$)/)
  const skippedMatch = notice.match(/\bskipped receipts:\s+(.+)$/)
  const reasonEnds = [
    contractMatch?.index,
    failedMatch?.index,
    skippedMatch?.index
  ].filter((v): v is number => typeof v === 'number')
  const reason =
    reasonEnds.length > 0 ? notice.slice(0, Math.min(...reasonEnds)).trim() : notice

  return {
    body: before,
    reason: reason || 'Proof was required but no trusted verification was found.',
    contractId: contractMatch?.[1],
    failedReceiptIds: parseIds(failedMatch?.[1]),
    skippedReceiptIds: parseIds(skippedMatch?.[1])
  }
}
