import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  propose: vi.fn(), edit: vi.fn(), accept: vi.fn(), reject: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => 'C:\\tmp' }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./pr-patch-flow', () => ({
  proposePrPatch: mocks.propose, editPrPatch: mocks.edit,
  acceptPrPatch: mocks.accept, rejectPrPatch: mocks.reject
}))

import './pr-patch-tool-pack'
import { toolRegistry } from './tool-registry'
import { validateToolArguments } from './tool-schema-validator'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.propose.mockResolvedValue({ id: 'p1', status: 'pending' })
  mocks.edit.mockResolvedValue({ id: 'p1', status: 'pending' })
  mocks.accept.mockResolvedValue({ proposal: { id: 'p1', status: 'accepted' } })
  mocks.reject.mockReturnValue({ id: 'p1', status: 'rejected' })
})

describe('PR-4 patch proposal tools', () => {
  it('registers strict schemas and approval only on workspace application', () => {
    for (const name of ['pr_patch_propose', 'pr_patch_edit', 'pr_patch_accept', 'pr_patch_reject']) {
      const descriptor = toolRegistry.getById(name)!
      expect(descriptor.lazy).toBe(true)
      expect(descriptor.risks).toEqual(['write'])
      expect(descriptor.mutates).toBe(true)
      expect((descriptor.inputSchema as { additionalProperties: boolean }).additionalProperties).toBe(false)
      expect(validateToolArguments(name, { extra: true }, descriptor.inputSchema).valid).toBe(false)
    }
    expect(toolRegistry.getById('pr_patch_accept')?.requiresApproval).toBe(true)
    expect(toolRegistry.getById('pr_patch_propose')?.requiresApproval).toBe(false)
    expect(toolRegistry.getById('pr_patch_reject')?.requiresApproval).toBe(false)
  })

  it('requires explicit accept and active workspace before application', async () => {
    await expect(toolRegistry.executeNative('pr_patch_accept', { proposalId: 'p1' }, {}))
      .rejects.toThrow(/active workspace/)
    await toolRegistry.executeNative('pr_patch_accept', { proposalId: 'p1' }, { workspacePath: 'C:\\work' })
    expect(mocks.accept).toHaveBeenCalledWith({ proposalId: 'p1', workspacePath: 'C:\\work' })
  })

  it('rejects without invoking the apply flow', async () => {
    await toolRegistry.executeNative('pr_patch_reject', { proposalId: 'p1' }, {})
    expect(mocks.reject).toHaveBeenCalledWith('p1')
    expect(mocks.accept).not.toHaveBeenCalled()
  })
})
