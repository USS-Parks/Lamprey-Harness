// Reasoning Audit Phase R6 — the cumulative per-round reasoning trail.
//
// UB-5 (Unburdening Phase, 2026-06-10): extracted from
// `final-response-composer.ts` when the composer was excised. The trail is
// NOT composer machinery — it is the reasoning-audit guarantee (R6, user-
// directed) that a multi-round tool turn persists EVERY round's
// chain-of-thought into the saved row, not just the last round's. The
// optional trailing segment (formerly the composer's own CoT, labelled
// `--- composer ---`) is kept for historical-format compatibility; new
// callers pass `undefined`.

export const MAX_REASONING_BYTES = 65_536

/** Build the cumulative per-round reasoning trail. Format:
 *
 *    --- round 1 ---
 *    <round 1's chain-of-thought>
 *
 *    --- round 2 ---
 *    <round 2's chain-of-thought>
 *
 *  Empty round entries are skipped (filtered BEFORE numbering, so "round N"
 *  tracks the surviving rounds — not the absolute round index). Returns
 *  `undefined` when no reasoning exists at all so the saved row's
 *  `reasoning` column stays NULL instead of holding the empty string.
 *
 *  Over-cap behavior: truncate at MAX_REASONING_BYTES and append the honest
 *  `[truncated for length — N kb omitted]` marker (Invariant §2.2). */
export function concatReasoningTrail(
  roundReasonings: Array<string | undefined>,
  composerReasoning: string | undefined
): string | undefined {
  const rounds = roundReasonings
    .map((r) => (typeof r === 'string' ? r.trim() : ''))
    .filter((r) => r.length > 0)
  const composer =
    typeof composerReasoning === 'string' && composerReasoning.trim().length > 0
      ? composerReasoning.trim()
      : undefined
  if (rounds.length === 0 && !composer) return undefined
  const parts: string[] = []
  for (let i = 0; i < rounds.length; i++) {
    parts.push(`--- round ${i + 1} ---\n${rounds[i]}`)
  }
  if (composer) parts.push(`--- composer ---\n${composer}`)
  const joined = parts.join('\n\n')
  if (Buffer.byteLength(joined, 'utf8') <= MAX_REASONING_BYTES) return joined
  // Truncate to MAX_REASONING_BYTES bytes, leaving room for the marker.
  // JM-12 (CC-10): the cut is BYTE-true. The old `.slice(charCount)` kept up
  // to ~3× the cap for CJK trails (3 bytes/char) and could split a surrogate
  // pair, persisting a lone surrogate into the DB row.
  const marker = (kb: number): string => `\n\n[truncated for length — ${kb} kb omitted]`
  const reserve = marker(9999).length + 8 // generous reserve for the marker tail
  const capBytes = Math.max(0, MAX_REASONING_BYTES - reserve)
  let head = Buffer.from(joined, 'utf8').subarray(0, capBytes).toString('utf8')
  // A cut mid-codepoint decodes as a trailing U+FFFD — drop it (only the
  // cut-induced tail one; interior replacement chars are the text's own).
  head = head.replace(/�+$/, '')
  const omittedBytes = Buffer.byteLength(joined, 'utf8') - Buffer.byteLength(head, 'utf8')
  const omittedKb = Math.round(omittedBytes / 1024)
  return head + marker(omittedKb)
}
