import { ipcMain } from 'electron'
import * as store from '../services/agent-run-store'
import { getLiveHandle } from '../services/subagent-runner'
import { broadcastAgentRunEvent } from '../services/agent-run-notify'
import { spawnTask } from '../services/spawn-task'
import { getActiveWorkspace } from '../services/workspace-state'
import { loadTaskGraph, type TaskGraphQuery } from '../services/task-graph'
import { readTaskSnapshot, waitForTasks, type WaitTaskTarget } from '../services/task-query'
import { taskLifecycle, type RecoverableTaskAction } from '../services/task-lifecycle'

// Track 1 / A2: tasks:* IPC + agent:run:notify broadcast wiring.
//
// `tasks:list/get/output/stop/update` read or mutate the agent_runs table.
// The notify broadcaster forwards every run start/finish from
// subagent-runner.notify into the renderer via webContents.send so the
// renderer can build a live tree without polling.
//
// Production callers of forkAgent should pass `agentRunStore: realAgentRunStore`
// and `notify: broadcastAgentRunEvent` in their deps so that runs land in the
// DB and surface in the UI. The chat dispatcher (Track 2 wires this) is the
// canonical caller.

export { broadcastAgentRunEvent } from '../services/agent-run-notify'

export function registerTasksHandlers(): void {
  ipcMain.handle('tasks:graph', async (_e, query?: TaskGraphQuery) => {
    try {
      return { success: true, data: loadTaskGraph(query ?? {}) }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'task graph failed') }
    }
  })

  ipcMain.handle('tasks:readGraphTask', async (_e, taskId: string) => {
    try {
      return { success: true, data: readTaskSnapshot(taskId) }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'task read failed') }
    }
  })

  ipcMain.handle('tasks:waitGraph', async (_e, targets: WaitTaskTarget[], timeoutMs?: number) => {
    try {
      return { success: true, data: await waitForTasks(targets, { timeoutMs }) }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'task wait failed') }
    }
  })

  ipcMain.handle(
    'tasks:updateMetadata',
    async (_e, taskId: string, action: RecoverableTaskAction, value?: string | null) => {
      try {
        const allowed: RecoverableTaskAction[] = [
          'rename',
          'pin',
          'unpin',
          'archive',
          'restore',
          'close'
        ]
        if (!allowed.includes(action)) return { success: false, error: 'invalid lifecycle action' }
        return { success: true, data: taskLifecycle.update(taskId, action, value, 'user') }
      } catch (err: unknown) {
        return { success: false, error: messageFor(err, 'task update failed') }
      }
    }
  )

  ipcMain.handle('tasks:previewDelete', async (_e, taskId: string) => {
    try {
      return { success: true, data: taskLifecycle.previewDelete(taskId) }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'task delete preview failed') }
    }
  })

  ipcMain.handle('tasks:deleteGraphTask', async (_e, taskId: string, previewToken: string) => {
    try {
      return { success: true, data: taskLifecycle.delete(taskId, previewToken, 'user') }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'task delete failed') }
    }
  })

  ipcMain.handle('tasks:spawn', async (_e, payload) => {
    try {
      if (!payload || typeof payload !== 'object') {
        return { success: false, error: 'payload must be an object' }
      }
      const input = payload as {
        sourceConversationId?: unknown
        title?: unknown
        prompt?: unknown
        tldr?: unknown
        cwd?: unknown
        model?: unknown
      }
      const result = await spawnTask({
        sourceConversationId:
          typeof input.sourceConversationId === 'string' ? input.sourceConversationId : '',
        title: typeof input.title === 'string' ? input.title : '',
        prompt: typeof input.prompt === 'string' ? input.prompt : '',
        tldr: typeof input.tldr === 'string' ? input.tldr : null,
        cwd: typeof input.cwd === 'string' ? input.cwd : getActiveWorkspace(),
        model: typeof input.model === 'string' ? input.model : null
      })
      return { success: true, data: result }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'spawn failed') }
    }
  })

  ipcMain.handle('tasks:list', async (_e, filter?: store.AgentRunListFilter) => {
    try {
      return { success: true, data: store.listRuns(filter ?? {}) }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'list failed') }
    }
  })

  ipcMain.handle('tasks:get', async (_e, id: string) => {
    try {
      if (typeof id !== 'string' || !id) return { success: false, error: 'id required' }
      const row = store.getRun(id)
      if (!row) return { success: false, error: 'not found' }
      return { success: true, data: row }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'get failed') }
    }
  })

  ipcMain.handle('tasks:output', async (_e, id: string) => {
    try {
      if (typeof id !== 'string' || !id) return { success: false, error: 'id required' }
      const data = store.getRunOutput(id)
      if (!data) return { success: false, error: 'not found' }
      return { success: true, data }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'output failed') }
    }
  })

  ipcMain.handle('tasks:stop', async (_e, id: string) => {
    try {
      if (typeof id !== 'string' || !id) return { success: false, error: 'id required' }
      // AO-5 — tree-wide kill: abort running children first (breadth-first via
      // the parent_run_id chain) so a stopped run doesn't leave orphaned forks
      // still spending. Bounded by max fork-tree depth (a shallow tree in
      // practice); a visited set guards against any cyclic parent linkage.
      const killTree = (rootId: string): number => {
        let aborted = 0
        const seen = new Set<string>()
        const queue = [rootId]
        while (queue.length) {
          const cur = queue.shift()!
          if (seen.has(cur)) continue
          seen.add(cur)
          for (const child of store.listRunningChildRunIds(cur)) {
            const ch = getLiveHandle(child)
            if (ch) {
              ch.abort('parent-stopped')
              aborted++
            }
            queue.push(child)
          }
        }
        return aborted
      }

      const handle = getLiveHandle(id)
      if (handle) {
        const childrenAborted = killTree(id)
        handle.abort('user-stop')
        // The forkAgent catch path will write 'aborted' to the DB + fire the
        // notify event; we return success to the caller now.
        return { success: true, data: { stopped: true, wasLive: true, childrenAborted } }
      }
      // Not live — maybe finished, or never tracked. If the row exists and
      // is still marked running (which would be a stale row), correct it.
      const row = store.getRun(id)
      if (!row) return { success: false, error: 'not found' }
      if (row.status === 'running') {
        store.finishRun({
          id,
          status: 'aborted',
          finishedAt: Date.now(),
          error: 'aborted by user (handle was not live)'
        })
        broadcastAgentRunEvent({
          runId: row.id,
          agentType: row.agentType,
          label: row.label,
          parentConvId: row.parentConvId,
          parentRunId: row.parentRunId,
          status: 'aborted',
          startedAt: row.startedAt,
          finishedAt: Date.now(),
          error: 'aborted by user (handle was not live)',
          background: row.background
        })
        return { success: true, data: { stopped: true, wasLive: false } }
      }
      return { success: true, data: { stopped: false, wasLive: false, status: row.status } }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'stop failed') }
    }
  })

  ipcMain.handle('tasks:update', async (_e, id: string, patch: store.AgentRunUpdate) => {
    try {
      if (typeof id !== 'string' || !id) return { success: false, error: 'id required' }
      if (!patch || typeof patch !== 'object') {
        return { success: false, error: 'patch must be an object' }
      }
      store.updateRun(id, patch)
      const updated = store.getRun(id)
      if (!updated) return { success: false, error: 'not found' }
      return { success: true, data: updated }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'update failed') }
    }
  })
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback
  if (typeof err === 'string') return err || fallback
  return fallback
}
