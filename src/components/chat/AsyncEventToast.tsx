import { useEffect } from 'react'
import { presentAsyncNotification } from '@/lib/async-notifications'
/** One primary presentation per durable event ID, with task-local history. */
export function AsyncEventToast() {
  useEffect(() => {
    if (!window.api?.chat?.onAsyncEvent) return
    return window.api.chat.onAsyncEvent(presentAsyncNotification)
  }, [])
  return null
}
