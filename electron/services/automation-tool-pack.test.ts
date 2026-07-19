import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>()
  let nextId = 1
  return {
    rows,
    reset: (): void => {
      rows.clear()
      nextId = 1
    },
    listAutomations: vi.fn(() => [...rows.values()]),
    getAutomation: vi.fn((id: string) => rows.get(id) ?? null),
    createAutomation: vi.fn((input: Record<string, unknown>) => {
      const id = `automation-${nextId++}`
      const row = {
        id,
        ...input,
        enabled: true,
        createdAt: 100,
        lastRunAt: null,
        lastResult: null
      }
      rows.set(id, row)
      return row
    }),
    updateAutomation: vi.fn((id: string, patch: Record<string, unknown>) => {
      rows.set(id, { ...rows.get(id), ...patch })
    }),
    deleteAutomation: vi.fn((id: string) => {
      rows.delete(id)
    }),
    runAutomation: vi.fn(async (id: string) => {
      rows.set(id, { ...rows.get(id), lastRunAt: 200, lastResult: 'completed' })
    }),
    parseCron: vi.fn((cron: string) => {
      if (cron !== '0 9 * * *') throw new Error('bad cron')
      return {}
    })
  }
})

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./automations-store', () => ({
  listAutomations: mocks.listAutomations,
  getAutomation: mocks.getAutomation,
  createAutomation: mocks.createAutomation,
  updateAutomation: mocks.updateAutomation,
  deleteAutomation: mocks.deleteAutomation
}))
vi.mock('./automations-runner', () => ({
  parseCron: mocks.parseCron,
  runAutomation: mocks.runAutomation
}))

import './automation-tool-pack'
import { toolRegistry } from './tool-registry'
import { validateToolArguments } from './tool-schema-validator'

describe('GA-1 automation tool pack', () => {
  it('registers strict lazy descriptors with conservative approval metadata', () => {
    expect(toolRegistry.getById('automation_list')).toMatchObject({
      lazy: true,
      risks: ['read'],
      requiresApproval: false,
      parallelizable: true,
      mutates: false
    })
    expect(toolRegistry.getById('automation_update')).toMatchObject({
      lazy: true,
      risks: ['write'],
      requiresApproval: true,
      mutates: true
    })
    expect(toolRegistry.getById('automation_delete')).toMatchObject({
      risks: ['write', 'destructive'],
      requiresApproval: true,
      mutates: true
    })
    expect(toolRegistry.getById('automation_run_now')).toMatchObject({
      risks: ['write', 'network'],
      requiresApproval: true,
      mutates: true
    })
    const update = toolRegistry.getById('automation_update')!
    expect(validateToolArguments(
      update.id,
      { label: 'Daily check', cron: '0 9 * * *', prompt: 'Check status', directive: 'raw' },
      update.inputSchema
    ).valid).toBe(false)
  })

  it('creates, lists, updates, runs, and deletes through public store operations', async () => {
    mocks.reset()
    const created = JSON.parse(String(await toolRegistry.executeNative('automation_update', {
      label: ' Daily check ',
      cron: '0 9 * * *',
      prompt: ' Check status '
    }, {})))
    expect(created).toMatchObject({
      id: 'automation-1',
      label: 'Daily check',
      cron: '0 9 * * *',
      prompt: 'Check status'
    })

    const listed = JSON.parse(String(await toolRegistry.executeNative('automation_list', {}, {})))
    expect(listed).toHaveLength(1)

    const updated = JSON.parse(String(await toolRegistry.executeNative('automation_update', {
      automation_id: 'automation-1',
      enabled: false
    }, {})))
    expect(updated.enabled).toBe(false)

    const ran = JSON.parse(String(await toolRegistry.executeNative('automation_run_now', {
      automation_id: 'automation-1'
    }, {})))
    expect(ran).toMatchObject({ lastRunAt: 200, lastResult: 'completed' })
    expect(mocks.runAutomation).toHaveBeenCalledWith('automation-1')

    const deleted = JSON.parse(String(await toolRegistry.executeNative('automation_delete', {
      automation_id: 'automation-1'
    }, {})))
    expect(deleted).toEqual({ deleted: true, automationId: 'automation-1' })
    expect(mocks.rows.size).toBe(0)
  })

  it('rejects incomplete creates, invalid cron, empty patches, and unknown ids', async () => {
    mocks.reset()
    await expect(toolRegistry.executeNative(
      'automation_update', { label: 'missing fields' }, {}
    )).rejects.toThrow(/cron.*required/i)
    await expect(toolRegistry.executeNative('automation_update', {
      label: 'bad', cron: '* * * * *', prompt: 'bad'
    }, {})).rejects.toThrow(/invalid cron/i)

    mocks.rows.set('known', { id: 'known', label: 'Known' })
    await expect(toolRegistry.executeNative(
      'automation_update', { automation_id: 'known' }, {}
    )).rejects.toThrow(/at least one field/i)
    await expect(toolRegistry.executeNative(
      'automation_run_now', { automation_id: 'missing' }, {}
    )).rejects.toThrow(/no automation/i)
  })

  it('is discoverable without changing the renderer IPC contract', () => {
    const names = toolRegistry.resolveToolSearch('automation schedule run now delete update')
      .map((item) => item.name)
    expect(names).toEqual(expect.arrayContaining([
      'automation_list', 'automation_update', 'automation_delete', 'automation_run_now'
    ]))
  })
})
