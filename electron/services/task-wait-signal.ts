export type TaskChangeKind = 'turn' | 'agent-run' | 'steer' | 'metadata' | 'fork'

export interface TaskChangeSignal {
  conversationId: string | null
  entityId: string | null
  kind: TaskChangeKind
  occurredAt: number
}

type Listener = (signal: TaskChangeSignal) => void
const listeners = new Set<Listener>()

export function notifyTaskChange(
  signal: Omit<TaskChangeSignal, 'occurredAt'> & { occurredAt?: number }
): void {
  const value: TaskChangeSignal = { ...signal, occurredAt: signal.occurredAt ?? Date.now() }
  for (const listener of [...listeners]) listener(value)
}

export function subscribeTaskChanges(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
