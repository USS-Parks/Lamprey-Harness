type Listener = () => void

const listeners = new Set<Listener>()

export function onRevealTranscript(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function revealTranscript(): void {
  for (const listener of listeners) listener()
}

export function scrollToChapter(chapterId: string): void {
  revealTranscript()
  const jump = () => {
    if (typeof document === 'undefined') return
    const el = document.querySelector(`[data-chapter-id="${chapterId}"]`)
    if (el instanceof HTMLElement) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const raf = globalThis.requestAnimationFrame
  if (typeof raf !== 'function') {
    jump()
    return
  }
  raf(() => raf(jump))
}
