import { useUiStore } from '@/stores/ui-store'
import { Fragment, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { autolinkText, parseFileLink } from '@/lib/path-autolink'
import '@/styles/markdown.css'

interface MarkdownRendererProps {
  content: string
  sourceMessageId?: string
}

// Fluidity J10: turn bare `path/file.ext[:line]` references in prose into
// clickable links routed through the existing workspace file action.
// Walks the children of prose-level components (p / li / td / strong / em
// / blockquote) and replaces string segments with autolinked variants.
// Text inside `<code>` / `<pre>` is not touched — those components are
// rendered by the CodeBlock / inline-code overrides without going through
// this transformer.
function transformChildren(children: ReactNode): ReactNode {
  if (children === null || children === undefined || children === false) return children
  if (typeof children === 'number' || typeof children === 'boolean') return children
  if (typeof children === 'string') {
    const segs = autolinkText(children)
    if (segs.length === 0) return children
    if (segs.length === 1 && segs[0].kind === 'text') return segs[0].value
    return (
      <>
        {segs.map((s, i) =>
          s.kind === 'text' ? (
            <Fragment key={i}>{s.value}</Fragment>
          ) : (
            <FileRefSpan key={i} path={s.path} line={s.line}>
              {s.raw}
            </FileRefSpan>
          )
        )}
      </>
    )
  }
  if (Array.isArray(children)) {
    return children.map((c, i) => (
      <Fragment key={i}>{transformChildren(c)}</Fragment>
    ))
  }
  // React element / fragment — leave the element alone; its own children
  // get walked when that component renders (we override the same set).
  return children
}

function openFileRef(path: string, line?: number): void {
  useUiStore.getState().requestOpenFile(path, line)
}

function FileRefSpan({
  path,
  line,
  children
}: {
  path: string
  line?: number
  children: ReactNode
}) {
  return (
    <span
      role="link"
      tabIndex={0}
      data-file-ref={path}
      data-file-line={line}
      onClick={(e) => {
        e.stopPropagation()
        openFileRef(path, line)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openFileRef(path, line)
        }
      }}
      title={line ? `Open ${path} at line ${line}` : `Open ${path}`}
      className="cursor-pointer underline decoration-[var(--text-muted)] decoration-dotted underline-offset-2 transition-colors hover:decoration-[var(--accent)] hover:text-[var(--accent)]"
    >
      {children}
    </span>
  )
}

export function MarkdownRenderer({ content, sourceMessageId }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={href => parseFileLink(href) || href.startsWith('artifact://research/') ? href : defaultUrlTransform(href)}
        components={{
          pre({ children }) {
            return <>{children}</>
          },

          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const codeStr = String(children).replace(/\n$/, '')

            if (match) {
              return <CodeBlock code={codeStr} language={match[1]} sourceMessageId={sourceMessageId} />
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },

          a({ href, children }) {
            const handleClick = (e: React.MouseEvent) => {
              e.preventDefault()
              if (!href) return
              // D11 — `artifact://research/<filename>` links route the
              // markdown report into the right-panel via the standard
              // artifact channel. Falls back to opening the URL externally
              // if the research API is missing.
              if (href.startsWith('artifact://research/')) {
                const filename = href.replace(/^artifact:\/\/research\//, '')
                const w = window as unknown as {
                  api?: { research?: { read?: (f: string) => Promise<{ success: boolean; data?: { content: string } }> } }
                  __openArtifact?: (type: string, source: string) => void
                }
                if (w.api?.research?.read && w.__openArtifact) {
                  void w.api.research
                    .read(filename)
                    .then((r) => {
                      if (r.success && r.data) {
                        w.__openArtifact?.('markdown', r.data.content)
                      }
                    })
                    .catch((err) => console.warn('[MarkdownRenderer] research:read failed', err))
                  return
                }
              }
              const local = parseFileLink(href)
              if (local) {
                openFileRef(local.path, local.line)
                return
              }
              if (window.api?.artifact?.openExternal) {
                window.api.artifact.openExternal(href)
              } else {
                window.open(href, '_blank')
              }
            }
            return (
              <a href={href} onClick={handleClick}>
                {children}
              </a>
            )
          },

          table({ children }) {
            return (
              <div className="markdown-table-wrapper">
                <table>{children}</table>
              </div>
            )
          },

          blockquote({ children }) {
            return <blockquote>{transformChildren(children)}</blockquote>
          },

          // Fluidity J10: prose-level wrappers run their children through
          // the autolink transformer. `code` (inline) and `pre` paths
          // bypass this — they render via the overrides above.
          p({ children }) {
            return <p>{transformChildren(children)}</p>
          },
          li({ children }) {
            return <li>{transformChildren(children)}</li>
          },
          td({ children }) {
            return <td>{transformChildren(children)}</td>
          },
          th({ children }) {
            return <th>{transformChildren(children)}</th>
          },
          strong({ children }) {
            return <strong>{transformChildren(children)}</strong>
          },
          em({ children }) {
            return <em>{transformChildren(children)}</em>
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
