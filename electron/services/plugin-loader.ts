import { app, BrowserWindow } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  copyFileSync,
  rmSync
} from 'fs'
import { join, basename, resolve } from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { is } from '@electron-toolkit/utils'

// Customize C7 — plugin manifest, on-disk layout, in-memory registry.
// Plugins are *declarative-asset bundles* (no executable code Lamprey
// runs in-process). Each plugin is a directory containing:
//
//   <plugin>/
//     plugin.json         (required)
//     skills/             (optional — directory of skill .md files)
//     slash-commands/     (optional — flat .md files)
//     connectors.json     (optional — McpServerConfig[])
//     README.md           (optional)
//
// Two roots are walked:
//   - bundled  : resources/plugins/<id>/  (dev) or process.resourcesPath/plugins (prod)
//   - userland : userData/plugins/<id>/
//
// On first run, bundled plugins are copied into userland so the user can
// edit / disable / remove without touching the install dir. Subsequent
// runs read userland only; bundled is the seed, not a live source.

export interface PluginManifest {
  id: string
  name: string
  description: string
  version: string
  author?: string
  homepage?: string
  /** Category drives sidebar grouping in the Customize Plugins column. */
  category?: string
  /** Default-true; users can flip via enablePlugin/disablePlugin. */
  enabled?: boolean
}

export interface LoadedPlugin {
  manifest: PluginManifest
  /** Resolved enabled state — pulled from `userData/plugins.json` first,
   *  then the manifest's default, then true. */
  enabled: boolean
  /** Absolute directory of the plugin root. */
  rootPath: string
  /** Counts surfaced in the UI. Resolved at load time, not live. */
  surfaceCounts: {
    skills: number
    slashCommands: number
    connectors: number
  }
}

const plugins = new Map<string, LoadedPlugin>()
let watcher: FSWatcher | null = null
let pluginsRoot: string | null = null
let bootstrapped = false

// Customize C11 — change notification. Other loaders (skill-loader,
// slash-commands, mcp-manager) subscribe at init so they can refresh
// their plugin-sourced contributions when a plugin is enabled,
// disabled, removed, or installed. Subscribers are pull-based: they
// re-derive their plugin contributions by calling `enabledPluginRoots()`.
type Listener = () => void
const changeListeners = new Set<Listener>()

export function subscribeToPluginChanges(cb: Listener): () => void {
  changeListeners.add(cb)
  return () => changeListeners.delete(cb)
}

function notifyChangeListeners(): void {
  for (const cb of changeListeners) {
    try {
      cb()
    } catch (err) {
      console.error('[plugin-loader] listener error:', err)
    }
  }
}

export interface EnabledPluginRoot {
  pluginId: string
  rootPath: string
}

export function enabledPluginRoots(): EnabledPluginRoot[] {
  const out: EnabledPluginRoot[] = []
  for (const plugin of plugins.values()) {
    if (plugin.enabled) {
      out.push({ pluginId: plugin.manifest.id, rootPath: plugin.rootPath })
    }
  }
  return out
}

function resolvePluginsRoot(): string {
  if (is.dev) return join(__dirname, '../../resources/plugins')
  // In packaged builds we bootstrap bundled → userData on first launch.
  // After that the source of truth is userData; bundled is read only by
  // the bootstrap pass.
  return join(app.getPath('userData'), 'plugins')
}

function bundledPluginsRoot(): string {
  if (is.dev) return join(__dirname, '../../resources/plugins')
  return join(process.resourcesPath, 'plugins')
}

function enabledStatePath(): string {
  return join(app.getPath('userData'), 'plugins.json')
}

function readEnabledState(): Record<string, boolean> {
  try {
    const fp = enabledStatePath()
    if (!existsSync(fp)) return {}
    const raw = readFileSync(fp, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') result[k] = v
    }
    return result
  } catch {
    return {}
  }
}

function writeEnabledState(state: Record<string, boolean>): void {
  try {
    writeFileSync(enabledStatePath(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('[plugin-loader] failed to persist plugin enabled state:', err)
  }
}

function copyMissingEntry(src: string, dest: string): void {
  let stats
  try {
    stats = statSync(src)
  } catch {
    return
  }
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
    console.error('[plugin-loader] failed to copy bundled plugin file', src, err)
  }
}

function ensurePluginsRoot(root: string): void {
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  const bundled = bundledPluginsRoot()
  if (!existsSync(bundled) || resolve(bundled) === resolve(root)) return
  for (const entry of readdirSync(bundled)) {
    copyMissingEntry(join(bundled, entry), join(root, entry))
  }
}

function parseManifest(rootPath: string): PluginManifest | null {
  const fp = join(rootPath, 'plugin.json')
  if (!existsSync(fp)) return null
  try {
    const raw = readFileSync(fp, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PluginManifest>
    if (!parsed || typeof parsed !== 'object') return null
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : ''
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      console.warn('[plugin-loader] invalid manifest id at', fp)
      return null
    }
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : id
    const description =
      typeof parsed.description === 'string' ? parsed.description.trim() : ''
    const version =
      typeof parsed.version === 'string' && parsed.version.trim()
        ? parsed.version.trim()
        : '0.0.0'
    return {
      id,
      name,
      description,
      version,
      ...(typeof parsed.author === 'string' ? { author: parsed.author.trim() } : {}),
      ...(typeof parsed.homepage === 'string' ? { homepage: parsed.homepage.trim() } : {}),
      ...(typeof parsed.category === 'string' ? { category: parsed.category.trim() } : {}),
      ...(typeof parsed.enabled === 'boolean' ? { enabled: parsed.enabled } : {})
    }
  } catch (err) {
    console.error('[plugin-loader] failed to parse', fp, err)
    return null
  }
}

function countMarkdown(dir: string): number {
  if (!existsSync(dir)) return 0
  let n = 0
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const stats = statSync(full)
      if (stats.isFile() && entry.toLowerCase().endsWith('.md')) n++
      else if (stats.isDirectory() && existsSync(join(full, 'skill.md'))) n++
    }
  } catch {
    return n
  }
  return n
}

