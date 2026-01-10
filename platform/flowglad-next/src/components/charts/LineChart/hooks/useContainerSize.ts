import { useEffect, useRef, useState } from 'react'

interface ContainerSize {
  width: number
  height: number
}

/**
 * Hook to track container dimensions using ResizeObserver.
 * Returns a ref to attach to the container and the current width/height.
 *
 * @returns Object with containerRef, width, and height
 *
 * @example
 * const { containerRef, width, height } = useContainerSize()
 *
 * return (
 *   <div ref={containerRef}>
 *     Container is {width}x{height}
 *   </div>
 * )
 */
export function useContainerSize() {
  const [size, setSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
  })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return { containerRef, ...size }
}
