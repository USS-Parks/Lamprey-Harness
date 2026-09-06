function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
export function contrastRatio(a: string, b: string): number {
  const first = luminance(a); const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}
export function accentForeground(accent: string): string {
  return contrastRatio(accent, '#ffffff') >= contrastRatio(accent, '#111111') ? '#ffffff' : '#111111'
}
