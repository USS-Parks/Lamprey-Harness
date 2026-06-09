import { describe, it, expect, beforeEach } from 'vitest'
import {
  runShadowComparison,
  setShadowParserEnabled,
  isShadowParserEnabled,
  type ShadowReport
} from './shadow-parser'

describe('shadow-parser', () => {
  beforeEach(() => {
    setShadowParserEnabled(true)
  })

  it('reports nativeOnly when native tool calls exist', () => {
    const report = runShadowComparison('some text', [
      { id: 'call_1', name: 'shell_command', arguments: { command: 'ls' }, provenance: 'native' }
    ], [])
    expect(report.difference).toBe('nativeOnly')
    expect(report.native).toHaveLength(1)
    expect(report.legacyInferred).toBeNull()
  })

  it('reports none when no tool calls exist', () => {
    const report = runShadowComparison('plain prose', null, [])
    expect(report.difference).toBe('none')
    expect(report.native).toBeNull()
    expect(report.legacyInferred).toBeNull()
  })

  it('config flag can be toggled', () => {
    expect(isShadowParserEnabled()).toBe(true)
    setShadowParserEnabled(false)
    expect(isShadowParserEnabled()).toBe(false)
    setShadowParserEnabled(true)
    expect(isShadowParserEnabled()).toBe(true)
  })

  it('report shape is consistent', () => {
    const report: ShadowReport = runShadowComparison('text', null, [])
    expect(report).toHaveProperty('native')
    expect(report).toHaveProperty('legacyInferred')
    expect(report).toHaveProperty('difference')
  })
})
