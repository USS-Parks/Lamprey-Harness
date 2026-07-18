import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('VA-4 selection editing and annotation wiring', () => {
  it('exposes preview, accept, reject, and annotation IPC with user provenance', () => {
    const ipc = read('electron/ipc/artifact.ts')
    const preload = read('electron/preload.ts')
    for (const operation of ['proposeEdit', 'acceptEdit', 'rejectEdit', 'annotate']) {
      expect(ipc).toContain(`artifact:${operation}`)
      expect(preload).toContain(`artifact:${operation}`)
    }
    expect(ipc).toContain("actorKind: 'user'")
    expect(ipc).toContain("actorId: 'local-user'")
  })

  it('lets document and visualization cards open the shared range editor', () => {
    const visual = read('src/components/chat/VisualizationCardRow.tsx')
    const document = read('src/components/chat/DocumentCardRow.tsx')
    const editor = read('src/components/chat/ArtifactEditorDialog.tsx')
    expect(visual).toContain('<ArtifactEditorDialog')
    expect(document).toContain('<ArtifactEditorDialog')
    expect(editor).toContain('selectionStart')
    expect(editor).toContain('selectionEnd')
    expect(editor).toContain('Preview direct edit')
    expect(editor).toContain('Ask Lamprey')
    expect(editor).toContain('Accept')
    expect(editor).toContain('Reject')
    expect(editor).toContain('Annotate')
  })

  it('routes model-requested edits through proposals, not immediate revision writes', () => {
    const editor = read('src/components/chat/ArtifactEditorDialog.tsx')
    const tools = read('electron/services/artifact-tool-pack.ts')
    expect(editor).toContain('Use artifact_propose_edit')
    expect(editor).toContain('Do not call artifact_update')
    const proposalHandler = tools.slice(
      tools.indexOf("id: 'artifact_propose_edit'"),
      tools.indexOf("id: 'create_visualization'")
    )
    expect(proposalHandler).toContain('createArtifactEditProposal')
    expect(proposalHandler).not.toContain('appendArtifactRevision')
  })
})
