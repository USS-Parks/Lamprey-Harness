import { PopoverMenu } from '@/components/ui/PopoverMenu'
import { MenuRow, MenuSectionLabel, MenuSeparator } from '@/components/ui/MenuRow'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'
import { useNavHistoryStore } from '@/stores/nav-history-store'
import { navigateTaskHistory } from '@/stores/chat-store'
import { commandById, executeCommand, shortcutHint } from '@/lib/app-commands'
import { toast } from '@/stores/toast-store'
import lampreyLogo from '@assets/Lamprey Desktop Icon-1.png'

interface TitlebarProps {
  onSettingsClick: () => void
}

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties

interface MenuItem {
  label?: string
  heading?: string
  shortcut?: string
  onSelect?: () => void
  separator?: boolean
  disabled?: boolean
}

interface MenuButtonProps {
  label: string
  items: MenuItem[]
  open: boolean
  onToggle: () => void
  onClose: () => void
  onHover: () => void
}

function MenuButton({ label, items, open, onToggle, onClose, onHover }: MenuButtonProps) {
  const anchor = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={anchor} type="button" onClick={onToggle} onMouseEnter={onHover}
      onKeyDown={event => { if (event.key === 'ArrowDown' && !event.nativeEvent.isComposing) { event.preventDefault(); if (!open) onToggle() } }}
      className="min-h-8 shrink-0 rounded px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
      aria-haspopup="menu" aria-expanded={open}>{label}</button>
    <PopoverMenu open={open} onClose={onClose} anchorRef={anchor} ariaLabel={`${label} menu`} width="min(320px, calc(100vw - 16px))">
      <div className="max-h-[calc(100vh-64px)] overflow-y-auto">
        {items.map((item, index) => item.heading ? <MenuSectionLabel key={`heading-${index}`}>{item.heading}</MenuSectionLabel> : item.separator ? <MenuSeparator key={`separator-${index}`} /> :
          <MenuRow key={`${index}-${item.label}`} label={item.label ?? ''} shortcut={item.shortcut} disabled={item.disabled}
            onSelect={() => { onClose(); anchor.current?.focus(); item.onSelect?.() }} />)}
      </div>
    </PopoverMenu>
  </>
}

// Collapsed-rail widths must match Sidebar's `w-12` (48px) and App's `w-8`
// (32px) — kept in sync manually so the centered logo never misaligns.
const SIDEBAR_COLLAPSED_PX = 48
const RIGHT_COLLAPSED_PX = 32

