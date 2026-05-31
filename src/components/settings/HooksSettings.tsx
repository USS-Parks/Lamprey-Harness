import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/stores/toast-store'

type HookEvent = 'sessionStart' | 'promptSubmit' | 'preToolUse' | 'postToolUse' | 'agentStop'

interface Hook {
  id: string
  event: HookEvent
  label: string
  command: string
  enabled: boolean
  createdAt: number
}

const EVENT_OPTIONS: HookEvent[] = [
  'sessionStart',
  'promptSubmit',
  'preToolUse',
  'postToolUse',
  'agentStop'
]

const EVENT_DESCRIPTIONS: Record<HookEvent, string> = {
  sessionStart: 'Fires once when the app launches.',
  promptSubmit: 'Fires when a user prompt is submitted to a model.',
  preToolUse: 'Fires before any MCP tool runs.',
  postToolUse: 'Fires after any MCP tool returns.',
  agentStop: 'Fires when a model finishes streaming a response.'
}

export function HooksSettings() {
  const [hooks, setHooks] = useState<Hook[]>([])
  const [event, setEvent] = useState<HookEvent>('promptSubmit')
  const [label, setLabel] = useState('')
  const [command, setCommand] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.api?.hooks) return
    const res = await window.api.hooks.list()
    if (res.success) setHooks(res.data as Hook[])
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async () => {
    if (!label.trim() || !command.trim()) {
      toast.error('label and command are required')
      return
    }
    setBusy(true)
    const res = await window.api?.hooks?.create({ event, label: label.trim(), command: command.trim() })
    setBusy(false)
    if (!res?.success) {
      toast.error(res?.error ?? 'create failed')
      return
    }
    setLabel('')
    setCommand('')
    void refresh()
  }

  const toggleEnabled = async (h: Hook) => {
    await window.api?.hooks?.update(h.id, { enabled: !h.enabled })
    void refresh()
  }
  const remove = async (h: Hook) => {
    if (!confirm(`Delete hook "${h.label}"?`)) return
    await window.api?.hooks?.delete(h.id)
    void refresh()
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[14px] font-medium text-[var(--text-primary)]">Hooks</h2>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          Run a shell command on lifecycle events. Hooks fire fire-and-forget — they can't gate the
          event but they can log, notify, or kick off side jobs. Context is passed via env vars
          prefixed <code className="font-mono">LAMPREY_HOOK_*</code>.
        </p>
      </div>

      <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3">
        <h3 className="mb-2 text-[12px] uppercase tracking-wider text-[var(--text-muted)]">
          New hook
        </h3>
        <div className="flex flex-col gap-2">
          <label className="text-[11px] text-[var(--text-muted)]">Event</label>
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value as HookEvent)}
            className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[13px] text-[var(--text-primary)] outline-none"
          >
            {EVENT_OPTIONS.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--text-muted)]">{EVENT_DESCRIPTIONS[event]}</p>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="label, e.g. 'log prompts'"
            className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[13px] outline-none focus:border-[var(--accent)]"
          />
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder='command, e.g. "echo $LAMPREY_HOOK_PROMPT_BODY >> ~/prompts.log"'
            className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-[12px] outline-none focus:border-[var(--accent)]"
          />
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={busy}
              className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1 text-[12px] hover:border-[var(--accent)] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Add hook'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[12px] uppercase tracking-wider text-[var(--text-muted)]">
          Configured ({hooks.length})
        </h3>
        {hooks.length === 0 && (
          <p className="text-[12px] text-[var(--text-muted)]">No hooks yet.</p>
        )}
        {hooks.map((h) => (
          <div
            key={h.id}
            className="mb-2 flex items-start gap-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2 text-[12px]"
          >
            <input
              type="checkbox"
              checked={h.enabled}
              onChange={() => void toggleEnabled(h)}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">
                  {h.event}
                </span>
                <span className="font-medium">{h.label}</span>
              </div>
              <pre className="mt-1 m-0 whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--text-muted)]">
                {h.command}
              </pre>
            </div>
            <button
              onClick={() => void remove(h)}
              className="shrink-0 rounded px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--error)]"
            >
              delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
