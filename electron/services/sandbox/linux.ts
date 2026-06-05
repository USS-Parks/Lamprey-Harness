// ────────────────────────────────────────────────────────────────────────
// Linux bubblewrap profile — populated by S5.
//
// Until S5 lands, this returns `null` so the entry point in ./index.ts
// falls back to a pass-through with tier 'none'.
// ────────────────────────────────────────────────────────────────────────

import type { SandboxInput, SandboxOutput } from './index'

export function applyLinuxProfile(_input: SandboxInput): SandboxOutput | null {
  return null
}
