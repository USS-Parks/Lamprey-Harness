import { create } from 'zustand'
import type { AppSettings } from '@/lib/types'
import { DEFAULT_PRESET_ID, DEFAULT_THEME_MODE, getPreset } from '@/styles/theme-presets'
import { applyThemePreset } from '@/styles/apply-theme'
import { toast } from './toast-store'

const defaultSettings: AppSettings = {
  theme: 'dark',
  themePreset: DEFAULT_PRESET_ID,
  themeMode: DEFAULT_THEME_MODE,
  fontSize: 14,
  defaultModel: 'deepseek-v4-pro',
  sidebarCollapsed: false,
  artifactPanelWidth: 420,
  minimizeToTray: false,
  autoCheckUpdates: true,
  aiGeneratedTitles: false,
  followUpBehavior: 'steer',
  modelConfig: {},
  customModels: [],
  // NOTE: this literal is a copy of DEFAULT_APP_SETTINGS in
  // `electron/services/default-app-settings.ts` (tsconfig project boundaries
  // forbid a cross-import). `default-app-settings.test.ts` locks the two
  // together — change a default there first.
  //
  // UB-7 (Unburdening Phase, 2026-06-10) — agentMode / agentRoster /
  // proofGate / agenticCodingComposer retired with the pipeline, proof
  // machinery, and composer. `toolSurface: 'full'` is the era default;
  // 'lazy' stays as the MCP-heavy opt-in.
  toolSurface: 'full',
  toolResultSpill: true,
  toolResultSpillBytes: 8192,
  streamInactivityMs: 60000,
  mcpCallTimeoutMs: 120000,
  agenticCodingMode: false,
  agenticCodingSkills: ['plan', 'context', 'verify'],
  snipEnabled: true,
  snipVerbose: false,
  safeSeedLength: 8192,
  // R8 default — ON per user direction (2026-06-06). Closes the audit
  // gap where the model couldn't see its own past chain-of-thought on
  // follow-up turns. User-toggle lands in R9's Settings → Reasoning
  // Audit panel; flipping off is a power-user opt-out to save context
  // tokens on long conversations.
  includePastReasoningInContext: true,
  // July 2026 parity M7 — privileged CDP inspection, OFF by default.
  browserDeveloperModeEnabled: false,
  browserDeveloperSitePolicies: {},
  // Loop Phase LP-7 — autonomous loops, OFF by default (deliberate past-era
  // extension). Mirror of DEFAULT_APP_SETTINGS; parity test locks the two.
  loopsEnabled: false,
  loopMaxIterations: 25,
  loopMaxWallclockMs: 1800000,
  loopTokenBudget: 500000,
  loopMaxConcurrent: 1,
  loopMinIntervalSeconds: 30,
  // Agentic Orchestration Phase AO-1 — OFF by default (deliberate past-era
  // extension). Mirror of DEFAULT_APP_SETTINGS; parity test locks the two.
  orchestrationEnabled: false,
  orchMaxTokensPerRun: 400000,
  orchMaxWallclockMs: 1800000,
  orchMaxCandidates: 4,
  orchMaxDepth: 2,
  orchAdvisorModel: '',
  openrouterFallbacks: [],
  openrouterProviderSort: 'default',
  openrouterProviderOrder: [],
  openrouterProviderIgnore: []
}

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  loadSettings: () => Promise<void>
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
  toggleThemeMode: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  let confirmed = defaultSettings
  let writes = Promise.resolve()
  let revision = 0
  const pending: Partial<AppSettings>[] = []
  const display = (settings: AppSettings) => {
    const previous = get().settings
    set({ settings })
    if (
      settings.themePreset !== previous.themePreset ||
      settings.themeMode !== previous.themeMode
    ) {
      applyThemePreset(getPreset(settings.themePreset), settings.themeMode)
    }
  }
  return {
    settings: defaultSettings,
    loaded: false,

    loadSettings: async () => {
      await writes
      const started = revision
      try {
        const result = await window.api.settings.get()
        if (!result.success) throw new Error(result.error || 'Could not load settings.')
        if (started !== revision) return
        confirmed = { ...defaultSettings, ...(result.data as Partial<AppSettings>) }
        set({ settings: confirmed, loaded: true })
        applyThemePreset(getPreset(confirmed.themePreset), confirmed.themeMode)
      } catch {
        toast.error('Could not load settings. Try reopening Settings.')
      }
    },

    updateSettings: (partial: Partial<AppSettings>) => {
      const patch = { ...partial }
      if (pending.length === 0) confirmed = get().settings
      revision++
      pending.push(patch)
      display({ ...get().settings, ...patch })
      // Persist in interaction order. A failed write removes only its patch;
      // later optimistic choices remain visible until their own writes settle.
      writes = writes.then(async () => {
        try {
          const result = await window.api.settings.set(patch as Record<string, unknown>)
          if (!result.success) throw new Error(result.error || 'Write failed.')
          confirmed = { ...confirmed, ...patch }
        } catch {
          toast.error('Could not save settings. Unsaved changes were reverted.')
        } finally {
          pending.shift()
          display(pending.reduce<AppSettings>((settings, next) => ({ ...settings, ...next }), confirmed))
        }
      })
      return writes
    },

    toggleThemeMode: async () => {
      const current = get().settings.themeMode
      const next = current === 'dark' ? 'light' : 'dark'
      await get().updateSettings({ themeMode: next })
    }
  }
})
