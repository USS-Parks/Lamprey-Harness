export type ShellIpcEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export function pingReply(): ShellIpcEnvelope<'pong'> {
  return { success: true, data: 'pong' }
}

export async function openExternalReply(
  url: unknown,
  open: (href: string) => Promise<void>
): Promise<ShellIpcEnvelope<null>> {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    try {
      await open(url)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  return { success: false, error: 'URL must start with http:// or https://' }
}
