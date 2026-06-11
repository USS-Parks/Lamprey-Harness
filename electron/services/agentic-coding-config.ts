// Agentic coding mode config (Prompt 14 lineage).
//
// UB-5 (Unburdening Phase, 2026-06-10): extracted from
// `final-response-composer.ts` when the composer was excised. The composer
// field is GONE — agentic coding mode is now exactly two things: the coding
// contract role on the system prompt, and the auto-activated skill set.

export interface AgenticCodingConfig {
  mode: boolean
  skills: string[]
}

export const DEFAULT_AGENTIC_SKILLS = ['plan', 'context', 'verify'] as const

/** Resolve the agentic-coding config from raw settings.json content. */
export function loadAgenticCodingConfig(
  raw: Record<string, unknown> | null
): AgenticCodingConfig {
  if (!raw) return { mode: false, skills: [...DEFAULT_AGENTIC_SKILLS] }
  const mode = raw.agenticCodingMode === true
  const skills = Array.isArray(raw.agenticCodingSkills)
    ? (raw.agenticCodingSkills as unknown[]).filter((s): s is string => typeof s === 'string')
    : [...DEFAULT_AGENTIC_SKILLS]
  return { mode, skills }
}
