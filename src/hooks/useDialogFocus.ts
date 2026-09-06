import { useLayoutEffect, type KeyboardEvent, type RefObject } from 'react'

function controlsIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, input, textarea, select, [href], [tabindex]'))
    .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0)
}

export function containDialogTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab' || event.defaultPrevented || event.nativeEvent.isComposing) return
  const root = event.currentTarget
  if (!(event.target instanceof HTMLElement) || event.target.closest('[role="dialog"]') !== root) return
  const controls = controlsIn(root)
  const first = controls[0]; const last = controls.at(-1)
  if (!first) { event.preventDefault(); root.focus(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
    event.preventDefault(); last?.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) {
    event.preventDefault(); first.focus()
  }
}

export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean): void {
  // Disabling a focused submit button can leave focus on body after an async response.
  useLayoutEffect(() => {
    if (open && ref.current && document.activeElement === document.body) ref.current.focus()
  })
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = ref.current
    const selected = root.querySelector<HTMLElement>('[aria-selected="true"]')
    ;(selected && selected.getClientRects().length ? selected : controlsIn(root)[0] ?? root).focus()
    return () => {
      if (previous?.isConnected && previous !== document.body && previous.getClientRects().length) previous.focus()
      else document.querySelector<HTMLElement>('[data-chat-input]')?.focus()
    }
  }, [open, ref])
}
