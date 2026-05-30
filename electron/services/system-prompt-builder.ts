export function buildSystemPrompt(
  activeSkillContents: { name: string; content: string }[],
  memoryBlock: string
): string {
  const parts: string[] = [
    'You are Lamprey, a helpful AI assistant. Be direct and precise.'
  ]

  if (memoryBlock) {
    parts.push(memoryBlock)
  }

  for (const skill of activeSkillContents) {
    parts.push(`<skill name="${skill.name}">\n${skill.content}\n</skill>`)
  }

  return parts.join('\n\n')
}
