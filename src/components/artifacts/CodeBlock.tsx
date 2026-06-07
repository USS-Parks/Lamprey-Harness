import { useEffect, useRef, useState } from 'react'
import type { BundledLanguage, Highlighter } from 'shiki'
import { useChatStore } from '@/stores/chat-store'
import { useUiStore } from '@/stores/ui-store'

const ARTIFACT_LANGUAGES = new Set(['html', 'svg', 'mermaid', 'jsx', 'tsx', 'react'])

function detectArtifactType(code: string, lang: string): string | null {
  if (ARTIFACT_LANGUAGES.has(lang)) {
    return lang === 'react' || lang === 'jsx' || lang === 'tsx' ? 'jsx' : lang
  }
  const trimmed = code.trimStart()
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
    return 'html'
  }
  if (!lang || lang === 'javascript' || lang === 'typescript') {
    if (/\breturn\s*\(?\s*<[A-Z]/.test(code) || /<[A-Z][a-zA-Z]*[\s/>]/.test(code)) {
      return 'jsx'
    }
  }
  return null
}

let shikiPromise: Promise<Highlighter> | null = null

function getShiki(): Promise<Highlighter> {
  if (!shikiPromise) {
    shikiPromise = import('shiki').then((mod) =>
      mod.createHighlighter({
        themes: ['one-dark-pro'],
        langs: [
          'javascript',
          'typescript',
          'python',
          'rust',
          'go',
          'java',
          'c',
          'cpp',
          'csharp',
          'html',
          'css',
          'json',
          'yaml',
          'toml',
          'markdown',
          'bash',
          'shell',
          'sql',
          'jsx',
          'tsx',
          'svelte',
          'vue',
          'ruby',
          'php',
          'swift',
          'kotlin',
          'lua',
          'r',
          'dockerfile',
          'xml',
          'svg',
          'graphql',
          'diff'
        ]
      })
    ) as Promise<Highlighter>
  }
  return shikiPromise
}

interface CodeBlockProps {
  code: string
  language?: string
  sourceMessageId?: string
}

export function CodeBlock({ code, language, sourceMessageId }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLDivElement>(null)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const seedSideChat = useUiStore((s) => s.seedSideChat)

  const lang = language?.toLowerCase() ?? ''
  const detectedType = detectArtifactType(code, lang)
  const isArtifact = detectedType !== null

  useEffect(() => {
    if (isArtifact) return

    let cancelled = false
    getShiki()
      .then((highlighter) => {
        if (cancelled) return
        const supported = highlighter.getLoadedLanguages()
        const langId = supported.includes(lang as BundledLanguage) ? lang : 'text'
        const result = highlighter.codeToHtml(code, {
          lang: langId as BundledLanguage,
          theme: 'one-dark-pro'
        })
        setHtml(result)
      })
      .catch(() => {
        if (!cancelled) setHtml(null)
      })
    return () => {
      cancelled = true
    }
  }, [code, lang, isArtifact])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenArtifact = () => {
    if (!detectedType) return
    window.api?.artifact?.render(detectedType, code)
    const opener = (window as unknown as Record<string, unknown>).__openArtifact
    if (typeof opener === 'function') {
      ;(opener as (t: string, s: string) => void)(detectedType, code)
    }
  }

  const handleExtract = () => {
    if (!activeConversationId || !sourceMessageId) return
    seedSideChat({
      sourceConversationId: activeConversationId,
      sourceMessageId,
      seedKind: 'block',
      seedContent: code
    })
  }

  const actions = (
    <div className="flex items-center gap-2">
      {sourceMessageId && (
        <button
          onClick={handleExtract}
          className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        >
          Extract
        </button>
      )}
      <button
        onClick={handleCopy}
        className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )

  if (isArtifact) {
    const previewLines = code.split('\n').slice(0, 4).join('\n')
    return (
      <div className="my-2 overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--bg-primary)]">
        <div className="flex items-center justify-between border-b border-[var(--panel-border)] bg-[var(--bg-tertiary)] px-3 py-1.5">
          <span className="font-mono text-xs text-[var(--accent)]">{detectedType}</span>
          {actions}
        </div>
        <pre className="overflow-hidden px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
          <code>{previewLines}</code>
        </pre>
        <button
          onClick={handleOpenArtifact}
          className="w-full border-t border-[var(--panel-border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--bg-tertiary)]"
        >
          Open artifact
        </button>
      </div>
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--panel-border)] bg-[var(--bg-tertiary)] px-3 py-1.5">
        <span className="font-mono text-xs text-[var(--text-muted)]">{lang || 'text'}</span>
        {actions}
      </div>
      {html ? (
        <div
          ref={codeRef}
          className="overflow-x-auto text-xs [&_code]:!font-[IBM_Plex_Mono,Fira_Code,monospace] [&_pre]:!m-0 [&_pre]:!bg-[var(--bg-primary)] [&_pre]:p-3"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 font-mono text-xs text-[var(--text-secondary)]">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}
