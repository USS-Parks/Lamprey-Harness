import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apply: vi.fn(), error: vi.fn() }))
vi.mock('@/styles/theme-presets', () => ({
  DEFAULT_PRESET_ID: 'default',
  DEFAULT_THEME_MODE: 'dark',
  getPreset: (id: string) => id
}))
vi.mock('@/styles/apply-theme', () => ({ applyThemePreset: mocks.apply }))
vi.mock('./toast-store', () => ({ toast: { error: mocks.error } }))

type Reply = { success: boolean; error?: string; data?: unknown }
function deferred() {
  let resolve!: (value: Reply) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Reply>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('settings persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function setup() {
    const set = vi.fn()
    const get = vi
      .fn()
      .mockResolvedValue({ success: true, data: { themeMode: 'dark', fontSize: 14 } })
    vi.stubGlobal('window', { api: { settings: { set, get } } })
    const { useSettingsStore: store } = await import('./settings-store')
    await store.getState().loadSettings()
    return { store, set, get }
  }

  it.each(['envelope', 'rejection'])(
    'rolls back theme and reports a %s failure',
    async (failure) => {
      const { store, set } = await setup()
      const write = deferred()
      set.mockReturnValue(write.promise)
      const pending = store.getState().updateSettings({ themeMode: 'light' })
      expect(store.getState().settings.themeMode).toBe('light')
      if (failure === 'envelope') write.resolve({ success: false, error: 'disk full' })
      else write.reject(new Error('IPC disconnected'))
      await pending
      expect(store.getState().settings.themeMode).toBe('dark')
      expect(mocks.apply).toHaveBeenLastCalledWith('default', 'dark')
      expect(mocks.error).toHaveBeenCalledOnce()
    }
  )

  it('preserves a later choice while an earlier failure settles and serializes writes', async () => {
    const { store, set } = await setup()
    const first = deferred()
    const second = deferred()
    set.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = store.getState().updateSettings({ fontSize: 16 })
    const b = store.getState().updateSettings({ fontSize: 18 })
    await Promise.resolve()
    expect(set).toHaveBeenCalledTimes(1)
    first.resolve({ success: false })
    await a
    expect(store.getState().settings.fontSize).toBe(18)
    second.resolve({ success: true })
    await b
    expect(store.getState().settings.fontSize).toBe(18)
    expect(set.mock.calls.map(([patch]) => patch)).toEqual([{ fontSize: 16 }, { fontSize: 18 }])
  })

  it('two failed overlapping edits return to the confirmed value', async () => {
    const { store, set } = await setup()
    set.mockResolvedValue({ success: false })
    await Promise.all([
      store.getState().updateSettings({ fontSize: 16 }),
      store.getState().updateSettings({ fontSize: 18 })
    ])
    expect(store.getState().settings.fontSize).toBe(14)
  })

  it('a failed edit does not undo a separately saved field and future writes still work', async () => {
    const { store, set } = await setup()
    set
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('disk'))
      .mockResolvedValueOnce({ success: true })
    await Promise.all([
      store.getState().updateSettings({ fontSize: 16 }),
      store.getState().updateSettings({ themeMode: 'light' })
    ])
    expect(store.getState().settings).toMatchObject({ fontSize: 16, themeMode: 'dark' })
    await store.getState().updateSettings({ fontSize: 20 })
    expect(store.getState().settings.fontSize).toBe(20)
  })

  it('an older load cannot overwrite a new saved choice', async () => {
    const { store, set, get } = await setup()
    const read = deferred()
    get.mockReturnValueOnce(read.promise)
    const loading = store.getState().loadSettings()
    await Promise.resolve()
    set.mockResolvedValue({ success: true })
    await store.getState().updateSettings({ fontSize: 20 })
    read.resolve({ success: true, data: { fontSize: 14 } })
    await loading
    expect(store.getState().settings.fontSize).toBe(20)
  })
})
