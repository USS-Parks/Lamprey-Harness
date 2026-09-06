function score(query: string, candidate: string): number {
  // Lightweight subsequence scorer. Returns -Infinity if not a subsequence.
  // Otherwise smaller is better. Bonuses for prefix and basename matches.
  const q = query.trim().replace(/\\/g, '/').toLowerCase()
  const c = candidate.replace(/\\/g, '/').toLowerCase()
  let qi = 0
  let lastIdx = -1
  let gaps = 0
  for (let i = 0; i < c.length && qi < q.length; i++) {
    if (c[i] === q[qi]) {
      if (lastIdx >= 0) gaps += i - lastIdx - 1
      lastIdx = i
      qi++
    }
  }
  if (qi < q.length) return -Infinity
  let s = gaps + (c.length - q.length) * 0.1
  const base = candidate.slice(candidate.lastIndexOf('/') + 1).toLowerCase()
  const sep = candidate.lastIndexOf('\\')
  const baseWin = sep >= 0 ? candidate.slice(sep + 1).toLowerCase() : base
  if (baseWin.startsWith(q)) s -= 50
  else if (baseWin.includes(q)) s -= 20
  return -s
}

export function rankWorkspaceFiles(query: string, files: string[]): string[] {
  if (!query.trim()) return files.slice(0, 50)
  const scored: { f: string; s: number }[] = []
  for (const f of files) {
    const sc = score(query, f)
    if (sc !== -Infinity) scored.push({ f, s: sc })
  }
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, 50).map((x) => x.f)
}

