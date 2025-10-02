'use client'

import { useCallback, useRef, useEffect } from 'react'
import debounce from 'debounce'

/**
 * A reusable hook that creates a stable debounced function.
 *
 * This hook ensures that:
 * - The debounced function has a stable identity across renders
 * - Inline callbacks work correctly without needing manual memoization
 * - Always calls the latest version of the callback
 * - Pending debounced calls are properly cleaned up on unmount
 * - Memory leaks are prevented by clearing timers appropriately
 *
 * @param callback The function to debounce (can be inline, doesn't need memoization)
 * @param delay The debounce delay in milliseconds
 * @returns A stable debounced version of the callback
 *
 * @example
 * ```tsx
 * function CustomerSearch() {
 *   const [searchValue, setSearchValue] = useState('')
 *   const [filters, setFilters] = useState({ status: 'active' })
 *
 *   // ✅ Inline callbacks work perfectly!
 *   const debouncedSearch = useDebounce(() => {
 *     api.searchCustomers(searchValue, filters)
 *   }, 500)
 *
 *   useEffect(() => {
 *     debouncedSearch()
 *   }, [searchValue, filters, debouncedSearch])
 *
 *   return <input value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
 * }
 * ```
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  // Store the latest callback in a ref so we always call the most recent version
  const callbackRef = useRef(callback)

  // Update ref whenever callback changes (doesn't trigger effect)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const debouncedFnRef = useRef<ReturnType<typeof debounce> | null>(
    null
  )

  // Create debounced function only once (or when delay changes)
  useEffect(() => {
    // Debounced function always calls the latest callback via ref
    debouncedFnRef.current = debounce((...args: Parameters<T>) => {
      callbackRef.current(...args)
    }, delay)

    // Cleanup on unmount or delay change
    return () => {
      if (debouncedFnRef.current) {
        debouncedFnRef.current.clear()
        debouncedFnRef.current = null
      }
    }
  }, [delay]) // Only recreate when delay changes

  return useCallback(
    ((...args: Parameters<T>) => {
      debouncedFnRef.current?.(...args)
    }) as T,
    []
  )
}
