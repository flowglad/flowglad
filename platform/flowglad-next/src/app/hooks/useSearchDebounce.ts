'use client'

import { useEffect, useState } from 'react'
import { useDebounce } from './useDebounce'

/**
 * A specialized hook for search functionality that provides debounced search queries.
 *
 * This hook encapsulates the common pattern used across data tables:
 * - Manages input value state (for immediate UI updates)
 * - Manages search query state (for actual API calls)
 * - Automatically debounces the conversion from input to query
 *
 * Replaces the problematic pattern:
 * ```ts
 * const [inputValue, setInputValue] = useState('')
 * const [searchQuery, setSearchQuery] = useState('')
 * const debouncedSetSearchQuery = debounce(setSearchQuery, 1000) // ❌ Recreated every render
 * ```
 *
 * With a stable, properly memoized solution.
 *
 * @param delay The debounce delay in milliseconds (default: 1000)
 * @returns Object containing input value, setter, and debounced search query
 */
export function useSearchDebounce(delay: number = 1000) {
  const [inputValue, setInputValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Create a stable debounced function that won't recreate on every render
  const debouncedSetSearchQuery = useDebounce(setSearchQuery, delay)

  // Update search query when input value changes
  useEffect(() => {
    debouncedSetSearchQuery(inputValue)
  }, [inputValue, debouncedSetSearchQuery])

  return {
    /**
     * The current input value (for immediate UI feedback)
     */
    inputValue,

    /**
     * Function to update the input value
     */
    setInputValue,

    /**
     * The debounced search query (for API calls)
     */
    searchQuery,

    // Legacy compatibility - can be removed after migration
    /**
     * @deprecated Use the returned searchQuery directly instead
     */
    debouncedSetSearchQuery,
  }
}
