import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, copyFileSync } from 'fs'
import { join, basename, dirname, resolve } from 'path'
import matter from 'gray-matter'
import chokidar, { FSWatcher } from 'chokidar'
import { is } from '@electron-toolkit/utils'

export interface LoadedSkill {
  id: string
  name: string
  description: string
  content: string
  filePath: string
  enabled: boolean
  /** Customize C3: tool-glob allowlist injected into the skill block.
   *  When omitted, the skill can call any tool the agent has access to. */
  allowedTools?: string[]
  /** Customize C3: optional per-skill model override. Field is parsed
   *  and surfaced; routing wiring layers on top in a future phase. */
  model?: string
  /** Customize C3: when false the skill is manual-only (user must
   *  reference it explicitly). Defaults to true. */
  autoInvoke?: boolean
  /** Customize C3: directory-mode siblings discovered next to
   *  `skill.md`. Filenames are relative to the skill directory; the
   *  agent reads them by path when referenced. Empty for flat skills. */
  supportingFiles?: string[]
}

const skills = new Map<string, LoadedSkill>()
let watcher: FSWatcher | null = null
let skillsDirPath: string | null = null

function resolveSkillsDir(): string {
  if (is.dev) {
    return join(__dirname, '../../skills')
  }
  return join(app.getPath('userData'), 'skills')
}

function bundledSkillsDir(): string {
  if (is.dev) return join(__dirname, '../../skills')
  return join(process.resourcesPath, 'skills')
}

function copyMissingEntry(src: string, dest: string): void {
  const stats = statSync(src)
  if (stats.isDirectory()) {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
    for (const child of readdirSync(src)) {
      copyMissingEntry(join(src, child), join(dest, child))
    }
    return
  }
  if (!stats.isFile() || existsSync(dest)) return
  try {
    copyFileSync(src, dest)
  } catch (err) {
    console.error('[skill-loader] failed to copy bundled skill', src, err)
  }
}

function ensureSkillsDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const bundled = bundledSkillsDir()
  if (!existsSync(bundled) || resolve(bundled) === resolve(dir)) return

  for (const entry of readdirSync(bundled)) {
    copyMissingEntry(join(bundled, entry), join(dir, entry))
  }
}

function fileIdFromPath(filePath: string): string {
  if (basename(filePath).toLowerCase() === 'skill.md') {
    return basename(dirname(filePath))
  }
  return basename(filePath, '.md')
}

function isSkillFile(filePath: string): boolean {
  const base = basename(filePath).toLowerCase()
  return base === 'skill.md' || base.endsWith('.md')
}

function discoverSkillFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      files.push(...discoverSkillFiles(full))
    } else if (stats.isFile() && isSkillFile(full)) {
      files.push(full)
    }
  }
  return files
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
  }
  return out.length ? out : undefined
}

function discoverSupportingFiles(skillFilePath: string): string[] | undefined {
  // Only directory-mode skills have supporting files. A directory-mode
  // skill is one whose filename is exactly `skill.md`.
  if (basename(skillFilePath).toLowerCase() !== 'skill.md') return undefined
  const dir = dirname(skillFilePath)
  const rel: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (!statSync(full).isFile()) continue
      if (entry.toLowerCase() === 'skill.md') continue
      rel.push(entry)
    }
  } catch {
    return undefined
  }
  return rel.length ? rel.sort() : undefined
}

function parseSkillFile(filePath: string): LoadedSkill | null {
  try {
    if (!statSync(filePath).isFile()) return null
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = matter(raw)
    const name = typeof parsed.data.name === 'string' ? parsed.data.name.trim() : ''
    const description =
      typeof parsed.data.description === 'string' ? parsed.data.description.trim() : ''
    const content = parsed.content.trim()
    if (!name) {
      console.warn('[skill-loader] skipping skill without name:', filePath)
      return null
    }
    const allowedTools = asStringArray(parsed.data.allowedTools ?? parsed.data['allowed-tools'])
    const model =
      typeof parsed.data.model === 'string' && parsed.data.model.trim()
        ? parsed.data.model.trim()
        : undefined
    // Two equivalent spellings — matches what users coming from Claude
    // Code's `disable-model-invocation` instinct expect. Default is on.
    let autoInvoke: boolean | undefined
    if (typeof parsed.data.autoInvoke === 'boolean') autoInvoke = parsed.data.autoInvoke
    else if (typeof parsed.data['auto-invoke'] === 'boolean')
      autoInvoke = parsed.data['auto-invoke'] as boolean
    else if (typeof parsed.data['disable-model-invocation'] === 'boolean')
      autoInvoke = !(parsed.data['disable-model-invocation'] as boolean)
    const supportingFiles = discoverSupportingFiles(filePath)
    return {
      id: fileIdFromPath(filePath),
      name,
      description,
      content,
      filePath,
      enabled: false,
      ...(allowedTools ? { allowedTools } : {}),
      ...(model ? { model } : {}),
      ...(autoInvoke !== undefined ? { autoInvoke } : {}),
      ...(supportingFiles ? { supportingFiles } : {})
    }
  } catch (err) {
    console.error('[skill-loader] failed to parse', filePath, err)
    return null
  }
}

function broadcastChange(): void {
  const list = listSkills()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('skills:changed', list)
  }
}

function upsertFromPath(filePath: string): void {
  if (!isSkillFile(filePath)) return
  const skill = parseSkillFile(filePath)
  if (!skill) return
  skills.set(skill.id, skill)
  broadcastChange()
}

function removeByPath(filePath: string): void {
  if (!isSkillFile(filePath)) return
  const id = fileIdFromPath(filePath)
  if (skills.delete(id)) {
    broadcastChange()
  }
}

export function initializeSkillLoader(): void {
  if (skillsDirPath) return
  const dir = resolveSkillsDir()
  ensureSkillsDir(dir)
  skillsDirPath = dir

  // Initial scan
  try {
    for (const file of discoverSkillFiles(dir)) {
      const skill = parseSkillFile(file)
      if (skill) skills.set(skill.id, skill)
    }
  } catch (err) {
    console.error('[skill-loader] initial scan failed:', err)
  }

  watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })

  watcher.on('add', upsertFromPath)
  watcher.on('change', upsertFromPath)
  watcher.on('unlink', removeByPath)
  watcher.on('error', (err) => console.error('[skill-loader] watcher error:', err))

  console.log(`[skill-loader] watching ${dir} (${skills.size} skills loaded)`)
}

export function shutdownSkillLoader(): void {
  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }
  skills.clear()
  skillsDirPath = null
}

export function getSkillsDir(): string {
  if (!skillsDirPath) {
    skillsDirPath = resolveSkillsDir()
    ensureSkillsDir(skillsDirPath)
  }
  return skillsDirPath
}

export function listSkills(): LoadedSkill[] {
  return Array.from(skills.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function getSkill(id: string): LoadedSkill | undefined {
  return skills.get(id)
}

export function getSkillContent(id: string): string | null {
  const skill = skills.get(id)
  return skill ? skill.content : null
}

export const __skillLoaderTest = {
  discoverSkillFiles,
  parseSkillFile,
  fileIdFromPath
}
