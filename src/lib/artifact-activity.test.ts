import { describe, expect, it } from 'vitest'
import {
  activityFromArtifactTool,
  assertIpcSuccess,
  runTrackedArtifactActivity
} from './artifact-activity'
import type { ArtifactActivity } from './types'
import type { ToolCallState } from '@/stores/chat-store'

function tool(status: ToolCallState['status'], toolName = 'create_visualization'): ToolCallState {
  return {
    callId: 'call-1',
    serverId: 'internal',
    toolName,
    args: {},
    status,
    startedAt: 10,
    result: status === 'error' ? 'render failed' : undefined
  }
}

describe('VA-5 artifact activity state alignment', () => {
  it('maps tool pending/running/success/error into queued/running/complete/error', () => {
    expect(activityFromArtifactTool(tool('pending'))?.status).toBe('queued')
    expect(activityFromArtifactTool(tool('running'))?.status).toBe('running')
    expect(activityFromArtifactTool(tool('success'))?.status).toBe('complete')
    expect(activityFromArtifactTool(tool('error'))).toMatchObject({
      status: 'error',
      error: 'render failed'
    })
    expect(activityFromArtifactTool(tool('success', 'shell_command'))).toBeNull()
  })

  it('records queued, running, and complete only after the operation resolves', async () => {
    const states: ArtifactActivity[] = []
    const result = await runTrackedArtifactActivity({
      id: 'activity-1',
      kind: 'file-open',
      label: 'Open flow',
      record: (activity) => states.push(activity),
      operation: async () => 'opened'
    })
    expect(result).toBe('opened')
    expect(states.map((state) => state.status)).toEqual(['queued', 'running', 'complete'])
  })

  it('records error and never false-complete when IPC rejects the operation', async () => {
    const states: ArtifactActivity[] = []
    await expect(
      runTrackedArtifactActivity({
        id: 'activity-1',
        kind: 'file-open',
        label: 'Open flow',
        record: (activity) => states.push(activity),
        operation: async () =>
          assertIpcSuccess({ success: false, error: 'window denied' }, 'open failed')
      })
    ).rejects.toThrow('window denied')
    expect(states.map((state) => state.status)).toEqual(['queued', 'running', 'error'])
    expect(states.some((state) => state.status === 'complete')).toBe(false)
  })
})
