import type { ToolId } from '@/stores/ui-store'

export const TOOL_LABELS: Record<ToolId, string> = {
  files: 'Files',
  sidechat: 'Side chat',
  browser: 'Browser',
  review: 'Review',
  terminal: 'Terminal',
  environment: 'Environment',
  sources: 'Sources',
  artifacts: 'Artifacts',
  plan: 'Plan',
  background: 'Background tasks',
  afterAction: 'After action',
  loop: 'Loops',
  agents: 'Agents'
}
