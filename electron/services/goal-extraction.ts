// Workspace World Model Phase (WM-7) — task understanding.
//
// The GAVEL adapter analog without training: decompose the instruction
// into subtasks and TYPED, deterministically checkable goal predicates.
// A deterministic fast-path extracts file targets straight from the
// instruction text; predicate extraction uses ONE schema-validated
// structured call to the extraction model (default: the conversation's
// model), retried once on schema failure, then degraded honestly to a
// no-predicate extraction. Extraction failures never block a turn.
//
// The predicate vocabulary here is THE predicate engine: the goal ledger
// (WM-8), follow-through (WM-9), and the bench runner (WM-15) all evaluate
// the same shapes, so the bench measures the product mechanism.

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export type GoalPredicate =
  | { kind: 'file-exists'; path: string }
  | { kind: 'file-absent'; path: string }
  | { kind: 'file-contains'; path: string; needle: string }
  | { kind: 'file-not-contains'; path: string; needle: string }
  | { kind: 'command-succeeds'; command: string }

export interface ExtractedSubtask {
  title: string
  /** Files/paths the subtask is about, when the instruction names them. */
  targets: string[]
  predicates: GoalPredicate[]
}

export interface GoalExtraction {
  subtasks: ExtractedSubtask[]
  source: 'deterministic' | 'model' | 'degraded'
}

/** chatOnce-compatible seam so tests inject a fake model. */
export type ExtractionModelCall = (
  messages: ChatCompletionMessageParam[],
  modelId: string,
  signal?: AbortSignal
) => Promise<{ content: string }>

const MUTATING_VERBS =
  /\b(fix|add|create|implement|refactor|update|write|remove|delete|rename|build|make|change|edit|patch|convert|migrate|replace|extract|move|split|merge|install|set up|setup|wire|hook up|clean up|correct|apply)\b/i

const FILE_TOKEN = /\b[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|txt|css|html|py|rs|go|java|yml|yaml|toml|sh|ps1|sql|csv)\b/g

/**
 * Cheap intent gate: goal extraction only earns its model call on turns
 * that look like they want workspace changes. Questions and short chatter
 * skip it entirely.
 */
export function looksMutatingIntent(prompt: string): boolean {
  const p = prompt.trim()
  if (p.length < 12) return false
  if (p.endsWith('?') && !MUTATING_VERBS.test(p)) return false
  return MUTATING_VERBS.test(p) || FILE_TOKEN.test(p)
}

/** Deterministic fast-path: file mentions become subtask targets. */
export function extractDeterministic(prompt: string): GoalExtraction {
  const targets = [...new Set(prompt.match(FILE_TOKEN) ?? [])]
  return {
    subtasks: [
      {
        title: prompt.trim().slice(0, 120),
        targets,
        predicates: []
      }
    ],
    source: 'deterministic'
  }
}

const EXTRACTION_SYSTEM = [
  'You extract verifiable goals from a coding instruction. Reply with ONE JSON object, nothing else:',
  '{"subtasks":[{"title":"...","targets":["path/like/this.ts"],"predicates":[',
  '  {"kind":"file-exists","path":"..."} |',
  '  {"kind":"file-absent","path":"..."} |',
  '  {"kind":"file-contains","path":"...","needle":"exact text"} |',
  '  {"kind":"file-not-contains","path":"...","needle":"exact text"} |',
  '  {"kind":"command-succeeds","command":"npm test"}',
  ']}]}',
  'Rules: split independent asks into separate subtasks (max 6). Only include a',
  'predicate when the instruction makes it CERTAIN — an uncertain goal gets no',
  'predicate. targets list the files the subtask is about when named or clearly',
  'implied; empty otherwise. Never invent paths.'
].join('\n')

const MAX_SUBTASKS = 6
const MAX_PREDICATES_PER_SUBTASK = 8

function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

export function parseExtractionReply(text: string): ExtractedSubtask[] | null {
  const obj = extractJsonObject(text)
  if (!obj || typeof obj !== 'object') return null
  const subtasksRaw = (obj as { subtasks?: unknown }).subtasks
  if (!Array.isArray(subtasksRaw) || subtasksRaw.length === 0) return null
  const subtasks: ExtractedSubtask[] = []
  for (const s of subtasksRaw.slice(0, MAX_SUBTASKS)) {
    if (!s || typeof s !== 'object') return null
    const title = (s as { title?: unknown }).title
    if (typeof title !== 'string' || title.trim() === '') return null
    const targetsRaw = (s as { targets?: unknown }).targets
    const targets = Array.isArray(targetsRaw)
      ? targetsRaw.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : []
    const predsRaw = (s as { predicates?: unknown }).predicates
    const predicates: GoalPredicate[] = []
    if (Array.isArray(predsRaw)) {
      for (const p of predsRaw.slice(0, MAX_PREDICATES_PER_SUBTASK)) {
        const parsed = parsePredicate(p)
        if (parsed === undefined) return null // malformed predicate = schema failure
        if (parsed !== null) predicates.push(parsed)
      }
    }
    subtasks.push({ title: title.trim().slice(0, 200), targets, predicates })
  }
  return subtasks
}

/** undefined = malformed (schema failure); null = unknown kind (dropped). */
function parsePredicate(p: unknown): GoalPredicate | null | undefined {
  if (!p || typeof p !== 'object') return undefined
  const kind = (p as { kind?: unknown }).kind
  const path = (p as { path?: unknown }).path
  const needle = (p as { needle?: unknown }).needle
  const command = (p as { command?: unknown }).command
  switch (kind) {
    case 'file-exists':
    case 'file-absent':
      return typeof path === 'string' && path.trim() !== ''
        ? { kind, path: path.trim() }
        : undefined
    case 'file-contains':
    case 'file-not-contains':
      return typeof path === 'string' && path.trim() !== '' &&
        typeof needle === 'string' && needle !== ''
        ? { kind, path: path.trim(), needle }
        : undefined
    case 'command-succeeds':
      return typeof command === 'string' && command.trim() !== ''
        ? { kind, command: command.trim() }
        : undefined
    default:
      return null
  }
}

/**
 * Full extraction: one structured model call, one retry on schema failure,
 * then honest degradation to the deterministic extraction.
 */
export async function extractGoals(
  prompt: string,
  modelId: string,
  call: ExtractionModelCall,
  signal?: AbortSignal
): Promise<GoalExtraction> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: EXTRACTION_SYSTEM },
    { role: 'user', content: prompt.slice(0, 8000) }
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await call(messages, modelId, signal)
      const subtasks = parseExtractionReply(reply.content)
      if (subtasks) return { subtasks, source: 'model' }
      messages.push({ role: 'assistant', content: reply.content })
      messages.push({
        role: 'user',
        content: 'That was not valid per the schema. Reply with ONLY the JSON object.'
      })
    } catch {
      break
    }
  }
  return { ...extractDeterministic(prompt), source: 'degraded' }
}
