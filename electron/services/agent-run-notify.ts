import { BrowserWindow } from 'electron'
import { enqueueAgentRunNotification } from './async-event-bridge'
import type { AgentRunNotifyEvent } from './subagent-runner'
import { notifyTaskChange } from './task-wait-signal'

export function broadcastAgentRunEvent(event: AgentRunNotifyEvent): void {
  notifyTaskChange({
    conversationId: event.parentConvId ?? null,
    entityId: event.runId,
    kind: 'agent-run'
  })
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:run:notify', event)
  }
  try {
    enqueueAgentRunNotification(event)
  } catch (err) {
    console.error('[agent-run-notify] async notification enqueue failed:', err)
  }
}
