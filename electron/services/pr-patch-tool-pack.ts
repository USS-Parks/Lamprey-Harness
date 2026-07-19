import { acceptPrPatch, editPrPatch, proposePrPatch, rejectPrPatch } from './pr-patch-flow'
import { toolRegistry } from './tool-registry'

const target = {
  fullName: { type: 'string' },
  prNumber: { type: 'number' },
  headSha: { type: 'string' }
}

toolRegistry.registerNative(
  {
    id: 'pr_patch_propose', name: 'pr_patch_propose', title: 'Propose PR patch',
    description: 'Create an editable patch proposal pinned to the bound PR head without applying it.',
    providerKind: 'native', providerId: 'github', lazy: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      ...target, patch: { type: 'string' }, rationale: { type: 'string' }
    }, required: ['fullName', 'prNumber', 'headSha', 'patch'] },
    risks: ['write'], requiresApproval: false, enabled: true, mutates: true
  },
  async (args, ctx) => {
    if (!ctx.conversationId) throw new Error('patch proposals require an active conversation')
    return JSON.stringify(await proposePrPatch({
      conversationId: ctx.conversationId, fullName: String(args.fullName),
      prNumber: Number(args.prNumber), headSha: String(args.headSha), patch: String(args.patch),
      rationale: typeof args.rationale === 'string' ? args.rationale : null,
      workspacePath: ctx.workspacePath
    }))
  }
)

toolRegistry.registerNative(
  {
    id: 'pr_patch_edit', name: 'pr_patch_edit', title: 'Edit PR patch proposal',
    description: 'Replace the patch text of a still-pending proposal without touching the workspace.',
    providerKind: 'native', providerId: 'github', lazy: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      proposalId: { type: 'string' }, patch: { type: 'string' }, rationale: { type: 'string' }
    }, required: ['proposalId', 'patch'] },
    risks: ['write'], requiresApproval: false, enabled: true, mutates: true
  },
  async (args, ctx) => JSON.stringify(await editPrPatch({
    proposalId: String(args.proposalId), patch: String(args.patch),
    rationale: typeof args.rationale === 'string' ? args.rationale : null,
    workspacePath: ctx.workspacePath
  }))
)

toolRegistry.registerNative(
  {
    id: 'pr_patch_accept', name: 'pr_patch_accept', title: 'Accept and apply PR patch',
    description: 'Explicitly accept one proposal and apply it through the workspace patch authority.',
    providerKind: 'native', providerId: 'github', lazy: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      proposalId: { type: 'string' }
    }, required: ['proposalId'] },
    risks: ['write'], requiresApproval: true, enabled: true, mutates: true
  },
  async (args, ctx) => {
    if (!ctx.workspacePath) throw new Error('patch acceptance requires an active workspace')
    return JSON.stringify(await acceptPrPatch({ proposalId: String(args.proposalId), workspacePath: ctx.workspacePath }))
  }
)

toolRegistry.registerNative(
  {
    id: 'pr_patch_reject', name: 'pr_patch_reject', title: 'Reject PR patch proposal',
    description: 'Reject one pending patch proposal without changing workspace files.',
    providerKind: 'native', providerId: 'github', lazy: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      proposalId: { type: 'string' }
    }, required: ['proposalId'] },
    risks: ['write'], requiresApproval: false, enabled: true, mutates: true
  },
  async (args) => JSON.stringify(rejectPrPatch(String(args.proposalId)))
)
