import { describe, expect, it } from 'vitest'
import {
  inlineVisualizationKind,
  parseChartVisualization,
  parseTableVisualization,
  svgDataUrl
} from './visualization-presentation'

describe('VA-3 safe visualization presentation', () => {
  it('keeps executable formats sandbox-only', () => {
    expect(inlineVisualizationKind('html')).toBe('sandbox-only')
    expect(inlineVisualizationKind('jsx')).toBe('sandbox-only')
    expect(inlineVisualizationKind('react')).toBe('sandbox-only')
    expect(inlineVisualizationKind('mermaid')).toBe('mermaid')
    expect(inlineVisualizationKind('svg')).toBe('svg')
  })

  it('parses the validated chart and table envelopes', () => {
    expect(
      parseChartVisualization(
        JSON.stringify({
          type: 'bar',
          xKey: 'name',
          yKeys: ['value'],
          data: [{ name: 'A', value: 2 }]
        })
      )
    ).toMatchObject({ type: 'bar', yKeys: ['value'] })
    expect(
      parseTableVisualization(
        JSON.stringify({ columns: [{ key: 'name', label: 'Name' }], rows: [{ name: 'A' }] })
      )
    ).toMatchObject({ rows: [{ name: 'A' }] })
  })

  it('encodes SVG for image-context rendering without DOM injection', () => {
    expect(svgDataUrl('<svg><text>λ</text></svg>')).toMatch(/^data:image\/svg\+xml;base64,/)
  })
})
