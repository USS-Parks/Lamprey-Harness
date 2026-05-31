import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings-store'

const preloaded = new Set<string>()

function preload(url: string): void {
  if (preloaded.has(url)) return
  preloaded.add(url)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
}

/** Pick the right asset URL based on the active light/dark theme mode.
 *  Pass the regular (light-mode) URL first, the dark-view URL second.
 *  Both variants are eagerly preloaded the first time the hook runs for
 *  a given pair, so flipping themeMode is a cached-image swap with no
 *  network/decode delay. */
export function useThemedIcon(lightUrl: string, darkUrl: string): string {
  const mode = useSettingsStore((s) => s.settings.themeMode)
  useEffect(() => {
    preload(lightUrl)
    preload(darkUrl)
  }, [lightUrl, darkUrl])
  return mode === 'dark' ? darkUrl : lightUrl
}
