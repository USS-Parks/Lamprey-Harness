/** TL-C3 — turn socket-level probe failures into a loud, local-server hint. */

export const CONNECTION_REFUSED_HINT =
  'Connection refused — nothing is listening at this provider base URL. Start the local server (Ollama, LM Studio, Unsloth, or your custom endpoint) and test again.'

function collectErrorText(err: unknown, depth = 0): string {
  if (err == null || depth > 5) return ''
  if (typeof err === 'string') return err
  if (typeof err !== 'object') return String(err)
  const o = err as { code?: unknown; message?: unknown; cause?: unknown }
  const parts: string[] = []
  if (typeof o.code === 'string') parts.push(o.code)
  if (typeof o.message === 'string') parts.push(o.message)
  if (o.cause) parts.push(collectErrorText(o.cause, depth + 1))
  return parts.join('\n')
}

export function isConnectionRefusedError(err: unknown): boolean {
  const text = collectErrorText(err)
  return /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|connect\s+ECONNREFUSED/i.test(text)
}

export function describeProviderProbeFailure(err: unknown, fallback: string): string {
  if (isConnectionRefusedError(err)) return CONNECTION_REFUSED_HINT
  const text = collectErrorText(err).trim()
  return text || fallback
}
