import { renderHook, act } from '@testing-library/react'
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
import { useSearchDebounce } from '../useSearchDebounce'

describe('useSearchDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should initialize with empty values', () => {
    const { result } = renderHook(() => useSearchDebounce())

    expect(result.current.inputValue).toBe('')
    expect(result.current.searchQuery).toBe('')
    expect(typeof result.current.setInputValue).toBe('function')
    expect(typeof result.current.debouncedSetSearchQuery).toBe(
      'function'
    )
  })

  it('should update inputValue immediately', () => {
    const { result } = renderHook(() => useSearchDebounce())

    act(() => {
      result.current.setInputValue('test input')
    })

    expect(result.current.inputValue).toBe('test input')
    expect(result.current.searchQuery).toBe('') // Should still be empty before debounce
  })

  it('should debounce searchQuery updates', () => {
    const { result } = renderHook(() => useSearchDebounce(500))

    // Set input value
    act(() => {
      result.current.setInputValue('test search')
    })

    expect(result.current.inputValue).toBe('test search')
    expect(result.current.searchQuery).toBe('') // Should not update immediately

    // Fast forward time but not enough
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current.searchQuery).toBe('')

    // Complete debounce delay
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.searchQuery).toBe('test search')
  })

  it('should use default delay of 1000ms', () => {
    const { result } = renderHook(() => useSearchDebounce())

    act(() => {
      result.current.setInputValue('default delay test')
    })

    // Should not update after 999ms
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(result.current.searchQuery).toBe('')

    // Should update after 1000ms
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.searchQuery).toBe('default delay test')
  })

  it('should cancel previous debounced calls when input changes rapidly', () => {
    const { result } = renderHook(() => useSearchDebounce(1000))

    // Rapid input changes
    act(() => {
      result.current.setInputValue('first')
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    act(() => {
      result.current.setInputValue('second')
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    act(() => {
      result.current.setInputValue('third')
    })

    // Complete the debounce delay
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Should only have the last value
    expect(result.current.inputValue).toBe('third')
    expect(result.current.searchQuery).toBe('third')
  })

  it('should handle empty string inputs correctly', () => {
    const { result } = renderHook(() => useSearchDebounce(500))

    // Set a value first
    act(() => {
      result.current.setInputValue('some text')
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.searchQuery).toBe('some text')

    // Clear the input
    act(() => {
      result.current.setInputValue('')
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.inputValue).toBe('')
    expect(result.current.searchQuery).toBe('')
  })

  it('should maintain stable function references across renders', () => {
    const { result, rerender } = renderHook(() => useSearchDebounce())

    const firstSetInputValue = result.current.setInputValue
    const firstDebouncedSetSearchQuery =
      result.current.debouncedSetSearchQuery

    // Trigger re-render
    rerender()

    expect(result.current.setInputValue).toBe(firstSetInputValue)
    expect(result.current.debouncedSetSearchQuery).toBe(
      firstDebouncedSetSearchQuery
    )
  })

  it('should work with different delay configurations', () => {
    const { result: fast } = renderHook(() => useSearchDebounce(100))
    const { result: slow } = renderHook(() => useSearchDebounce(2000))

    act(() => {
      fast.current.setInputValue('fast')
      slow.current.setInputValue('slow')
    })

    // Fast should resolve after 100ms
    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(fast.current.searchQuery).toBe('fast')
    expect(slow.current.searchQuery).toBe('')

    // Slow should resolve after additional 1900ms
    act(() => {
      vi.advanceTimersByTime(1900)
    })

    expect(slow.current.searchQuery).toBe('slow')
  })

  it('should clean up properly on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useSearchDebounce(1000)
    )

    act(() => {
      result.current.setInputValue('unmount test')
    })

    // Unmount before debounce completes
    unmount()

    // This should not cause any errors or memory leaks
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Since component is unmounted, we can't check the state
    // But this test ensures no errors are thrown during cleanup
    expect(true).toBe(true) // Test passes if no errors are thrown
  })

  it('should provide backward compatibility with debouncedSetSearchQuery', () => {
    const { result } = renderHook(() => useSearchDebounce(500))

    // The deprecated function should exist for backward compatibility
    expect(typeof result.current.debouncedSetSearchQuery).toBe(
      'function'
    )

    // Test that it's marked as deprecated in types (this would be caught by TypeScript)
    // We can't test the @deprecated comment directly, but we ensure the function exists
    expect(result.current.debouncedSetSearchQuery).toBeDefined()
  })

  it('should handle special characters and unicode in search input', () => {
    const { result } = renderHook(() => useSearchDebounce(500))

    const specialInput =
      '🚀 Special chars: @#$%^&*()[]{}|\\:";\'<>?,./'

    act(() => {
      result.current.setInputValue(specialInput)
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.inputValue).toBe(specialInput)
    expect(result.current.searchQuery).toBe(specialInput)
  })
})
