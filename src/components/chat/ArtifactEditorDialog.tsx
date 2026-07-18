import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArtifactEditProposal } from '@/lib/types'
import { useChatStore } from '@/stores/chat-store'
import { toast } from '@/stores/toast-store'
import { assertIpcSuccess, runTrackedArtifactActivity } from '@/lib/artifact-activity'

interface ArtifactReadPayload {
  artifact: { id: string; currentRevision: number; artifactType: string }
  revision: { revision: number; content: string }
  proposals: ArtifactEditProposal[]
}

export function ArtifactEditorDialog({
  artifactId,
  title,
  onClose,
  onRevisionAccepted
}: {
  artifactId: string
  title: string
  onClose: () => void
  onRevisionAccepted?: (revision: number) => void
}) {
  const [payload, setPayload] = useState<ArtifactReadPayload | null>(null)
  const [range, setRange] = useState({ start: 0, end: 0 })
  const [replacement, setReplacement] = useState('')
  const [instruction, setInstruction] = useState('')
  const [annotation, setAnnotation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const liveProposals = useChatStore((state) => state.artifactEditProposals)

  const load = async () => {
    const result = await window.api.artifact.read(artifactId)
    if (!result.success) throw new Error(result.error ?? 'Could not load artifact')
    const next = result.data as ArtifactReadPayload
    setPayload(next)
    for (const proposal of next.proposals ?? []) {
      useChatStore.getState().upsertArtifactEditProposal(proposal)
    }
  }

  useEffect(() => {
    let cancelled = false
    void load().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => {
      cancelled = true
    }
  }, [artifactId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const proposals = useMemo(() => {
    const merged = new Map<string, ArtifactEditProposal>()
    for (const proposal of payload?.proposals ?? []) merged.set(proposal.id, proposal)
    for (const proposal of liveProposals) {
      if (proposal.artifactId === artifactId) merged.set(proposal.id, proposal)
    }
    return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt)
  }, [artifactId, liveProposals, payload?.proposals])

  const selected = payload?.revision.content.slice(range.start, range.end) ?? ''

  const previewDirectEdit = async () => {
    if (!payload) return
    setBusy(true)
    setError(null)
    try {
      const proposal = await runTrackedArtifactActivity({
        kind: 'artifact-edit',
        label: `Preview edit to ${title}`,
        record: useChatStore.getState().upsertArtifactActivity,
        operation: async () => {
          const result = await window.api.artifact.proposeEdit({
            artifactId,
            baseRevision: payload.revision.revision,
            startOffset: range.start,
            endOffset: range.end,
            replacement,
            rationale: instruction || undefined
          })
          return assertIpcSuccess<ArtifactEditProposal>(result, 'Could not create edit preview')
        }
      })
      useChatStore.getState().upsertArtifactEditProposal(proposal)
      toast.success('Edit preview created')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const askLamprey = async () => {
    if (!payload || !instruction.trim()) {
      setError('Describe the revision you want Lamprey to propose.')
      return
    }
    const prompt = [
      `Propose an edit to artifact ${artifactId} at exact revision ${payload.revision.revision}.`,
      `Selected UTF-16 range: ${range.start}..${range.end}.`,
      selected ? `Selected source:\n\n${selected}` : 'The selection is an insertion point.',
      `Revision request: ${instruction.trim()}`,
      'Use artifact_propose_edit. Do not call artifact_update; I need to preview and accept or reject the proposal.'
    ].join('\n\n')
    onClose()
    await useChatStore.getState().sendMessage(prompt, [])
  }

  const addAnnotation = async () => {
    if (!payload || !annotation.trim()) return
    setBusy(true)
    try {
      await runTrackedArtifactActivity({
        kind: 'artifact-edit',
        label: `Annotate ${title}`,
        record: useChatStore.getState().upsertArtifactActivity,
        operation: async () => {
          const result = await window.api.artifact.annotate({
            artifactId,
            revision: payload.revision.revision,
            startOffset: range.start,
            endOffset: range.end,
            body: annotation.trim()
          })
          assertIpcSuccess(result, 'Could not add annotation')
        }
      })
      setAnnotation('')
      toast.success('Annotation saved with user provenance')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const decide = async (proposal: ArtifactEditProposal, accept: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const result = await runTrackedArtifactActivity({
        kind: 'artifact-edit',
        label: `${accept ? 'Accept' : 'Reject'} edit to ${title}`,
        record: useChatStore.getState().upsertArtifactActivity,
        operation: async () => {
          const response = accept
            ? await window.api.artifact.acceptEdit(proposal.id)
            : await window.api.artifact.rejectEdit(proposal.id)
          return assertIpcSuccess(response, `Could not ${accept ? 'accept' : 'reject'} edit`)
        }
      })
      const updated = accept
        ? (result as { proposal: ArtifactEditProposal; revision: { revision: number } }).proposal
        : (result as ArtifactEditProposal)
      useChatStore.getState().upsertArtifactEditProposal(updated)
      if (accept) {
        const revision = (result as { revision: { revision: number } }).revision.revision
        onRevisionAccepted?.(revision)
        toast.success(`Accepted as revision ${revision}`)
      } else {
        toast.success('Edit rejected; current revision unchanged')
      }
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      await load().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${title}`}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--bg-secondary)] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[var(--panel-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
              Edit {title}
            </h2>
            <p className="text-[12px] text-[var(--text-muted)]">
              {artifactId} · revision {payload?.revision.revision ?? '…'} · select an exact source
              range
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]"
          >
            Close
          </button>
        </header>
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-2">
          <div className="min-w-0">
            <textarea
              ref={sourceRef}
              readOnly
              value={payload?.revision.content ?? ''}
              onSelect={(event) =>
                setRange({
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd
                })
              }
              className="h-72 w-full resize-y rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3 font-mono text-[12px] text-[var(--text-primary)]"
              aria-label="Artifact source; select the range to edit"
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Selection {range.start}..{range.end} ({range.end - range.start} characters)
            </p>
            <label className="mt-3 block text-[12px] font-medium text-[var(--text-secondary)]">
              Revision instruction
            </label>
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              className="mt-1 h-20 w-full rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] p-2 text-sm"
              placeholder="Explain what should change…"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy || !payload}
                onClick={() => void askLamprey()}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
              >
                Ask Lamprey
              </button>
            </div>
            <label className="mt-3 block text-[12px] font-medium text-[var(--text-secondary)]">
              Direct replacement
            </label>
            <textarea
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              className="mt-1 h-28 w-full rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] p-2 font-mono text-[12px]"
              placeholder="Replacement source (empty deletes the selection)"
            />
            <button
              type="button"
              disabled={busy || !payload}
              onClick={() => void previewDirectEdit()}
              className="mt-2 rounded-md border border-[var(--accent)] px-3 py-1.5 text-[12px] text-[var(--accent)] disabled:opacity-50"
            >
              Preview direct edit
            </button>
            <label className="mt-3 block text-[12px] font-medium text-[var(--text-secondary)]">
              Annotation
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={annotation}
                onChange={(event) => setAnnotation(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm"
                placeholder="Comment on the selected range"
              />
              <button
                type="button"
                disabled={busy || !annotation.trim()}
                onClick={() => void addAnnotation()}
                className="rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-[12px] disabled:opacity-50"
              >
                Annotate
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Revision previews
            </h3>
            <div className="mt-2 flex flex-col gap-3">
              {proposals.length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">No edit proposals yet.</p>
              )}
              {proposals.map((proposal) => (
                <section
                  key={proposal.id}
                  className="rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                    <span>
                      Revision {proposal.baseRevision} · {proposal.actorKind}
                    </span>
                    <span className="uppercase">{proposal.status}</span>
                  </div>
                  {proposal.rationale && (
                    <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
                      {proposal.rationale}
                    </p>
                  )}
                  <div className="mt-2 grid gap-2 text-[12px] sm:grid-cols-2">
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-950/25 p-2 text-red-300">
                      <span className="select-none">− </span>
                      {payload?.revision.revision === proposal.baseRevision
                        ? payload.revision.content.slice(proposal.startOffset, proposal.endOffset)
                        : `range ${proposal.startOffset}..${proposal.endOffset}`}
                    </pre>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-emerald-950/25 p-2 text-emerald-300">
                      <span className="select-none">+ </span>
                      {proposal.replacement}
                    </pre>
                  </div>
                  {proposal.status === 'pending' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide(proposal, true)}
                        className="rounded bg-emerald-700 px-3 py-1 text-[12px] text-white disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide(proposal, false)}
                        className="rounded border border-[var(--panel-border)] px-3 py-1 text-[12px] disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="border-t border-[var(--panel-border)] px-4 py-2 text-sm text-[var(--danger)]"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
