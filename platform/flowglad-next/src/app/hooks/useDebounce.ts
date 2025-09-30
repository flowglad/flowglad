'use client'

import { useCallback, useRef, useEffect } from 'react'
import debounce from 'debounce'

/**
 * A reusable hook that creates a stable debounced function.
 *
 * This hook ensures that:
 * - The debounced function has a stable identity across renders
 * - Pending debounced calls are properly cleaned up on unmount or dependency changes
 * - Memory leaks are prevented by clearing timers appropriately
 *
 * @param callback The function to debounce
 * @param delay The debounce delay in milliseconds
 * @param deps Optional dependency array (similar to useCallback)
 * @returns A stable debounced version of the callback
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps?: React.DependencyList
): T {
  const debouncedFnRef = useRef<ReturnType<typeof debounce> | null>(
    null
  )

  useEffect(() => {
    // Create debounced function
    debouncedFnRef.current = debounce(callback, delay)

    // Cleanup on unmount or dependency change
    return () => {
      if (debouncedFnRef.current) {
        debouncedFnRef.current.clear()
        debouncedFnRef.current = null
      }
    }
  }, [callback, delay, ...(deps || [])])

  return useCallback(
    ((...args: Parameters<T>) => {
      debouncedFnRef.current?.(...args)
    }) as T,
    []
  )
}
