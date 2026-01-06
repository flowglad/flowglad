import { RefObject, useCallback, useEffect } from 'react'

/**
 * Hook that triggers a callback when a click occurs outside the referenced element.
 * Commonly used for dismissing dropdowns, popovers, and expandable menus.
 *
 * @param ref - React ref to the element that defines the "inside" boundary
 * @param handler - Callback function to execute when clicking outside
 * @param enabled - Whether the click-outside detection is active (default: true)
 *
 * @example
 * ```tsx
 * const menuRef = useRef<HTMLDivElement>(null)
 * const [isOpen, setIsOpen] = useState(false)
 *
 * useClickOutside(menuRef, () => setIsOpen(false), isOpen)
 *
 * return (
 *   <div ref={menuRef}>
 *     {isOpen && <MenuContent />}
 *   </div>
 * )
 * ```
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  enabled: boolean = true
) {
  const handleClick = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (
        ref.current &&
        !ref.current.contains(event.target as Node)
      ) {
        handler()
      }
    },
    [ref, handler]
  )

  useEffect(() => {
    if (!enabled) return

    // Use mousedown for immediate feedback (before click completes)
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchend', handleClick)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchend', handleClick)
    }
  }, [handleClick, enabled])
}
