export type ShellIpcEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export function pingReply(): ShellIpcEnvelope<'pong'> {
  return { success: true, data: 'pong' }
}

export function openExternalReply(
  url: unknown,
  open: (href: string) => void
): ShellIpcEnvelope<null> {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    open(url)
    return { success: true, data: null }
  }
  return { success: false, error: 'URL must start with http:// or https://' }
}
