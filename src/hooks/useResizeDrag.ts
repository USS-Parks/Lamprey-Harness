import { useCallback, useEffect, useRef, useState } from 'react'

export function useResizeDrag(width: number, setWidth: (width: number) => void, bounds: { min: number; max: number }) {
  const [dragging, setDragging] = useState(false)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const onResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    cleanup.current?.()
    const startX = event.clientX
    const previousCursor = document.body.style.cursor
    const move = (event: MouseEvent) => {
      setWidth(Math.max(bounds.min, Math.min(bounds.max, width + event.clientX - startX)))
    }
    const stop = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', stop)
      document.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
      document.body.style.cursor = previousCursor
      cleanup.current = null
      setDragging(false)
    }
    cleanup.current = stop
    setDragging(true)
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', stop)
    document.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
  }, [width, setWidth, bounds.min, bounds.max])

  return { dragging, onResizeStart }
}
