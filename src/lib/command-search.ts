import type { AppCommand } from './app-commands'
export type CommandFilter = 'all' | 'command' | 'task' | 'file' | 'settings' | 'workflow'
export function searchCommands(commands: AppCommand[], query: string, filter: CommandFilter): AppCommand[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return commands.filter(command => {
    if (filter !== 'all' && command.kind !== filter && !(filter === 'command' && command.kind === 'tool')) return false
    const haystack = [command.label, ...(command.aliases ?? [])].join(' ').toLowerCase()
    return terms.every(term => haystack.includes(term))
  }).sort((a, b) => Number(b.label.toLowerCase().startsWith(query.toLowerCase().trim())) - Number(a.label.toLowerCase().startsWith(query.toLowerCase().trim())))
}
