import { expect, it } from 'vitest'
import { searchCommands } from './command-search'
import { rankWorkspaceFiles } from './file-search'
import type { AppCommand } from './app-commands'
const commands: AppCommand[] = [
  { id: 'settings.rag', label: 'Knowledge Search', aliases: ['RAG'], kind: 'settings', run: () => {} },
  { id: 'tool.review', label: 'Review', kind: 'tool', run: () => {} },
  { id: 'workflow.review', label: 'Review project', kind: 'workflow', run: () => {} }
]
it('finds familiar aliases without inspecting saved settings values', () => {
  expect(searchCommands(commands, 'rag', 'all').map(row => row.id)).toEqual(['settings.rag'])
  expect(searchCommands(commands, 'private-api-key-value', 'all')).toEqual([])
})
it('filters command kinds while retaining tools among application commands', () => {
  expect(searchCommands(commands, 'review', 'command').map(row => row.id)).toEqual(['tool.review'])
  expect(searchCommands(commands, 'review', 'workflow').map(row => row.id)).toEqual(['workflow.review'])
})
it('reuses file quick-open fuzzy ranking, including Windows paths', () => {
  expect(rankWorkspaceFiles('ex.ts', ['README.md', 'src/example.ts'])).toEqual(['src/example.ts'])
  expect(rankWorkspaceFiles('example', ['first/example.ts', 'example.ts'])[0]).toBe('example.ts')
})

it('accepts either path separator without changing the indexed file identity', () => {
  expect(rankWorkspaceFiles('first/example.ts', ['first\\example.ts'])).toEqual(['first\\example.ts'])
  expect(rankWorkspaceFiles('first\\example.ts', ['first/example.ts'])).toEqual(['first/example.ts'])
})
