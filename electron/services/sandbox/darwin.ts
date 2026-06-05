// ────────────────────────────────────────────────────────────────────────
// macOS sandbox-exec profile — populated by S4.
//
// Until S4 lands, this returns `null` so the entry point in ./index.ts
// falls back to a pass-through with tier 'none'.
// ────────────────────────────────────────────────────────────────────────

import type { SandboxInput, SandboxOutput } from './index'

export function applyDarwinProfile(_input: SandboxInput): SandboxOutput | null {
  return null
}
