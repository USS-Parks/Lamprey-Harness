import { randomUUID } from 'crypto'
import type { StoredDocument } from './conversation-store'

// Conservative fallback that runs against the final assistant body BEFORE the
// row is persisted. The contract tells the model to call `create_document` for
// every deliverable — this is the safety net for the cases where the model
// pasted a fenced block with a filename hint instead. We only convert spans
// where intent is unambiguous so casual snippets in conversational replies
// stay inline.
//
// Detection rules (ALL must hold per candidate):
//   1) A fenced code block.
//   2) A filename hint co-located with the fence — either on the fence line
//      itself (```lang:name.ext  / ```lang name.ext) OR inside the first
//      content line as a comment (// path/foo.ts, # foo.py, /* foo.css */),
//      OR the markdown line immediately above the fence is a heading
//      pointing at the file ("## foo.py", "### `Dockerfile`").
//   3) ≥ MIN_FENCE_LINES content lines (the threshold below). A 3-line
//      snippet is conversation, not a deliverable.
//   4) The hinted name has a recognized extension (Object-Oriented enough
//      list below — the long-tail still flows through create_document).
//
// We do NOT strip extracted blocks from the body — the safety net is
// additive. The user sees the chat content AND the card. This avoids
// surprising body rewrites if our heuristic ever misfires.

const MIN_FENCE_LINES = 15

const EXTENSION_MIME: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  jsonc: 'application/json',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/x-toml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  xml: 'application/xml',
  css: 'text/css',
  scss: 'text/x-scss',
  ts: 'text/x-typescript',
  tsx: 'text/x-typescript',
  js: 'application/javascript',
  jsx: 'application/javascript',
  mjs: 'application/javascript',
  cjs: 'application/javascript',
  py: 'text/x-python',
  rb: 'text/x-ruby',
  go: 'text/x-go',
  rs: 'text/x-rust',
  java: 'text/x-java',
  kt: 'text/x-kotlin',
  swift: 'text/x-swift',
  c: 'text/x-c',
  h: 'text/x-c',
  cpp: 'text/x-c++',
  cc: 'text/x-c++',
  hpp: 'text/x-c++',
  cs: 'text/x-csharp',
  php: 'application/x-httpd-php',
  sh: 'application/x-sh',
  bash: 'application/x-sh',
  zsh: 'application/x-sh',
  ps1: 'application/x-powershell',
  sql: 'text/x-sql',
  dockerfile: 'text/x-dockerfile',
  env: 'text/plain',
  ini: 'text/x-ini',
  log: 'text/plain'
}

