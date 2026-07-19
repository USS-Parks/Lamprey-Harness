import { ipcMain } from 'electron'
import {
  MODEL_CATALOG,
  isKnownProvider,
  listAllProviders,
  listLiveModelIds,
  resolveModel,
  verifyCatalog
} from '../services/providers/registry'
import { readSettings as readSettingsShared, writeSettingsFile } from '../services/settings-helper'
import { buildLiveModelImports } from '../services/providers/model-import'

interface ModelInfo {
  id: string
  name: string
  apiModelId?: string
  /** Built-in ProviderId or a custom provider id from settings.json. */
  provider: string
  contextWindow: number
  supportsTools: boolean
  supportsVision: boolean
  isReasoner?: boolean
  tier?: string
  description?: string
  /** True for settings.json custom models. The renderer must not infer
   *  origin from a hardcoded id list — that list went stale the moment the
   *  catalog grew. */
  custom?: boolean
}

const BUILTIN_MODELS: ModelInfo[] = MODEL_CATALOG.map((m) => ({
  id: m.id,
  name: m.name,
  provider: m.provider,
  contextWindow: m.contextWindow,
  supportsTools: m.supportsTools,
  supportsVision: m.supportsVision,
  isReasoner: m.isReasoner,
  tier: m.tier,
  description: m.description
}))

// JM-13 (DB-2) — routed through the shared atomic settings-helper.
function readSettings(): Record<string, unknown> {
  return readSettingsShared()
}

function writeSettings(settings: Record<string, unknown>): void {
  writeSettingsFile(settings)
}

function readCustomModels(): ModelInfo[] {
  const settings = readSettings()
  const raw = (settings.customModels as ModelInfo[] | undefined) ?? []
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (m) =>
      m &&
      typeof m.id === 'string' &&
      typeof m.name === 'string' &&
      typeof m.contextWindow === 'number'
  )
}

function combinedModels(): ModelInfo[] {
  const customs = readCustomModels().map((m) => ({
    ...m,
    provider: isKnownProvider(m.provider) ? m.provider : 'deepseek',
    custom: true
  }))
  const customIds = new Set(customs.map((m) => m.id))
  // Custom entries override built-ins with the same id.
  const builtIns = BUILTIN_MODELS.filter((m) => !customIds.has(m.id))
  return [...builtIns, ...customs]
}

export function registerModelHandlers(): void {
  ipcMain.handle('model:list', async () => {
    return { success: true, data: combinedModels() }
  })

  ipcMain.handle('model:listProviders', async () => {
    return { success: true, data: listAllProviders() }
  })

  ipcMain.handle('model:getActive', async () => {
    const settings = readSettings()
    const preferred = (settings.defaultModel as string) || 'deepseek-v4-pro'
    const resolved = resolveModel(preferred)
    const available = combinedModels().some((model) => model.id === resolved.id)
    return { success: true, data: available ? resolved.id : 'deepseek-v4-pro' }
  })

  ipcMain.handle('model:setActive', async (_event, id) => {
    try {
      const settings = readSettings()
      settings.defaultModel = id
      writeSettings(settings)
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('model:addCustom', async (_event, model: ModelInfo) => {
    try {
      if (!model || typeof model.id !== 'string' || !model.id.trim()) {
        return { success: false, error: 'Model id is required' }
      }
      if (typeof model.name !== 'string' || !model.name.trim()) {
        return { success: false, error: 'Model display name is required' }
      }
      const settings = readSettings()
      const existing = (settings.customModels as ModelInfo[] | undefined) ?? []
      const filtered = existing.filter((m) => m.id !== model.id)
      filtered.push({
        id: model.id.trim(),
        name: model.name.trim(),
        apiModelId:
          typeof model.apiModelId === 'string' && model.apiModelId.trim()
            ? model.apiModelId.trim()
            : model.id.trim(),
        provider: isKnownProvider(model.provider) ? model.provider : 'deepseek',
        contextWindow:
          typeof model.contextWindow === 'number' && model.contextWindow > 0
            ? model.contextWindow
            : 65536,
        supportsTools: !!model.supportsTools,
        supportsVision: !!model.supportsVision
      })
      settings.customModels = filtered
      writeSettings(settings)
      return { success: true, data: combinedModels() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('model:removeCustom', async (_event, id: string) => {
    try {
      const settings = readSettings()
      const existing = (settings.customModels as ModelInfo[] | undefined) ?? []
      settings.customModels = existing.filter((m) => m.id !== id)
      writeSettings(settings)
      return { success: true, data: combinedModels() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('model:verifyCatalog', async () => {
    try {
      const report = await verifyCatalog()
      return { success: true, data: report }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Catalog verification failed.' }
    }
  })

  // Live /v1/models pull for ONE provider — feeds the import affordance so
  // local runtimes and custom endpoints are usable without hand-typing ids.
  ipcMain.handle('model:listLive', async (_event, provider: unknown) => {
    try {
      if (!isKnownProvider(provider)) {
        return { success: false, error: `Unknown provider: ${String(provider)}` }
      }
      const ids = await listLiveModelIds(provider)
      return { success: true, data: ids }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Live model listing failed.' }
    }
  })

  ipcMain.handle(
    'model:importLive',
    async (_event, input: { provider?: unknown; ids?: unknown }) => {
      try {
        const provider = input?.provider
        if (!isKnownProvider(provider)) {
          return { success: false, error: `Unknown provider: ${String(provider)}` }
        }
        if (!Array.isArray(input?.ids)) {
          return { success: false, error: 'Model ids must be an array.' }
        }
        const settings = readSettings()
        const existing = (settings.customModels as ModelInfo[] | undefined) ?? []
        const { additions, skipped } = buildLiveModelImports(provider, input.ids, [
          ...MODEL_CATALOG.map((m) => ({
            id: m.id,
            provider: m.provider,
            apiModelId: m.apiModelId
          })),
          ...existing
        ])

        settings.customModels = [...existing, ...additions]
        writeSettings(settings)
        return {
          success: true,
          data: { imported: additions.length, skipped, models: combinedModels() }
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Live model import failed.' }
      }
    }
  )
}
