import { PROVIDERS, resolveModel } from './providers/registry'

function defaultBaseFor(modelId?: string): string {
  // When asked "which model are you?", the underlying model should answer
  // honestly with its real name + provider. Lamprey is the harness, not the
  // model. Without this clause the instruction-tuned models parrot back the
  // persona name and look like they're misrepresenting themselves.
  if (modelId) {
    const desc = resolveModel(modelId)
    const providerLabel = PROVIDERS[desc.provider]?.label ?? desc.provider
    return (
      `You are ${desc.name} (served by ${providerLabel}), running inside the Lamprey ` +
      `multi-agent coding harness. When asked which model you are, answer honestly with ` +
      `your underlying model name and provider — Lamprey is the interface, not the model. ` +
      `You ship working code: read the user's intent, plan briefly, edit precisely, ` +
      `run/verify what you change, and stop when the change is real. Prefer concrete ` +
      `diffs and exact file paths over discussion. When a tool exists, use it.`
    )
  }
  return (
    `You are running inside the Lamprey multi-agent coding harness. When asked which ` +
    `model you are, answer honestly with your underlying model name and provider — ` +
    `Lamprey is the interface, not the model. You ship working code: read the user's ` +
    `intent, plan briefly, edit precisely, run/verify what you change, and stop when ` +
    `the change is real. Prefer concrete diffs and exact file paths over discussion. ` +
    `When a tool exists, use it.`
  )
}

export function buildSystemPrompt(
  activeSkillContents: { name: string; content: string }[],
  memoryBlock: string,
  systemPromptOverride?: string,
  agentsMd?: string,
  modelId?: string
): string {
  const base = systemPromptOverride?.trim() ? systemPromptOverride.trim() : defaultBaseFor(modelId)

  const parts: string[] = [base]

  if (agentsMd && agentsMd.trim()) {
    parts.push(`<agents_md>\n${agentsMd.trim()}\n</agents_md>`)
  }

  if (memoryBlock) {
    parts.push(memoryBlock)
  }

  for (const skill of activeSkillContents) {
    parts.push(`<skill name="${skill.name}">\n${skill.content}\n</skill>`)
  }

  return parts.join('\n\n')
}

export const AGENT_ROLE_PROMPTS: Record<string, string> = {
  planner:
    'You are the Planner. Decompose the user request into an ordered, minimal set of steps. ' +
    'Identify which files and tools are involved. Output a short numbered plan only — no code.',
  coder:
    'You are the Coder. Execute the plan from the Planner. Produce exact diffs or file contents. ' +
    'Prefer the smallest correct change. Use tools when they exist.',
  reviewer:
    'You are the Reviewer. Critique the Coder output for correctness, regressions, edge cases, ' +
    'and dead code. If something is wrong, say exactly what and where. If it is good, say SHIP.',
  coworker:
    'You are the Co-worker. You collaborate with the human in real time on the active workspace. ' +
    'Be terse, suggest the next concrete action, and avoid restating the obvious.'
}

export function buildAgentSystemPrompt(
  role: keyof typeof AGENT_ROLE_PROMPTS,
  base?: string,
  modelId?: string
): string {
  const head = base?.trim() ? base.trim() : defaultBaseFor(modelId)
  const role_block = AGENT_ROLE_PROMPTS[role] || ''
  return `${head}\n\n<role>${role}</role>\n${role_block}`
}
