import { ipcMain } from 'electron'
import * as artifactSandbox from '../services/artifact-sandbox'
import {
  createArtifactAnnotation,
  getArtifact,
  getArtifactRevision,
  listArtifactAnnotations,
  mirrorEphemeralArtifact
} from '../services/artifact-store'
import {
  acceptArtifactEditProposal,
  createArtifactEditProposal,
  listArtifactEditProposals,
  rejectArtifactEditProposal
} from '../services/artifact-edit-store'
import { validateAnnotationBody } from '../services/artifact-content-validator'

export function registerArtifactHandlers(): void {
  ipcMain.handle('artifact:read', async (_event, artifactId: string, revision?: number) => {
    try {
      if (typeof artifactId !== 'string' || !artifactId.trim()) {
        throw new Error('artifactId is required')
      }
      if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
        throw new Error('revision must be a positive integer')
      }
      const artifact = getArtifact(artifactId)
      if (!artifact) throw new Error(`unknown artifact: ${artifactId}`)
      const resolvedRevision = revision ?? artifact.currentRevision
      const artifactRevision = getArtifactRevision(artifactId, resolvedRevision)
      if (!artifactRevision) {
        throw new Error(`unknown artifact revision: ${artifactId}@${resolvedRevision}`)
      }
      return {
        success: true,
        data: {
          artifact,
          revision: artifactRevision,
          annotations: listArtifactAnnotations(artifactId, artifactRevision.revision),
          proposals: listArtifactEditProposals(artifactId)
        }
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'artifact:proposeEdit',
    async (
      _event,
      input: {
        artifactId: string
        baseRevision: number
        startOffset: number
        endOffset: number
        replacement: string
        rationale?: string
      }
    ) => {
      try {
        return {
          success: true,
          data: createArtifactEditProposal({
            ...input,
            actorKind: 'user',
            actorId: 'local-user'
          })
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('artifact:acceptEdit', async (_event, proposalId: string) => {
    try {
      return {
        success: true,
        data: acceptArtifactEditProposal(proposalId, {
          actorKind: 'user',
          actorId: 'local-user'
        })
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('artifact:rejectEdit', async (_event, proposalId: string) => {
    try {
      return { success: true, data: rejectArtifactEditProposal(proposalId) }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'artifact:annotate',
    async (
      _event,
      input: {
        artifactId: string
        revision: number
        startOffset: number
        endOffset: number
        body: string
      }
    ) => {
      try {
        validateAnnotationBody(input.body)
        return {
          success: true,
          data: createArtifactAnnotation({
            ...input,
            actorKind: 'user',
            actorId: 'local-user'
          })
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('artifact:render', async (_event, type: string, content: string) => {
    try {
      // VA-1 — preserve the old two-argument preview surface while migrating
      // its process-local source into the durable artifact ledger. Rendering
      // remains available if persistence is temporarily unavailable.
      try {
        mirrorEphemeralArtifact(type, content)
      } catch (err) {
        console.warn('[artifact] failed to mirror ephemeral source:', err)
      }
      artifactSandbox.render(type, content)
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('artifact:hide', async () => {
    try {
      artifactSandbox.hide()
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'artifact:resize',
    async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
      try {
        artifactSandbox.setBounds(bounds)
        return { success: true, data: null }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('artifact:openInWindow', async (_event, type: string, content: string) => {
    try {
      artifactSandbox.openInWindow(type, content)
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('artifact:getSource', async () => {
    try {
      return { success: true, data: artifactSandbox.getSource() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('artifact:getType', async () => {
    try {
      return { success: true, data: artifactSandbox.getType() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