export function Titlebar({ onSettingsClick }: TitlebarProps) {
  const compactMenu = useMediaQuery('(max-width: 760px)')
  const settings = useSettingsStore((s) => s.settings)
  const toggleThemeMode = useSettingsStore((s) => s.toggleThemeMode)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const rightPanelCollapsed = useUiStore((s) => s.rightPanelCollapsed)
  const rightPanelWidth = useUiStore((s) => s.rightPanelWidth)
  const canGoBack = useNavHistoryStore(s => s.index > 0)
  const canGoForward = useNavHistoryStore(s => s.index >= 0 && s.index < s.stack.length - 1)
  const goBack = () => void navigateTaskHistory('back')
  const goForward = () => void navigateTaskHistory('forward')
  const isDark = settings.themeMode === 'dark'

  const [isMaximized, setIsMaximized] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const effectiveSidebar = sidebarCollapsed ? SIDEBAR_COLLAPSED_PX : sidebarWidth
  const effectiveRight = rightPanelCollapsed ? RIGHT_COLLAPSED_PX : rightPanelWidth

  useEffect(() => {
    if (!window.api?.window) return
    window.api.window.isMaximized().then((r) => {
      if (r.success) setIsMaximized(Boolean(r.data))
    })
    return window.api.window.onMaximizedChanged((m) => setIsMaximized(m))
  }, [])

  const handleMinimize = () => window.api?.window?.minimize()
  const handleMaximize = () => window.api?.window?.maximizeToggle()
  const handleClose = () => window.api?.window?.close()
  const handleReload = () => window.api?.window?.reload?.()
  const handleDevTools = () => window.api?.window?.toggleDevTools?.()
  const handlePickFolder = async () => {
    try {
      const res = await window.api?.files?.pickWorkdir?.()
      if (res?.success && res.data) {
        toast.success(`Working folder set: ${res.data.name}`)
      }
    } catch {
      toast.error('Could not open folder picker')
    }
  }

  const commandItem = (id: string): MenuItem => {
    const command = commandById(id)
    return { label: command.label, shortcut: shortcutHint(command), disabled: !!command.unavailable?.(), onSelect: () => void executeCommand(command) }
  }
  const fileMenu: MenuItem[] = [
    commandItem('task.new'),
    commandItem('task.search'),
    commandItem('app.commands'),
    commandItem('files.find'),
    { separator: true },
    { label: 'Open folder…', onSelect: handlePickFolder },
    { separator: true },
    { label: 'Exit Lamprey', onSelect: handleClose }
  ]

  const editMenu: MenuItem[] = [
    { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => document.execCommand('undo') },
    { label: 'Redo', shortcut: 'Ctrl+Shift+Z', onSelect: () => document.execCommand('redo') },
    { separator: true },
    { label: 'Cut', shortcut: 'Ctrl+X', onSelect: () => document.execCommand('cut') },
    { label: 'Copy', shortcut: 'Ctrl+C', onSelect: () => document.execCommand('copy') },
    { label: 'Paste', shortcut: 'Ctrl+V', onSelect: () => document.execCommand('paste') },
    { separator: true },
    { label: 'Select all', shortcut: 'Ctrl+A', onSelect: () => document.execCommand('selectAll') }
  ]

  const viewMenu: MenuItem[] = [
    { label: 'Toggle sidebar', shortcut: 'Ctrl+B', onSelect: toggleSidebar },
    {
      label: rightPanelCollapsed ? 'Show artifacts panel' : 'Hide artifacts panel',
      onSelect: toggleRightPanel
    },
    { separator: true },
    {
      label: isDark ? 'Switch to light mode' : 'Switch to dark mode',
      onSelect: toggleThemeMode
    },
    { label: 'Settings', shortcut: 'Ctrl+,', onSelect: onSettingsClick }
  ]

  const windowMenu: MenuItem[] = [
    { label: 'Minimize', onSelect: handleMinimize },
    {
      label: isMaximized ? 'Restore' : 'Maximize',
      onSelect: handleMaximize
    },
    { separator: true },
    { label: 'Reload', shortcut: 'Ctrl+R', onSelect: handleReload },
    { label: 'Toggle DevTools', shortcut: 'Ctrl+Shift+I', onSelect: handleDevTools }
  ]

  const helpMenu: MenuItem[] = [
    {
      label: 'About Lamprey',
      onSelect: () => toast.info('Lamprey — a local-first coding harness with your choice of provider')
    },
    commandItem('app.github'),
    commandItem('app.issue')
  ]

  const menus: Array<{ label: string; items: MenuItem[] }> = [
    { label: 'File', items: fileMenu },
    { label: 'Edit', items: editMenu },
    { label: 'View', items: viewMenu },
    { label: 'Window', items: windowMenu },
    { label: 'Help', items: helpMenu }
  ]

  return (
    <div className="flex flex-col bg-transparent" style={DRAG}>
      {/* ─── Row 1 ─── nav + menus (left) · centered logo (over chat column) · window controls (right) */}
      <div className="relative flex h-9 items-stretch">
        <div className="flex min-w-0 items-center gap-1 pl-2 md:gap-3 md:pl-3" style={NO_DRAG}>
          <NavIconButton
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            ariaLabel="Toggle sidebar"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </NavIconButton>
          <NavIconButton
            onClick={goBack}
            disabled={!canGoBack}
            title="Back in task history"
            ariaLabel="Back in task history"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </NavIconButton>
          <NavIconButton
            onClick={goForward}
            disabled={!canGoForward}
            title="Forward in task history"
            ariaLabel="Forward in task history"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </NavIconButton>
          <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
          {(compactMenu ? [{ label: 'Menu', items: menus.flatMap(menu => [{ heading: menu.label }, ...menu.items]) }] : menus).map((m) => (
            <MenuButton
              key={m.label}
              label={m.label}
              items={m.items}
              open={openMenu === m.label}
              onToggle={() => setOpenMenu(openMenu === m.label ? null : m.label)}
              onClose={() => setOpenMenu(null)}
              onHover={() => {
                if (openMenu !== null) setOpenMenu(m.label)
              }}
            />
          ))}
        </div>

        {/* Centered logo — tracks the chat column as sidebar/right-panel resize. */}
        <div
          className="pointer-events-none absolute inset-y-0 hidden items-center justify-center min-[1100px]:flex"
          style={{ left: effectiveSidebar, right: effectiveRight }}
          aria-hidden
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
            <img src={lampreyLogo} alt="" aria-hidden className="h-6 w-6 object-contain" />
            <span className="">Lamprey</span>
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex" style={NO_DRAG}>
          <WindowControlButton onClick={handleMinimize} title="Minimize" aria-label="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </WindowControlButton>
          <WindowControlButton
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <rect
                  x="3.5"
                  y="1.5"
                  width="7"
                  height="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <rect
                  x="1.5"
                  y="3.5"
                  width="7"
                  height="7"
                  fill="var(--bg-secondary)"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <rect
                  x="2"
                  y="2"
                  width="8"
                  height="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            )}
          </WindowControlButton>
          <WindowControlButton
            onClick={handleClose}
            title="Close"
            aria-label="Close"
            variant="close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </WindowControlButton>
        </div>
      </div>
    </div>
  )
}

interface WindowControlButtonProps {
  onClick: () => void
  title: string
  'aria-label': string
  variant?: 'default' | 'close'
  children: React.ReactNode
}

interface NavIconButtonProps {
  onClick: () => void
  title: string
  ariaLabel: string
  disabled?: boolean
  children: React.ReactNode
}

function NavIconButton({ onClick, title, ariaLabel, disabled, children }: NavIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors ${
        disabled
          ? 'cursor-not-allowed text-[var(--text-muted)] opacity-40'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

function WindowControlButton({
  onClick,
  title,
  'aria-label': ariaLabel,
  variant = 'default',
  children
}: WindowControlButtonProps) {
  const baseClass =
    'flex h-9 w-11 items-center justify-center text-[var(--text-secondary)] transition-colors'
  const hoverClass =
    variant === 'close'
      ? 'hover:bg-[var(--error)] hover:text-white'
      : 'hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`${baseClass} ${hoverClass}`}
    >
      {children}
    </button>
  )
}
