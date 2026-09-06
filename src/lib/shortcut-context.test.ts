import { expect, it } from 'vitest'
import { canHandleAppShortcut } from './shortcut-context'
const idle = { composing: false, repeat: false, dialog: false, localSurface: false, editable: false, composer: false }
it('keeps application navigation available from the composer', () => {
  expect(canHandleAppShortcut(idle)).toBe(true)
  expect(canHandleAppShortcut({ ...idle, editable: true, composer: true })).toBe(true)
})
it('preserves composition, modal, local editor and ordinary input ownership', () => {
  for (const key of ['composing', 'repeat', 'dialog', 'localSurface', 'editable'] as const) expect(canHandleAppShortcut({ ...idle, [key]: true })).toBe(false)
  expect(canHandleAppShortcut({ ...idle, composer: true, composing: true })).toBe(false)
})
