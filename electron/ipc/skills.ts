import { ipcMain } from 'electron'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { getSkillsDir, listSkills, getSkill } from '../services/skill-loader'

interface SkillInput {
  name: string
  description: string
  content: string
  allowedTools?: string[]
  model?: string
  autoInvoke?: boolean
  /** C4: when true, scaffold a directory-mode skill at
   *  `<skillsDir>/<slug>/skill.md`. When false (default), a flat
   *  `<skillsDir>/<slug>.md` file is written. */
  directoryMode?: boolean
  /** C4: when true and `directoryMode` is also true, scaffold an empty
   *  `reference.md` stub alongside `skill.md`. */
  scaffoldReference?: boolean
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'skill'
}

function uniqueId(baseSlug: string, directoryMode = false): string {
  const dir = getSkillsDir()
  const occupied = (slug: string) =>
    existsSync(join(dir, `${slug}.md`)) || existsSync(join(dir, slug))
  if (!occupied(baseSlug)) return baseSlug
  let i = 2
  while (occupied(`${baseSlug}-${i}`)) i++
  void directoryMode
  return `${baseSlug}-${i}`
}

function serializeSkill(input: SkillInput): string {
  const data: Record<string, unknown> = {
    name: input.name,
    description: input.description
  }
  if (input.allowedTools && input.allowedTools.length) data.allowedTools = input.allowedTools
  if (input.model) data.model = input.model
  if (typeof input.autoInvoke === 'boolean') data.autoInvoke = input.autoInvoke
  return matter.stringify(input.content.trim() + '\n', data)
}

export function registerSkillsHandlers(): void {
  ipcMain.handle('skills:list', async () => {
    try {
      return { success: true, data: listSkills() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('skills:create', async (_event, skill: SkillInput) => {
    try {
      if (!skill?.name || typeof skill.name !== 'string') {
        return { success: false, error: 'Skill name is required' }
      }
      const id = uniqueId(slugify(skill.name), skill.directoryMode)
      const skillsDir = getSkillsDir()
      let filePath: string
      const supportingFiles: string[] = []
      if (skill.directoryMode) {
        const dir = join(skillsDir, id)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        filePath = join(dir, 'skill.md')
        writeFileSync(filePath, serializeSkill(skill), 'utf-8')
        if (skill.scaffoldReference) {
          const refPath = join(dir, 'reference.md')
          if (!existsSync(refPath)) {
            writeFileSync(
              refPath,
              `# Reference notes for ${skill.name}\n\nLong-form notes the agent reads only when this skill needs them.\n`,
              'utf-8'
            )
            supportingFiles.push('reference.md')
          }
        }
      } else {
        filePath = join(skillsDir, `${id}.md`)
        writeFileSync(filePath, serializeSkill(skill), 'utf-8')
      }
      return {
        success: true,
        data: {
          id,
          name: skill.name,
          description: skill.description,
          content: skill.content,
          filePath,
          enabled: false,
          ...(skill.allowedTools ? { allowedTools: skill.allowedTools } : {}),
          ...(skill.model ? { model: skill.model } : {}),
          ...(typeof skill.autoInvoke === 'boolean' ? { autoInvoke: skill.autoInvoke } : {}),
          ...(supportingFiles.length ? { supportingFiles } : {})
        }
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('skills:update', async (_event, id: string, skill: SkillInput) => {
    try {
      const existing = getSkill(id)
      if (!existing) return { success: false, error: `Skill not found: ${id}` }
      writeFileSync(existing.filePath, serializeSkill(skill), 'utf-8')
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('skills:delete', async (_event, id: string) => {
    try {
      const existing = getSkill(id)
      if (!existing) return { success: false, error: `Skill not found: ${id}` }
      unlinkSync(existing.filePath)
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
