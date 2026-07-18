import type { TurnFollowUpRecord } from './turn-control-types'

export const FOLLOW_UP_ACTIVITY_CAP = 20

export interface FollowUpActivityItem {
  id: string
  status: TurnFollowUpRecord['status']
  label: string
  detail: string
}

const STEER_STATUS_LABELS: Record<TurnFollowUpRecord['status'], string> = {
  accepted: 'Steering accepted',
  queued: 'Follow-up queued',
  delivered: 'Steering delivered',
  rejected: 'Steering rejected',
  cancelled: 'Follow-up cancelled',
  recovered: 'Follow-up recovered',
  deleted: 'Follow-up deleted'
}

function statusLabel(record: TurnFollowUpRecord): string {
  if (record.deliveryMode !== 'queue') return STEER_STATUS_LABELS[record.status]
  if (record.status === 'accepted') return 'Queued follow-up accepted'
  if (record.status === 'delivered') return 'Queued follow-up delivered'
  if (record.status === 'rejected') return 'Queued follow-up rejected'
  return STEER_STATUS_LABELS[record.status]
}

export function presentFollowUpActivity(
  records: readonly TurnFollowUpRecord[],
  cap = FOLLOW_UP_ACTIVITY_CAP
): FollowUpActivityItem[] {
  return [...records]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(0, cap))
    .map((record) => ({
      id: record.id,
      status: record.status,
      label: statusLabel(record),
      detail: [
        `#${record.id.slice(0, 8)}`,
        `${record.input.length} input item${record.input.length === 1 ? '' : 's'}`,
        record.targetAgentRunId ? `agent ${record.targetAgentRunId.slice(0, 8)}` : null
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · ')
    }))
}
