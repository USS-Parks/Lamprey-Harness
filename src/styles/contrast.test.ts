import { expect, it } from 'vitest'
import { contrastRatio, accentForeground } from './contrast'
import { THEME_PRESETS, getActiveTokens } from './theme-presets'
it('uses the standard luminance contrast endpoints', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBe(21)
  expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
})
for (const preset of THEME_PRESETS) for (const mode of ['light', 'dark'] as const) it(`${preset.id} ${mode} retains readable text and filled controls`, () => {
  const tokens = getActiveTokens(preset, mode)
  for (const color of [tokens.textPrimary, tokens.textSecondary, tokens.textMuted, tokens.accent, tokens.success, tokens.warning, tokens.error]) {
    for (const background of [tokens.appBg, tokens.panelBg, tokens.bgPrimary, tokens.bgSecondary, tokens.bgTertiary, tokens.codeBg]) expect(contrastRatio(color, background), `${color} on ${background}`).toBeGreaterThanOrEqual(4.5)
  }
  expect(contrastRatio(tokens.accent, accentForeground(tokens.accent))).toBeGreaterThanOrEqual(4.5)
})