function countConnectors(dir: string): number {
  const fp = join(dir, 'connectors.json')
  if (!existsSync(fp)) return 0
  try {
    const parsed = JSON.parse(readFileSync(fp, 'utf-8'))
    if (Array.isArray(parsed)) return parsed.length
    return 0
  } catch {
    return 0
  }
}

function loadPlugin(rootPath: string, enabledState: Record<string, boolean>): LoadedPlugin | null {
  const manifest = parseManifest(rootPath)
  if (!manifest) return null
  const persisted = enabledState[manifest.id]
  const enabled =
    typeof persisted === 'boolean'
      ? persisted
      : typeof manifest.enabled === 'boolean'
        ? manifest.enabled
        : true
  return {
    manifest,
    enabled,
    rootPath,
    surfaceCounts: {
      skills: countMarkdown(join(rootPath, 'skills')),
      slashCommands: countMarkdown(join(rootPath, 'slash-commands')),
      connectors: countConnectors(rootPath)
    }
  }
}

function broadcastChange(): void {
  notifyChangeListeners()
  const list = listPlugins()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('plugins:changed', list)
  }
}

function scanAll(): void {
  if (!pluginsRoot) return
  plugins.clear()
  if (!existsSync(pluginsRoot)) return
  const enabledState = readEnabledState()
  for (const entry of readdirSync(pluginsRoot)) {
    const full = join(pluginsRoot, entry)
    try {
      if (!statSync(full).isDirectory()) continue
    } catch {
      continue
    }
    const plugin = loadPlugin(full, enabledState)
    if (plugin) plugins.set(plugin.manifest.id, plugin)
  }
}

export function initializePluginLoader(): void {
  if (bootstrapped) return
  bootstrapped = true
  const root = resolvePluginsRoot()
  ensurePluginsRoot(root)
  pluginsRoot = root
  scanAll()

  // Watch only the top-level directory and one level of plugin contents.
  // chokidar's default depth handles add/change/unlink on plugin.json and
  // its sibling content folders.
  watcher = chokidar.watch(root, {
    ignoreInitial: true,
    persistent: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })
  const rescan = () => {
    scanAll()
    broadcastChange()
  }
  watcher.on('add', rescan)
  watcher.on('change', rescan)
  watcher.on('unlink', rescan)
  watcher.on('addDir', rescan)
  watcher.on('unlinkDir', rescan)
  watcher.on('error', (err) => console.error('[plugin-loader] watcher error:', err))
  console.log(`[plugin-loader] watching ${root} (${plugins.size} plugins loaded)`)
}

export function shutdownPluginLoader(): void {
  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }
  plugins.clear()
  pluginsRoot = null
  bootstrapped = false
}

export function getPluginsRoot(): string {
  if (!pluginsRoot) {
    pluginsRoot = resolvePluginsRoot()
    ensurePluginsRoot(pluginsRoot)
  }
  return pluginsRoot
}

export function listPlugins(): LoadedPlugin[] {
  return Array.from(plugins.values()).sort((a, b) =>
    a.manifest.name.localeCompare(b.manifest.name)
  )
}

export function getPlugin(id: string): LoadedPlugin | undefined {
  return plugins.get(id)
}

export function enabledPluginIds(): string[] {
  return Array.from(plugins.values())
    .filter((p) => p.enabled)
    .map((p) => p.manifest.id)
}

export function setPluginEnabled(id: string, enabled: boolean): boolean {
  const plugin = plugins.get(id)
  if (!plugin) return false
  if (plugin.enabled === enabled) return true
  plugin.enabled = enabled
  const state = readEnabledState()
  state[id] = enabled
  writeEnabledState(state)
  broadcastChange()
  return true
}

export function removePlugin(id: string): boolean {
  const plugin = plugins.get(id)
  if (!plugin) return false
  try {
    rmSync(plugin.rootPath, { recursive: true, force: true })
  } catch (err) {
    console.error('[plugin-loader] failed to remove plugin dir', plugin.rootPath, err)
    return false
  }
  plugins.delete(id)
  const state = readEnabledState()
  delete state[id]
  writeEnabledState(state)
  broadcastChange()
  return true
}

