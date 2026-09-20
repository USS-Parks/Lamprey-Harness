// Workspace World Model Phase (WM-10) — search ledger and pruning.
//
// The belief-support pruning analog: a room searched without finding the
// object leaves its belief support; a search command re-run verbatim on an
// unchanged workspace after finding nothing is pure waste, so it returns a
// deterministic corrective result instead of executing. Safety property:
// redundancy requires (a) an EXACT command repeat, (b) the prior run found
// nothing, and (c) NO workspace write since — a re-run after any edit is
// legitimate and always executes. Extends CR-9's zero-match escalation
// with the covered/uncovered scope summary.

import { readdirSync } from 'fs'
import {
  getLastWriteAt,
  getSearches,
  recordSearch,
  type SearchRecord
} from './workspace-world-model'

const SEARCH_HEADS = new Set(['grep', 'rg', 'egrep', 'fgrep', 'findstr', 'select-string'])

/** Single-segment grep-family command → its normalized identity, else null. */
export function identifySearchCommand(command: string): { key: string } | null {
  if (/[;|&]|\n/.test(command) || />/.test(command)) return null
  const tokens = command.trim().split(/\s+/)
  if (tokens.length < 2) return null
  const head = (tokens[0].split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '')
  if (!SEARCH_HEADS.has(head)) return null
  return { key: command.trim().replace(/\s+/g, ' ') }
}

export interface SearchGateResult {
  redundant: boolean
  message?: string
}

const ZERO_MATCH_LEDGER_THRESHOLD = 3
const LEDGER_LINE_CAP = 10

function zeroMatchesSinceLastWrite(conversationId: string): SearchRecord[] {
  const lastWrite = getLastWriteAt(conversationId) ?? 0
  return getSearches(conversationId).filter((s) => s.hits === 0 && s.at > lastWrite)
}

function uncoveredTopLevelDirs(workspaceRoot: string, searched: SearchRecord[]): string[] {
  let entries: string[]
  try {
    entries = readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => e.name)
  } catch {
    return []
  }
  const mentioned = searched.map((s) => `${s.query} ${s.scope}`).join(' ')
  return entries.filter((d) => !mentioned.includes(d)).slice(0, 12)
}

/**
 * Gate a shell search command. Redundant repeats return the corrective
 * message; everything else passes (and gets recorded post-run).
 */
export function checkSearchRedundancy(
  conversationId: string,
  command: string,
  workspaceRoot: string
): SearchGateResult {
  const id = identifySearchCommand(command)
  if (!id) return { redundant: false }
  const lastWrite = getLastWriteAt(conversationId) ?? 0
  const prior = getSearches(conversationId).filter(
    (s) => s.query === id.key && s.at > lastWrite
  )
  const priorZero = prior.filter((s) => s.hits === 0)
  if (priorZero.length === 0) return { redundant: false }

  const zeroLedger = zeroMatchesSinceLastWrite(conversationId)
  const ledgerLines = zeroLedger
    .slice(-LEDGER_LINE_CAP)
    .map((s) => `- "${s.query}" → 0 matches`)
  const uncovered = uncoveredTopLevelDirs(workspaceRoot, getSearches(conversationId))
  const escalate = zeroLedger.length >= ZERO_MATCH_LEDGER_THRESHOLD

  const message = JSON.stringify({
    error: 'redundant_search',
    reason:
      'This exact search already ran on the unchanged workspace and found nothing. ' +
      'It was NOT re-executed.',
    searches_since_last_edit: ledgerLines,
    ...(uncovered.length > 0 ? { top_level_dirs_not_yet_searched: uncovered } : {}),
    hint: escalate
      ? 'Three or more searches found nothing. Try a different term, search one of the ' +
        'unsearched directories, or ask the user where to look (ask_user_question).'
      : 'Vary the search term or scope instead of repeating it.'
  })
  return { redundant: true, message }
}

/** Record a completed shell search's outcome for the ledger. */
export function recordSearchCommandOutcome(
  conversationId: string,
  command: string,
  foundMatches: boolean
): void {
  const id = identifySearchCommand(command)
  if (!id) return
  recordSearch(conversationId, id.key, '', foundMatches ? 1 : 0)
}
