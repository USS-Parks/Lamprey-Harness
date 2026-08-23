import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '.tmp-native-inventory-lock' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

import './tool-packs'
import { CORE_SURFACE_NAMES } from './core-tool-names'
import { toolRegistry } from './tool-registry'

const servicesDir = join(__dirname)
const packsSource = readFileSync(join(servicesDir, 'tool-packs.ts'), 'utf-8')
const packImports = [...packsSource.matchAll(/^import '\.\/([^']+)'$/gm)].map((m) => m[1]!)

describe('TR-6 native inventory lock', () => {
  it('registers every CORE_SURFACE_NAMES entry after pack bootstrap', () => {
    expect(packImports.length).toBeGreaterThan(0)
    for (const name of CORE_SURFACE_NAMES) {
      const desc = toolRegistry.getById(name)
      expect(desc, `CORE tool missing after pack bootstrap: ${name}`).toBeDefined()
      expect(desc?.providerKind, name).toBe('native')
    }
  })

  it('every tool-packs.ts import path exists and registers at least one tool', () => {
    expect(packImports.length).toBe(24)
    for (const basename of packImports) {
      const file = join(servicesDir, `${basename}.ts`)
      expect(existsSync(file), `missing pack file ${basename}.ts`).toBe(true)
      const src = readFileSync(file, 'utf-8')
      const registrations = src.match(/registerNative\s*\(/g) ?? []
      expect(registrations.length, `${basename} registers zero tools`).toBeGreaterThan(0)
    }
  })
})
