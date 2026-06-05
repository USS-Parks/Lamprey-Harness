// ────────────────────────────────────────────────────────────────────────
// Windows fallback profile — populated by S6.
//
// Until S6 lands, this returns `null` so the entry point in ./index.ts
// falls back to a pass-through with tier 'none'.
// ────────────────────────────────────────────────────────────────────────

import type { SandboxInput, SandboxOutput } from './index'

export function applyWindowsProfile(_input: SandboxInput): SandboxOutput | null {
  return null
}
