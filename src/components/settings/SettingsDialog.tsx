import { useEffect, useRef, useState } from 'react'
import { GeneralSettings } from './GeneralSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { ModelSettings } from './ModelSettings'
import { ApiKeySettings } from './ApiKeySettings'
import { AgenticCodingSettings } from './AgenticCodingSettings'
import { HooksSettings } from './HooksSettings'
import { AutomationsSettings } from './AutomationsSettings'
import { LoopSettings } from './LoopSettings'
import { OrchestrationSettings } from './OrchestrationSettings'
import { WebToolsSettings } from './WebToolsSettings'
import { CurrentInfoSettings } from './CurrentInfoSettings'
import { ImageGenSettings } from './ImageGenSettings'
import { PermissionsSettings } from './PermissionsSettings'
import { PlanGoalSettings } from './PlanGoalSettings'
import { GitHubSettings } from './GitHubSettings'
import { ActivityTimeline } from '@/components/activity/ActivityTimeline'
import { LibraryView } from '@/components/library/LibraryView'
import { RagSettings } from './RagSettings'
import { SnipSettings } from './SnipSettings'
import { StreamingTimeoutsSettings } from './StreamingTimeoutsSettings'
import { ToolSettings } from './ToolSettings'
import { ReasoningAuditSettings } from './ReasoningAuditSettings'
import { PersistenceSettings } from './PersistenceSettings'
import { SeedBudgetSettings } from './SeedBudgetSettings'
import { SETTINGS_LEAVES as TABS } from '@/lib/settings-navigation'
import { useUiStore } from '@/stores/ui-store'

interface SettingsDialogProps {
  onClose: () => void
}

type TabId = (typeof TABS)[number]['id']

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const initialTab = useUiStore((s) => s.settingsInitialTab)
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'general')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])

  useEffect(() => {
    document.getElementById(`settings-tab-${activeTab}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeTab])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-heading"
        className="flex h-[560px] max-h-[calc(100vh-2rem)] w-[720px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--bg-secondary)] shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
          if (event.key !== 'Tab') return
          // Reuse the approval dialog's boundary wrapping, excluding hidden
          // and disabled controls and inactive tabs.
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, select, input, textarea, [href], [tabindex]'))
            .filter((control) => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0)
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
      >
        {/* Sidebar tabs */}
        <div
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
          className="flex min-h-0 w-40 shrink-0 flex-col overflow-y-auto bg-[var(--bg-primary)] py-2"
          onKeyDown={(event) => {
            const index = TABS.findIndex((tab) => tab.id === activeTab)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
              : event.key === 'ArrowDown' ? (index + 1) % TABS.length
                : event.key === 'ArrowUp' ? (index + TABS.length - 1) % TABS.length : null
            if (next === null) return
            event.preventDefault()
            const id = TABS[next].id
            setActiveTab(id)
            document.getElementById(`settings-tab-${id}`)?.focus()
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="settings-panel"
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-left font-mono text-xs transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between px-4">
            <span id="settings-heading" className="font-mono text-xs font-semibold text-[var(--text-primary)]">
              Settings
            </span>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`} className="min-h-0 flex-1 overflow-y-auto p-4">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'models' && <ModelSettings />}
            {activeTab === 'agenticCoding' && <AgenticCodingSettings />}
            {activeTab === 'api' && <ApiKeySettings />}
            {activeTab === 'github' && <GitHubSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'webTools' && <WebToolsSettings />}
            {activeTab === 'currentInfo' && <CurrentInfoSettings />}
            {activeTab === 'imageGen' && <ImageGenSettings />}
            {activeTab === 'permissions' && <PermissionsSettings />}
            {activeTab === 'planGoal' && <PlanGoalSettings />}
            {activeTab === 'hooks' && <HooksSettings />}
            {activeTab === 'automations' && <AutomationsSettings />}
            {activeTab === 'loops' && <LoopSettings />}
            {activeTab === 'orchestration' && <OrchestrationSettings />}
            {activeTab === 'library' && <LibraryView />}
            {activeTab === 'rag' && <RagSettings />}
            {activeTab === 'snip' && <SnipSettings />}
            {activeTab === 'timeouts' && <StreamingTimeoutsSettings />}
            {activeTab === 'tools' && <ToolSettings />}
            {activeTab === 'seedBudget' && <SeedBudgetSettings />}
            {activeTab === 'reasoning' && <ReasoningAuditSettings />}
            {activeTab === 'persistence' && <PersistenceSettings />}
            {activeTab === 'activity' && <ActivityTimeline />}
          </div>
        </div>
      </div>
    </div>
  )
}