const FILENAME_LINE_RE = /^[\s/#*-]*([\w./@-]+\.[A-Za-z0-9]{1,8})\s*\*?\/?$/
const HEADING_LINE_RE = /^#{1,6}\s+`?([\w./@-]+\.[A-Za-z0-9]{1,8})`?\s*$/
const FENCE_FILE_RE = /^```([a-zA-Z0-9_+.-]*)[:\s]+`?([\w./@-]+\.[A-Za-z0-9]{1,8})`?\s*$/
const BAREWORD_DOCKERFILE = /^[\s/#*-]*`?(Dockerfile|Makefile|Procfile|Justfile|Gemfile|Rakefile)`?\s*$/

function extensionFor(name: string): string | null {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : null
  if (ext && EXTENSION_MIME[ext]) return ext
  // Bareword filenames map by their lowercase name (Dockerfile → dockerfile).
  const lower = name.toLowerCase()
  if (EXTENSION_MIME[lower]) return lower
  return null
}

function mimeFor(name: string): string | null {
  const key = extensionFor(name)
  return key ? EXTENSION_MIME[key] : null
}

interface ExtractedDocument {
  name: string
  mimeType: string
  content: string
}

/**
 * Scan the assistant body for fenced blocks with a filename hint. Returns one
 * ExtractedDocument per qualifying block. Conservative — returns [] when no
 * unambiguous deliverable is present. The caller decides whether to convert
 * them into StoredDocuments (see {@link buildFallbackDocuments}).
 */
export function extractDocumentsFromBody(body: string): ExtractedDocument[] {
  if (!body || typeof body !== 'string') return []
  const lines = body.split('\n')
  const out: ExtractedDocument[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fenceMatch = /^```([a-zA-Z0-9_+.-]*)\s*(.*)$/.exec(line)
    if (!fenceMatch) {
      i++
      continue
    }
    const language = (fenceMatch[1] || '').toLowerCase()
    const rest = (fenceMatch[2] || '').trim()
    let hintedName: string | null = null

    // Form 1: ```lang:name.ext  or  ```lang name.ext
    const fenceFileMatch = FENCE_FILE_RE.exec(line.replace(/:\s*/, ' '))
    if (fenceFileMatch) hintedName = fenceFileMatch[2]
    else if (rest && /\.[A-Za-z0-9]{1,8}$/.test(rest)) hintedName = rest

    // Form 2: heading above
    if (!hintedName && i > 0) {
      // Allow one blank line between heading and fence.
      let above = lines[i - 1]
      if (above.trim() === '' && i >= 2) above = lines[i - 2]
      const headingMatch = HEADING_LINE_RE.exec(above)
      if (headingMatch) hintedName = headingMatch[1]
      else {
        const barewordHeading = /^#{1,6}\s+`?(Dockerfile|Makefile|Procfile|Justfile|Gemfile|Rakefile)`?\s*$/.exec(above)
        if (barewordHeading) hintedName = barewordHeading[1]
      }
    }

    // Walk to closing fence, collecting the body. The first content line is
    // also probed for an embedded filename comment when no other hint landed.
    const startContentIdx = i + 1
    let j = startContentIdx
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++
    const closingIdx = j
    const block = lines.slice(startContentIdx, closingIdx)

    if (!hintedName && block.length > 0) {
      const first = block[0]
      const firstNameMatch = FILENAME_LINE_RE.exec(first)
      if (firstNameMatch) hintedName = firstNameMatch[1]
      else if (BAREWORD_DOCKERFILE.test(first)) {
        hintedName = BAREWORD_DOCKERFILE.exec(first)![1]
      }
    }

    // Qualify the candidate.
    if (
      hintedName &&
      block.length >= MIN_FENCE_LINES &&
      // ignore obviously diff-like blocks — those are review/discussion, not a file
      !/^[-+]{3} /.test(block[0] ?? '') &&
      !/^diff --git/.test(block[0] ?? '')
    ) {
      const mime = mimeFor(hintedName) ?? (language ? guessMimeFromLanguage(language) : null)
      if (mime) {
        const content = block.join('\n')
        out.push({
          name: sanitizeName(hintedName),
          mimeType: mime,
          content
        })
      }
    }

    i = closingIdx + 1
  }

  return out
}

function guessMimeFromLanguage(lang: string): string | null {
  switch (lang) {
    case 'typescript':
    case 'ts':
    case 'tsx':
      return 'text/x-typescript'
    case 'javascript':
    case 'js':
    case 'jsx':
      return 'application/javascript'
    case 'python':
    case 'py':
      return 'text/x-python'
    case 'markdown':
    case 'md':
      return 'text/markdown'
    case 'html':
      return 'text/html'
    case 'json':
      return 'application/json'
    case 'yaml':
    case 'yml':
      return 'text/yaml'
    case 'sql':
      return 'text/x-sql'
    case 'bash':
    case 'sh':
    case 'shell':
      return 'application/x-sh'
    case 'dockerfile':
      return 'text/x-dockerfile'
    default:
      return null
  }
}

function sanitizeName(raw: string): string {
  // Strip any leading path components — the card displays a filename only.
  const last = raw.split(/[\\/]/).pop() ?? raw
  return last.slice(0, 200)
}

/**
 * Convert {@link extractDocumentsFromBody} output into StoredDocument shape.
 * Only used when the assistant turn produced ZERO model-emitted documents —
 * if the model already called create_document we trust its judgment about
 * what to surface and what to keep inline.
 */
export function buildFallbackDocuments(body: string): StoredDocument[] {
  const candidates = extractDocumentsFromBody(body)
  if (candidates.length === 0) return []
  const now = Date.now()
  return candidates.map((c) => ({
    id: randomUUID(),
    name: c.name,
    mimeType: c.mimeType,
    content: c.content,
    sizeBytes: Buffer.byteLength(c.content, 'utf8'),
    createdAt: now
  }))
}
