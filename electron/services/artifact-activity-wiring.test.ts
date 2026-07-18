import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('VA-5 artifact activity and open-outcome wiring', () => {
  it('surfaces visualization, edit, and file-open activity in the existing activity feed', () => {
    const feed = read('src/components/artifacts/ActivityFeed.tsx')
    const helper = read('src/lib/artifact-activity.ts')
    expect(feed).toContain('Artifact activity')
    expect(feed).toContain('activityFromArtifactTool')
    expect(feed).toContain('directArtifactActivities')
    for (const state of ['queued', 'running', 'complete', 'error']) {
      expect(helper).toContain(`'${state}'`)
    }
    for (const tool of [
      'create_visualization',
      'update_visualization',
      'artifact_propose_edit',
      'artifact_update',
      'artifact_annotate'
    ]) {
      expect(helper).toContain(`'${tool}'`)
    }
  })

  it('requires successful open IPC before reporting document or visualization completion', () => {
    for (const path of [
      'src/components/chat/DocumentCardRow.tsx',
      'src/components/chat/VisualizationCardRow.tsx'
    ]) {
      const source = read(path)
      const tracked = source.slice(source.indexOf('runTrackedArtifactActivity'))
      expect(tracked).toContain("kind: 'file-open'")
      expect(tracked).toContain('assertIpcSuccess')
      expect(tracked).toContain('window.api.artifact.openInWindow')
    }
  })

  it('tracks direct edit preview, annotation, accept, and reject outcomes', () => {
    const editor = read('src/components/chat/ArtifactEditorDialog.tsx')
    expect((editor.match(/runTrackedArtifactActivity/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(editor).toContain("kind: 'artifact-edit'")
    expect(editor).toContain('assertIpcSuccess')
  })
})
