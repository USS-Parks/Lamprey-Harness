import * as fs from 'fs'
import * as path from 'path'

const CAP = 20_000 // 20 KB cap; AGENTS.md is meant to be concise.

let cached: string = ''
let cachedAt = 0

const CANDIDATE_NAMES = ['AGENTS.md', 'agents.md', 'Agents.md']

function findAgentsMd(root: string): string | null {
  for (const name of CANDIDATE_NAMES) {
    const p = path.join(root, name)
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch {
      // ignore
    }
  }
  return null
}

// Re-read at most once per 5s. Cheap enough to call on every chat send.
export function readAgentsMd(workspaceRoot?: string): string {
  const root = workspaceRoot || process.cwd()
  const now = Date.now()
  if (cached && now - cachedAt < 5000) return cached
  const p = findAgentsMd(root)
  cachedAt = now
  if (!p) {
    cached = ''
    return cached
  }
  try {
    const raw = fs.readFileSync(p, 'utf8')
    cached = raw.length > CAP ? raw.slice(0, CAP) + '\n\n[…truncated…]' : raw
  } catch {
    cached = ''
  }
  return cached
}

export function invalidateAgentsMd(): void {
  cached = ''
  cachedAt = 0
}
