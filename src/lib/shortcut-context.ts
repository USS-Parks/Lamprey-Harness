export interface ShortcutContext {
  composing: boolean
  repeat: boolean
  dialog: boolean
  localSurface: boolean
  editable: boolean
  composer: boolean
}
export function canHandleAppShortcut(context: ShortcutContext): boolean {
  return !context.composing && !context.repeat && !context.dialog && !context.localSurface && (!context.editable || context.composer)
}
