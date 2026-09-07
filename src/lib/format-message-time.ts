const formattedByMinute = new Map<number, string>()

export function formatMessageTime(timestamp: number): string {
  const minute = Math.floor(timestamp / 60_000)
  const cached = formattedByMinute.get(minute)
  if (cached !== undefined) return cached
  const formatted = new Date(minute * 60_000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
  formattedByMinute.set(minute, formatted)
  if (formattedByMinute.size > 2_880) formattedByMinute.clear()
  return formatted
}

export function resetMessageTimeCache(): void {
  formattedByMinute.clear()
}
