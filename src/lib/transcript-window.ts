/** First paint after a task switch shows only this many newest rows. */
export const TRANSCRIPT_TAIL = 36

/** Older rows revealed per animation frame after the destination has painted. */
export const TRANSCRIPT_REVEAL_BATCH = 48

/** Estimated height used only for the unrevealed prefix spacer. */
export const TRANSCRIPT_SPACER_PX = 72

export function initialHiddenPrefix(itemCount: number, tail = TRANSCRIPT_TAIL): number {
  if (itemCount <= tail) return 0
  return itemCount - tail
}

export function nextHiddenPrefix(hiddenPrefix: number, batch = TRANSCRIPT_REVEAL_BATCH): number {
  if (hiddenPrefix <= 0) return 0
  return Math.max(0, hiddenPrefix - batch)
}

export function visibleTranscriptSlice<T>(items: readonly T[], hiddenPrefix: number): T[] {
  if (hiddenPrefix <= 0) return items.slice()
  if (hiddenPrefix >= items.length) return []
  return items.slice(hiddenPrefix)
}

export function hiddenPrefixSpacerPx(hiddenPrefix: number, rowPx = TRANSCRIPT_SPACER_PX): number {
  if (hiddenPrefix <= 0) return 0
  return hiddenPrefix * rowPx
}
