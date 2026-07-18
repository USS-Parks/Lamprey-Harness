import { describe, expect, it } from 'vitest'
import {
  MAX_ARTIFACT_ANNOTATION_BYTES,
  MAX_ARTIFACT_CONTENT_BYTES,
  validateAnnotationBody,
  validateArtifactContent,
  validateVisualizationFallback
} from './artifact-content-validator'

describe('VA-2 artifact content validation', () => {
  it('accepts bounded Mermaid, chart, table, SVG, HTML, and JSX sources', () => {
    expect(() => validateArtifactContent('mermaid', 'flowchart TD\nA --> B')).not.toThrow()
    expect(() =>
      validateArtifactContent(
        'chart',
        JSON.stringify({
          type: 'bar',
          xKey: 'month',
          yKeys: ['sales'],
          data: [{ month: 'Jan', sales: 2 }]
        })
      )
    ).not.toThrow()
    expect(() =>
      validateArtifactContent(
        'table',
        JSON.stringify({ columns: [{ key: 'name', label: 'Name' }], rows: [{ name: 'Lamprey' }] })
      )
    ).not.toThrow()
    expect(() =>
      validateArtifactContent('svg', '<svg><circle cx="5" cy="5" r="5"/></svg>')
    ).not.toThrow()
    expect(() =>
      validateArtifactContent('html', '<button onclick="this.textContent=\'done\'">Go</button>')
    ).not.toThrow()
    expect(() =>
      validateArtifactContent('jsx', 'function App(){ return <button>Go</button> }')
    ).not.toThrow()
  })

  it('rejects Mermaid directives, click actions, external URLs, and unknown shapes', () => {
    expect(() => validateArtifactContent('mermaid', '%%{init:{}}%%\ngraph TD\nA-->B')).toThrow(
      /init/
    )
    expect(() => validateArtifactContent('mermaid', 'graph TD\nclick A callback')).toThrow(/click/)
    expect(() => validateArtifactContent('mermaid', 'graph TD\nA[https://example.com]')).toThrow(
      /external/
    )
    expect(() => validateArtifactContent('mermaid', 'not-a-diagram')).toThrow(/declaration/)
  })

  it('rejects malformed or oversized chart and table payloads', () => {
    expect(() => validateArtifactContent('chart', '{}')).toThrow(/chart type/)
    expect(() =>
      validateArtifactContent(
        'chart',
        JSON.stringify({ type: 'bar', xKey: 'x', yKeys: [], data: [{ x: 1 }] })
      )
    ).toThrow(/yKeys/)
    expect(() =>
      validateArtifactContent(
        'table',
        JSON.stringify({ columns: [{ key: 'x', label: 'X' }], rows: [{ y: 1 }] })
      )
    ).toThrow(/unknown column/)
  })

  it('rejects active SVG content and external HTML resources', () => {
    expect(() => validateArtifactContent('svg', '<svg onload="bad()"></svg>')).toThrow(
      /event-handler/
    )
    expect(() => validateArtifactContent('svg', '<svg><foreignObject/></svg>')).toThrow(/embedded/)
    expect(() => validateArtifactContent('html', '<script src="local.js"></script>')).toThrow(
      /external HTML scripts/
    )
    expect(() => validateArtifactContent('html', '<iframe srcdoc="x"></iframe>')).toThrow(
      /embedded/
    )
    expect(() => validateArtifactContent('html', '<a href="https://example.com">x</a>')).toThrow(
      /external URL/
    )
  })

  it('rejects JSX imports, host APIs, network APIs, workers, and navigation', () => {
    expect(() =>
      validateArtifactContent('jsx', "import React from 'react'\nfunction App(){}")
    ).toThrow(/imports/)
    expect(() =>
      validateArtifactContent('jsx', 'function App(){ fetch("/x"); return null }')
    ).toThrow(/host APIs/)
    expect(() =>
      validateArtifactContent('react', 'function App(){ window.open("x"); return null }')
    ).toThrow(/host APIs/)
    expect(() =>
      validateArtifactContent('jsx', 'function App(){ new Worker("x"); return null }')
    ).toThrow(/host APIs/)
  })

  it('enforces byte ceilings and non-empty fallback and annotation text', () => {
    expect(() =>
      validateArtifactContent('document', 'x'.repeat(MAX_ARTIFACT_CONTENT_BYTES + 1))
    ).toThrow(/exceeds/)
    expect(() => validateVisualizationFallback('')).toThrow(/required/)
    expect(() => validateVisualizationFallback('A text equivalent')).not.toThrow()
    expect(() => validateAnnotationBody('x'.repeat(MAX_ARTIFACT_ANNOTATION_BYTES + 1))).toThrow(
      /exceeds/
    )
  })
})
