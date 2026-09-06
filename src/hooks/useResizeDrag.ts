import { useCallback, useEffect, useRef, useState } from 'react'

export function useResizeDrag(width: number, setWidth: (width: number) => void, bounds: { min: number; max: number }, options: { axis?: 'x' | 'y'; direction?: 1 | -1 } = {}) {
  const { axis = 'x', direction = 1 } = options
  const [dragging, setDragging] = useState(false)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const onResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    cleanup.current?.()
    const start = axis === 'x' ? event.clientX : event.clientY
    const previousCursor = document.body.style.cursor
    const move = (event: MouseEvent) => {
      setWidth(Math.max(bounds.min, Math.min(bounds.max, width + ((axis === 'x' ? event.clientX : event.clientY) - start) * direction)))
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
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', stop)
    document.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
  }, [width, setWidth, bounds.min, bounds.max, axis, direction])

  return { dragging, onResizeStart }
}
