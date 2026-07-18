import { useMemo, useState } from 'react'
import { followUpText, moveQueuedFollowUp, replaceFollowUpText } from '@/lib/follow-up-state'
import type { TurnFollowUpRecord } from '@/lib/turn-control-types'
import { useChatStore } from '@/stores/chat-store'
import { toast } from '@/stores/toast-store'
import { useUiStore } from '@/stores/ui-store'

function attachmentLabel(record: TurnFollowUpRecord): string | null {
  const attachments = record.input.filter((item) => item.type !== 'text')
  if (attachments.length === 0) return null
  return `${attachments.length} image attachment${attachments.length === 1 ? '' : 's'}`
}

function PendingSteerCard({ record }: { record: TurnFollowUpRecord }) {
  const attachment = attachmentLabel(record)
  return (
    <article
      aria-label="Steering follow-up pending delivery"
      data-follow-up-status={record.status}
      className="flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
      title="Steering accepted; waiting for the next safe model boundary"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-[var(--text-muted)]"
        aria-hidden
      >
        <path d="M9 7H5v4M5 11c1.8-3.7 5.2-5.5 9.1-4.7 3.2.7 5.7 3.2 6.4 6.4" />
      </svg>
      <span className="min-w-0 flex-1 truncate">
        {followUpText(record.input) || attachment || 'Attachment follow-up'}
      </span>
      {attachment && followUpText(record.input) && (
        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">· {attachment}</span>
      )}
      <span className="flex shrink-0 items-center gap-1 text-[12px] text-[var(--text-muted)]">
        <span aria-hidden>↪</span>
        Steer
      </span>
    </article>
  )
}

function FollowUpCard({
  record,
  queuedIndex,
  queuedCount,
  queuedRecords
}: {
  record: TurnFollowUpRecord
  queuedIndex: number | null
  queuedCount: number
  queuedRecords: TurnFollowUpRecord[]
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => followUpText(record.input))
  const activeTurn = useChatStore((state) => state.activeTurn)
  const updateDraft = useChatStore((state) => state.updateFollowUpDraft)
  const reorder = useChatStore((state) => state.reorderQueuedFollowUps)
  const sendNow = useChatStore((state) => state.sendFollowUpNow)
  const deleteFollowUp = useChatStore((state) => state.deleteFollowUp)
  const seedComposeDraft = useUiStore((state) => state.seedComposeDraft)
  const isQueued = record.status === 'queued'
  const attachment = attachmentLabel(record)

  const showFailure = (result: { success: boolean; error?: string }, fallback: string) => {
    if (!result.success) toast.error(result.error ?? fallback)
    return result.success
  }

  const save = async () => {
    const text = draft.trim()
    if (!text && !attachment) {
      toast.error('A follow-up needs text or an attachment.')
      return
    }
    const result = await updateDraft(record.id, replaceFollowUpText(record.input, text))
    if (showFailure(result, 'Could not save follow-up.')) setEditing(false)
  }

  const move = async (direction: -1 | 1) => {
    const result = await reorder(moveQueuedFollowUp(queuedRecords, record.id, direction))
    showFailure(result, 'Could not reorder Queue.')
  }

  return (
    <article
      className={`rounded-xl border px-3 py-2 ${
        isQueued
          ? 'border-[var(--panel-border)] bg-[var(--panel-bg)]'
          : 'border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]'
      }`}
      aria-label={isQueued ? 'Queued follow-up' : 'Recoverable follow-up draft'}
      data-follow-up-status={record.status}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        <span>{isQueued ? `Queue ${Number(queuedIndex) + 1}` : `${record.status} draft`}</span>
        {attachment && <span>· {attachment}</span>}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          aria-label="Edit follow-up text"
          className="mt-2 max-h-32 w-full resize-y rounded-lg border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2.5 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
      ) : (
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">
          {followUpText(record.input) || attachment || 'Attachment follow-up'}
        </p>
      )}

      {!isQueued && (
        <p role="status" className="mt-1 text-[12px] text-[var(--warning)]">
          {record.rejectionMessage ?? record.recoveryReason ?? 'Delivery was not confirmed.'}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(followUpText(record.input))
                setEditing(false)
              }}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          >
            Edit
          </button>
        )}

        {isQueued && queuedIndex !== null && (
          <>
            <button
              type="button"
              aria-label="Move queued follow-up up"
              title="Move up"
              disabled={queuedIndex === 0}
              onClick={() => void move(-1)}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Move queued follow-up down"
              title="Move down"
              disabled={queuedIndex === queuedCount - 1}
              onClick={() => void move(1)}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={!activeTurn}
              title={
                activeTurn ? 'Send at the current turn’s next safe boundary' : 'No running turn'
              }
              onClick={() =>
                void sendNow(record.id).then((result) =>
                  showFailure(result, 'Could not send follow-up now.')
                )
              }
              className="rounded-md px-2 py-1 text-[11px] text-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-30"
            >
              Send now
            </button>
          </>
        )}

        {!isQueued && (
          <button
            type="button"
            onClick={() => seedComposeDraft(followUpText(record.input))}
            className="rounded-md px-2 py-1 text-[11px] text-[var(--accent)] hover:bg-[var(--accent-dim)]"
          >
            Use draft
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            void deleteFollowUp(record.id).then((result) =>
              showFailure(result, 'Could not delete follow-up.')
            )
          }
          className="ml-auto rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]"
        >
          Delete
        </button>
      </div>
    </article>
  )
}

export function FollowUpQueue() {
  const followUps = useChatStore((state) => state.followUps)
  const pendingSteers = useMemo(
    () =>
      followUps.filter((record) => record.deliveryMode === 'steer' && record.status === 'accepted'),
    [followUps]
  )
  const queued = useMemo(
    () =>
      followUps
        .filter((record) => record.deliveryMode === 'queue' && record.status === 'queued')
        .sort((left, right) => (left.position ?? 0) - (right.position ?? 0)),
    [followUps]
  )
  const drafts = useMemo(
    () => followUps.filter((record) => ['rejected', 'recovered'].includes(record.status)),
    [followUps]
  )
  if (pendingSteers.length === 0 && queued.length === 0 && drafts.length === 0) return null

  return (
    <section aria-label="Follow-up Queue" className="mb-2 space-y-2">
      {pendingSteers.map((record) => (
        <PendingSteerCard key={record.id} record={record} />
      ))}
      {queued.map((record, index) => (
        <FollowUpCard
          key={record.id}
          record={record}
          queuedIndex={index}
          queuedCount={queued.length}
          queuedRecords={queued}
        />
      ))}
      {drafts.map((record) => (
        <FollowUpCard
          key={record.id}
          record={record}
          queuedIndex={null}
          queuedCount={queued.length}
          queuedRecords={queued}
        />
      ))}
    </section>
  )
}