/**
 * Customize C10: list bundled plugin manifests that are NOT currently
 * installed in `userData/plugins/`. Powers the "bundled catalog" tab in
 * InstallPluginFlow so a user who removed a starter can pull it back.
 */
export function bundledPluginsNotInstalled(): PluginManifest[] {
  const bundled = bundledPluginsRoot()
  if (!existsSync(bundled)) return []
  const result: PluginManifest[] = []
  try {
    for (const entry of readdirSync(bundled)) {
      const full = join(bundled, entry)
      try {
        if (!statSync(full).isDirectory()) continue
      } catch {
        continue
      }
      const manifest = parseManifest(full)
      if (!manifest) continue
      if (plugins.has(manifest.id)) continue
      result.push(manifest)
    }
  } catch {
    /* return what we have */
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Customize C10: copy one bundled plugin by id into the userland root
 * and rescan. Errors out if the plugin is already installed or if the
 * bundled source is missing.
 */
export function installBundled(id: string): { ok: true; id: string } | { ok: false; error: string } {
  if (plugins.has(id)) return { ok: false, error: `Plugin "${id}" is already installed` }
  const src = join(bundledPluginsRoot(), id)
  if (!existsSync(src)) return { ok: false, error: `No bundled plugin with id "${id}"` }
  const dest = join(getPluginsRoot(), id)
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
  copyMissingEntry(src, dest)
  scanAll()
  broadcastChange()
  return { ok: true, id }
}

/**
 * Customize C10: write an inline manifest (with optional sibling files)
 * to a fresh plugin directory. `files` keys are paths relative to the
 * plugin root; each value is the literal file contents. Used by the
 * "Paste manifest" tab in InstallPluginFlow.
 */
export function installFromManifest(
  manifest: PluginManifest,
  files?: Record<string, string>
): { ok: true; id: string } | { ok: false; error: string } {
  try {
    if (!manifest?.id || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
      return { ok: false, error: 'Manifest id must be kebab-case (a-z, 0-9, -)' }
    }
    if (plugins.has(manifest.id)) {
      return { ok: false, error: `Plugin "${manifest.id}" is already installed` }
    }
    const dest = join(getPluginsRoot(), manifest.id)
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
    const manifestOut: PluginManifest = {
      id: manifest.id,
      name: manifest.name?.trim() || manifest.id,
      description: manifest.description?.trim() || '',
      version: manifest.version?.trim() || '0.1.0',
      ...(manifest.author ? { author: manifest.author } : {}),
      ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
      ...(manifest.category ? { category: manifest.category } : {}),
      ...(typeof manifest.enabled === 'boolean' ? { enabled: manifest.enabled } : {})
    }
    writeFileSync(join(dest, 'plugin.json'), JSON.stringify(manifestOut, null, 2), 'utf-8')
    if (files) {
      for (const [rel, body] of Object.entries(files)) {
        // Path-traversal guard: every relative path must resolve INSIDE
        // dest. Reject absolute paths + parent-dir escapes.
        const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
        if (normalized.includes('..')) {
          return { ok: false, error: `Refusing to write parent-escape path: ${rel}` }
        }
        const fullPath = join(dest, normalized)
        if (resolve(fullPath).startsWith(resolve(dest)) === false) {
          return { ok: false, error: `Path escapes plugin dir: ${rel}` }
        }
        const dirOnly = fullPath.slice(0, fullPath.length - basename(fullPath).length)
        if (!existsSync(dirOnly)) mkdirSync(dirOnly, { recursive: true })
        writeFileSync(fullPath, body, 'utf-8')
      }
    }
    scanAll()
    broadcastChange()
    return { ok: true, id: manifest.id }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Customize C7 stub for C10 wiring. Copies a manifest-valid directory
 * tree from `srcPath` into `<pluginsRoot>/<id>`, then rescans.
 */
export function installFromDirectory(srcPath: string): { ok: true; id: string } | { ok: false; error: string } {
  try {
    if (!existsSync(srcPath) || !statSync(srcPath).isDirectory()) {
      return { ok: false, error: `Not a directory: ${srcPath}` }
    }
    const manifest = parseManifest(srcPath)
    if (!manifest) {
      return { ok: false, error: `Missing or invalid plugin.json in ${srcPath}` }
    }
    if (plugins.has(manifest.id)) {
      return { ok: false, error: `Plugin "${manifest.id}" already installed` }
    }
    const dest = join(getPluginsRoot(), manifest.id)
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
    copyMissingEntry(srcPath, dest)
    scanAll()
    broadcastChange()
    return { ok: true, id: manifest.id }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Returns the basename of the plugin directory, useful for the UI. */
export function pluginRootBasename(plugin: LoadedPlugin): string {
  return basename(plugin.rootPath)
}

export const __pluginLoaderTest = {
  parseManifest,
  readEnabledState,
  writeEnabledState,
  resolvePluginsRoot
}
