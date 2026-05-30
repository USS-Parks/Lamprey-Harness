// Stub — full implementation in Prompt 13

export interface LoadedSkill {
  id: string
  name: string
  description: string
  content: string
  filePath: string
  enabled: boolean
}

export function listSkills(): LoadedSkill[] {
  return []
}

export function getSkill(_id: string): LoadedSkill | undefined {
  return undefined
}

export function getSkillContent(_id: string): string | null {
  return null
}

export function initializeSkillLoader(): void {
  // stub
}
