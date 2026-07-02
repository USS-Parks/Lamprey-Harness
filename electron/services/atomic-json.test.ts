import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeJsonAtomic, readJsonGuarded } from './atomic-json'

const dir = () => mkdtempSync(join(tmpdir(), 'lamprey-atomic-'))

describe('JM-13 atomic JSON persistence', () => {
  it('writes via temp + rename and leaves no temp residue', () => {
    const d = dir()
    const p = join(d, 'settings.json')
    writeJsonAtomic(p, { a: 1 })
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toEqual({ a: 1 })
    expect(readdirSync(d)).toEqual(['settings.json'])
  })

  it('replaces an existing file atomically', () => {
    const d = dir()
    const p = join(d, 'keys.json')
    writeJsonAtomic(p, { old: true })
    writeJsonAtomic(p, { new: true })
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toEqual({ new: true })
  })

  it('reads valid JSON without marking corrupt', () => {
    const d = dir()
    const p = join(d, 'settings.json')
    writeFileSync(p, '{"k":"v"}')
    expect(readJsonGuarded(p)).toEqual({ value: { k: 'v' }, corrupt: false })
  })

  it('missing file is not corrupt', () => {
    expect(readJsonGuarded(join(dir(), 'nope.json'))).toEqual({ value: null, corrupt: false })
  })

  it('preserves a corrupt file aside instead of healing to empty', () => {
    const d = dir()
    const p = join(d, 'keys.json')
    writeFileSync(p, '{"torn": "wri') // simulated crash mid-write
    const r = readJsonGuarded(p)
    expect(r.corrupt).toBe(true)
    expect(r.value).toBeNull()
    expect(r.preservedAs).toBeTruthy()
    expect(existsSync(p)).toBe(false) // moved aside, not left to be overwritten
    expect(readFileSync(r.preservedAs!, 'utf-8')).toBe('{"torn": "wri')
  })
})
