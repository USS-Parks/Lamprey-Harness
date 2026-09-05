import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const fault = vi.hoisted(() => ({ rename: false }))
vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('No app data access') } }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('fs', async (original) => {
  const actual = await original<typeof import('fs')>()
  return { ...actual, renameSync: (...args: Parameters<typeof actual.renameSync>) => {
    if (fault.rename) throw new Error('fixture rename failure')
    actual.renameSync(...args)
  } }
})
import { loadConfigs, saveConfigs, type McpServerConfig } from './mcp-manager'
afterEach(() => { fault.rename = false })
const config: McpServerConfig = { id: 'local', name: 'Local', transport: 'stdio', command: 'node', auth: 'none', enabled: false }
const path = () => join(mkdtempSync(join(tmpdir(), 'lamprey-config-test-')), 'mcp-servers.json')

describe('MCP configuration preservation', () => {
  it.each(['{torn', 'null', '{}', '[{"id":"bad"}]'])('preserves invalid file bytes: %s', (raw) => {
    const file = path()
    writeFileSync(file, raw)
    expect(() => loadConfigs(file)).toThrow()
    expect(readFileSync(file, 'utf8')).toBe(raw)
  })
  it('initializes only absent files and reads valid configurations', () => {
    const file = path()
    expect(loadConfigs(file).length).toBeGreaterThan(0)
    saveConfigs([config], file)
    expect(loadConfigs(file)).toEqual([config])
  })
  it('does not reinterpret an unreadable path as missing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lamprey-unreadable-config-'))
    writeFileSync(join(directory,'keep.txt'),'retained')
    expect(() => loadConfigs(directory)).toThrow()
    expect(readFileSync(join(directory,'keep.txt'),'utf8')).toBe('retained')
  })
  it('retains a valid previous configuration when atomic replacement fails', () => {
    const file = path()
    saveConfigs([config], file)
    const original = readFileSync(file)
    fault.rename = true
    expect(() => saveConfigs([{ ...config, name: 'Changed' }], file)).toThrow('fixture rename failure')
    expect(readFileSync(file)).toEqual(original)
  })
  it('rejects duplicate identities before writing', () => {
    const file = path()
    saveConfigs([config], file)
    expect(() => saveConfigs([config, config], file)).toThrow('duplicate')
    expect(loadConfigs(file)).toEqual([config])
  })
})
