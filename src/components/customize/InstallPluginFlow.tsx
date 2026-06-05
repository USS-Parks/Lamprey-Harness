import { useEffect, useMemo, useState } from 'react'
import type { PluginManifest } from '@/lib/types'
import { toast } from '@/stores/toast-store'
import { usePluginsStore } from '@/stores/plugins-store'

interface InstallPluginFlowProps {
  onClose: () => void
}

type Tab = 'directory' | 'manifest' | 'bundled'

const MANIFEST_PLACEHOLDER = `{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "One-sentence summary.",
  "version": "0.1.0",
  "category": "Custom",
  "files": {
    "skills/example.md": "---\\nname: example\\ndescription: A skill that does something useful.\\n---\\n\\nWhen invoked, do the thing."
  }
}`

export function InstallPluginFlow({ onClose }: InstallPluginFlowProps) {
  const pickDirectoryAndInstall = usePluginsStore((s) => s.pickDirectoryAndInstall)
  const [tab, setTab] = useState<Tab>('directory')
  const [manifestText, setManifestText] = useState(MANIFEST_PLACEHOLDER)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bundled, setBundled] = useState<PluginManifest[]>([])
  const [bundledLoading, setBundledLoading] = useState(false)

  useEffect(() => {
    setError(null)
  }, [manifestText, tab])

  const loadBundled = useMemo(
    () => async () => {
      if (!window.api?.plugins?.listBundledAvailable) return
      setBundledLoading(true)
      try {
        const result = await window.api.plugins.listBundledAvailable()
        if (result.success) setBundled((result.data as PluginManifest[]) ?? [])
      } finally {
        setBundledLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (tab === 'bundled') void loadBundled()
  }, [tab, loadBundled])

  const onInstallDirectory = async () => {
    setBusy(true)
    try {
      const r = await pickDirectoryAndInstall()
      if (r.ok) {
        onClose()
      } else if (r.error) {
        setError(r.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const onInstallManifest = async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(manifestText)
    } catch (err) {
      setError(`Not valid JSON: ${(err as Error).message}`)
      return
    }
    if (!parsed || typeof parsed !== 'object') {
      setError('Manifest must be a JSON object')
      return
    }
    const obj = parsed as Record<string, unknown>
    const files = (obj.files ?? undefined) as Record<string, string> | undefined
    const manifest = { ...obj }
    delete manifest.files
    setBusy(true)
    try {
      if (!window.api?.plugins?.installFromManifest) {
        setError('Plugins API missing')
        return
      }
      const result = await window.api.plugins.installFromManifest(manifest, files)
      if (result.success) {
        toast.success(`Installed plugin "${(result.data as { id?: string })?.id ?? ''}"`)
        onClose()
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const onInstallBundled = async (id: string) => {
    setBusy(true)
    try {
      if (!window.api?.plugins?.installBundled) return
      const result = await window.api.plugins.installBundled(id)
      if (result.success) {
        toast.success(`Installed bundled plugin "${id}"`)
        await loadBundled()
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[620px] w-[700px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
        <header className="flex h-12 shrink-0 items-center border-b border-[var(--border)] px-4">
          <span className="text-[14px] font-semibold text-[var(--text-primary)]">
            Install plugin
          </span>
          <div className="ml-3 flex items-center gap-1">
            {(['directory', 'manifest', 'bundled'] as const).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`rounded px-2 py-0.5 text-[12px] capitalize ${
                  tab === id
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                {id === 'directory'
                  ? 'From directory'
                  : id === 'manifest'
                    ? 'Paste manifest'
                    : 'Bundled catalog'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'directory' && (
            <div className="space-y-3">
              <p className="text-[13px] text-[var(--text-primary)]">
                Pick a directory containing a valid <code>plugin.json</code>. Lamprey will
                copy it into the plugins folder and load it immediately.
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                The directory must contain a top-level <code>plugin.json</code> with at
                least <code>id</code>, <code>name</code>, <code>description</code>, and
                <code> version</code>. Sibling <code>skills/</code>, <code>slash-commands/</code>,
                and <code>connectors.json</code> are picked up automatically.
              </p>
              <button
                onClick={() => void onInstallDirectory()}
                disabled={busy}
                className="rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Picking…' : 'Pick directory'}
              </button>
            </div>
          )}

          {tab === 'manifest' && (
            <div className="space-y-3">
              <p className="text-[12px] text-[var(--text-secondary)]">
                Paste a JSON object with the manifest fields. Optionally include a{' '}
                <code>files</code> map keyed by relative path; each value becomes a file
                under the new plugin directory (e.g. <code>skills/foo.md</code>).
              </p>
              <textarea
                value={manifestText}
                onChange={(e) => setManifestText(e.target.value)}
                spellCheck={false}
                rows={18}
                className="w-full resize-y rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2 font-mono text-[12px] leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          {tab === 'bundled' && (
            <div className="space-y-3">
              <p className="text-[12px] text-[var(--text-secondary)]">
                Bundled plugins ship with Lamprey. Anything you removed earlier appears
                here so you can re-install it without rebuilding the app.
              </p>
              {bundledLoading && (
                <div className="text-[12px] text-[var(--text-muted)]">Loading…</div>
              )}
              {!bundledLoading && bundled.length === 0 && (
                <div className="text-[12px] text-[var(--text-muted)]">
                  No bundled plugins are missing from the installed set.
                </div>
              )}
              {bundled.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">
                        {entry.name}
                      </span>
                      <span className="rounded bg-[var(--bg-tertiary)] px-1 py-0 font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                        v{entry.version}
                      </span>
                      {entry.category && (
                        <span className="rounded bg-[var(--bg-tertiary)] px-1 py-0 font-mono text-[9px] uppercase tracking-wider text-[var(--accent)]">
                          {entry.category}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                      {entry.description}
                    </p>
                  </div>
                  <button
                    onClick={() => void onInstallBundled(entry.id)}
                    disabled={busy}
                    className="shrink-0 rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-1 text-[11px] text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Install
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded border border-[var(--error)] bg-[var(--error)]/10 px-2 py-1.5 text-[11px] text-[var(--error)]">
              {error}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-[12px] hover:border-[var(--accent)]"
          >
            Close
          </button>
          <div className="flex-1" />
          {tab === 'manifest' && (
            <button
              onClick={() => void onInstallManifest()}
              disabled={busy}
              className="rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Installing…' : 'Install'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
