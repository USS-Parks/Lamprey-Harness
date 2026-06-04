import { ipcMain, BrowserWindow } from 'electron'
import {
  runWorkflow,
  type WorkflowProgressEvent,
  type WorkflowRunHandle,
  type WorkflowRunnerDeps
} from '../services/workflow-runner'
import {
  forkAgent,
  type ForkAgentDeps,
  type ForkAgentRunner
} from '../services/subagent-runner'
import { realAgentRunStore } from '../services/agent-run-store'
import { broadcastAgentRunEvent } from './tasks'

// Track 1 / B1: workflows:* IPC + workflow:progress broadcast wiring.
//
// B1 ships the in-memory run registry + IPC entrypoints. B2 layers the
// journal on top (run journals to disk + resumeFromRunId). B3 wires the
// renderer panel that subscribes to the broadcast. B4 ships the library.
//
// Production callers register a chat-provider-backed ForkAgentRunner via
// setWorkflowChatRunner(). Until that's called (e.g., before the model
// settings are loaded), runInline returns a structured error.

const liveWorkflows = new Map<string, WorkflowRunHandle>()

let chatRunner: ForkAgentRunner | null = null
let defaultModel: string | null = null

export function setWorkflowChatRunner(args: {
  runner: ForkAgentRunner
  defaultModel: string
}): void {
  chatRunner = args.runner
  defaultModel = args.defaultModel
}

export function broadcastWorkflowProgress(event: WorkflowProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('workflow:progress', event)
  }
}

function buildForkDeps(): ForkAgentDeps {
  if (!chatRunner || !defaultModel) {
    throw new Error(
      'workflows: chat runner not yet registered; call setWorkflowChatRunner({runner, defaultModel}) at startup'
    )
  }
  return {
    runner: chatRunner,
    defaultModel,
    agentRunStore: realAgentRunStore,
    notify: broadcastAgentRunEvent
  }
}

function buildDeps(): WorkflowRunnerDeps {
  return {
    forkSeam: {
      forkAgent,
      forkDeps: buildForkDeps()
    },
    progress: broadcastWorkflowProgress
  }
}

export function registerWorkflowsHandlers(): void {
  // List currently-running workflows. The library lookup (B4) will extend
  // this with saved-on-disk entries.
  ipcMain.handle('workflows:list', async () => {
    try {
      const live = [...liveWorkflows.entries()].map(([runId, h]) => ({
        runId,
        // We don't yet expose meta from the handle; B3's UI hydrates from
        // the progress stream. For now the list is a status surface.
        status: 'running' as const
      }))
      return { success: true, data: { live, library: [] as Array<{ name: string }> } }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'list failed') }
    }
  })

  ipcMain.handle(
    'workflows:runInline',
    async (
      _e,
      input: { script: string; args?: unknown; budgetTotal?: number | null; concurrencyCap?: number; timeoutMs?: number }
    ) => {
      try {
        if (!input || typeof input.script !== 'string') {
          return { success: false, error: 'script required' }
        }
        const deps = buildDeps()
        const handle = runWorkflow(
          {
            script: input.script,
            args: input.args,
            budgetTotal: input.budgetTotal ?? null,
            concurrencyCap: input.concurrencyCap,
            timeoutMs: input.timeoutMs
          },
          deps
        )
        liveWorkflows.set(handle.runId, handle)
        handle.promise.finally(() => liveWorkflows.delete(handle.runId)).catch(() => {})
        // Don't await — IPC returns the runId immediately so the renderer
        // can subscribe to workflow:progress and render the live tree.
        return { success: true, data: { runId: handle.runId } }
      } catch (err: unknown) {
        return { success: false, error: messageFor(err, 'runInline failed') }
      }
    }
  )

  // Named-workflow invocation. B4 wires the library; until then, return a
  // structured error so the renderer can surface the missing dep.
  ipcMain.handle('workflows:run', async (_e, _input: { name: string; args?: unknown }) => {
    return {
      success: false,
      error: 'workflow library not yet available (ships in B4)'
    }
  })

  ipcMain.handle('workflows:stop', async (_e, runId: string) => {
    try {
      if (typeof runId !== 'string' || !runId) {
        return { success: false, error: 'runId required' }
      }
      const handle = liveWorkflows.get(runId)
      if (!handle) return { success: false, error: 'not found or already finished' }
      handle.abort('user-stop')
      return { success: true, data: { stopped: true } }
    } catch (err: unknown) {
      return { success: false, error: messageFor(err, 'stop failed') }
    }
  })
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback
  if (typeof err === 'string') return err || fallback
  return fallback
}
