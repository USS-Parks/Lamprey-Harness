/** Yield two animation frames so a loading status can paint before heavy work. */
export function waitForPaint(): Promise<void> {
  const raf = globalThis.requestAnimationFrame
  if (typeof raf !== 'function') return Promise.resolve()
  return new Promise((resolve) => {
    raf(() => {
      raf(() => resolve())
    })
  })
}
