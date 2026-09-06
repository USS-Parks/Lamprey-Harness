import { getConversation } from './conversation-store'
import { getProject } from './projects-store'
import { getActiveWorkspace } from './workspace-state'

/** Resolve the task's recorded location before the default working folder. */
export function getTaskWorkspace(conversationId?: string | null): string {
  if (conversationId == null) return getActiveWorkspace()
  if (typeof conversationId !== 'string' || !conversationId.trim()) throw new Error('A valid task ID is required.')
  const task = getConversation(conversationId)
  if (!task) throw new Error('The task no longer exists.')
  const project = task.projectId ? getProject(task.projectId) : null
  return task.worktreePath || project?.path || getActiveWorkspace()
}
