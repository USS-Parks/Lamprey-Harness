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
import { SETTINGS_LEAVES as TABS, SETTINGS_GROUPS, settingsLeaf, searchSettings } from '@/lib/settings-navigation'
import { useUiStore } from '@/stores/ui-store'

interface SettingsDialogProps {
  onClose: () => void
}

type TabId = (typeof TABS)[number]['id']

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const initialTab = useUiStore((s) => s.settingsInitialTab)
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'general')
  const [query, setQuery] = useState('')
  const [lastQuery, setLastQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const searchInput = useRef<HTMLInputElement>(null)
  const results = searchSettings(query)
  const chooseResult = (id: TabId) => {
    setLastQuery(query); setQuery(''); setActiveTab(id)
    requestAnimationFrame(() => document.getElementById('settings-panel')?.focus())
  }
  useEffect(() => { if (query) document.getElementById(`settings-result-${searchIndex}`)?.scrollIntoView({ block: 'nearest' }) }, [query, searchIndex])
  const activeGroup = settingsLeaf(activeTab).group
  const groupLeaves = TABS.filter(leaf => leaf.group === activeGroup)
  useEffect(() => { if (initialTab) { setActiveTab(initialTab); setQuery(''); setLastQuery('') } }, [initialTab])
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
          if (event.nativeEvent.isComposing) return
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
        <nav aria-label="Settings groups" className="flex min-h-0 w-48 max-w-[45%] shrink-0 flex-col overflow-y-auto bg-[var(--bg-primary)] p-2">
          <div className="mb-2 flex shrink-0 flex-col gap-1">
            <input ref={searchInput} type="search" role="combobox" aria-expanded={!!query} aria-controls="settings-search-results" aria-autocomplete="list" aria-activedescendant={query && results[searchIndex] ? `settings-result-${searchIndex}` : undefined} aria-label="Search settings" placeholder="Search settings" value={query} onChange={event => { setQuery(event.target.value); setSearchIndex(0); setLastQuery('') }} onKeyDown={event => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); setLastQuery(''); return }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex(index => Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))) }
              if (event.key === 'Enter' && results[searchIndex]) { event.preventDefault(); chooseResult(results[searchIndex].id) }
            }} className="min-h-9 w-full min-w-0 rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" />
            {query && <button className="min-h-8 px-2 text-left text-xs text-[var(--text-secondary)]" onClick={() => { setQuery(''); setLastQuery(''); searchInput.current?.focus() }}>Clear settings search</button>}
            {!query && lastQuery && <button className="min-h-8 px-2 text-left text-xs text-[var(--text-secondary)]" onClick={() => { setQuery(lastQuery); searchInput.current?.focus() }}>Back to search results</button>}
          </div>
          {query ? <div id="settings-search-results" role="listbox" aria-label="Settings search results" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            <p role="status" className="px-2 py-1 text-xs text-[var(--text-muted)]">{results.length ? `${results.length} sections found` : 'No matching settings.'}</p>
            {results.map((leaf, index) => <button key={leaf.id} id={`settings-result-${index}`} role="option" aria-selected={index === searchIndex} data-settings-result={leaf.id} className={`min-h-10 w-full rounded px-2 py-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${index === searchIndex ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'}`} onMouseEnter={() => setSearchIndex(index)} onClick={() => chooseResult(leaf.id)}><span className="block font-medium text-[var(--text-primary)]">{leaf.label}</span><span className="block text-[var(--text-muted)]">{SETTINGS_GROUPS.find(group => group.id === leaf.group)?.label}</span><span className="mt-1 block text-[var(--text-secondary)]">{leaf.description}</span></button>)}
          </div> : SETTINGS_GROUPS.map(group => <div key={group.id}>
            <button type="button" data-settings-group={group.id} aria-expanded={activeGroup === group.id} aria-controls={`settings-group-${group.id}`} className={`min-h-9 w-full rounded px-2 py-2 text-left text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${activeGroup === group.id ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`} onClick={() => setActiveTab(TABS.find(leaf => leaf.group === group.id)!.id)} onKeyDown={event => {
              const index = SETTINGS_GROUPS.findIndex(item => item.id === group.id)
              const next = event.key === 'ArrowDown' ? (index + 1) % SETTINGS_GROUPS.length : event.key === 'ArrowUp' ? (index + SETTINGS_GROUPS.length - 1) % SETTINGS_GROUPS.length : null
              if (next === null) return
              event.preventDefault(); dialogRef.current?.querySelector<HTMLElement>(`[data-settings-group="${SETTINGS_GROUPS[next].id}"]`)?.focus()
            }}>{group.label}</button>
            {activeGroup === group.id && <div id={`settings-group-${group.id}`} role="tablist" aria-label="Settings sections" aria-orientation="vertical" className="my-1 flex flex-col border-l border-[var(--panel-border)] pl-2" onKeyDown={event => {
              const index = groupLeaves.findIndex(tab => tab.id === activeTab)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? groupLeaves.length - 1 : event.key === 'ArrowDown' ? (index + 1) % groupLeaves.length : event.key === 'ArrowUp' ? (index + groupLeaves.length - 1) % groupLeaves.length : null
              if (next === null) return
              event.preventDefault(); event.stopPropagation()
              const id = groupLeaves[next].id; setActiveTab(id)
              document.getElementById(`settings-tab-${id}`)?.focus()
            }}>
              {groupLeaves.map(tab => <button key={tab.id} id={`settings-tab-${tab.id}`} role="tab" aria-selected={activeTab === tab.id} aria-controls="settings-panel" tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} className={`min-h-8 rounded px-2 py-1.5 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${activeTab === tab.id ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>{tab.label}</button>)}
            </div>}
            {activeGroup === 'extensions' && group.id === 'extensions' && <div className="mb-2 flex flex-col border-t border-[var(--panel-border)] pt-1">{(['skills', 'connectors', 'plugins'] as const).map(column => <button key={column} className="min-h-8 rounded px-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]" onClick={() => { onClose(); useUiStore.getState().openCustomize(column) }}>Manage {column}</button>)}</div>}
          </div>)}
        </nav>

        {/* Content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between px-4">
            <span id="settings-heading" className="text-xs font-semibold text-[var(--text-primary)]">
              Settings
            </span>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="flex min-h-8 min-w-8 items-center justify-center rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
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

          <div id="settings-panel" role="tabpanel" tabIndex={-1} aria-labelledby={`settings-tab-${activeTab}`} className="min-h-0 flex-1 overflow-y-auto p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
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
