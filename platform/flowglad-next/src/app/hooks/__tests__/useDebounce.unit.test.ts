import { renderHook, act } from '@testing-library/react'
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
import { useDebounce } from '../useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should create a debounced function', () => {
    const mockCallback = vi.fn()
    const { result } = renderHook(() =>
      useDebounce(mockCallback, 1000)
    )

    expect(typeof result.current).toBe('function')
    expect(mockCallback).not.toHaveBeenCalled()
  })

  it('should debounce function calls properly', () => {
    const mockCallback = vi.fn()
    const { result } = renderHook(() =>
      useDebounce(mockCallback, 1000)
    )

    // Call the debounced function multiple times rapidly
    act(() => {
      result.current('first')
      result.current('second')
      result.current('third')
    })

    // Should not have called the original function yet
    expect(mockCallback).not.toHaveBeenCalled()

    // Fast-forward time by 999ms (just before debounce delay)
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(mockCallback).not.toHaveBeenCalled()

    // Fast-forward time by 1ms more (completing debounce delay)
    act(() => {
      vi.advanceTimersByTime(1)
    })

    // Should have called the original function once with the last value
    expect(mockCallback).toHaveBeenCalledTimes(1)
    expect(mockCallback).toHaveBeenLastCalledWith('third')
  })

  it('should maintain stable function identity across renders', () => {
    const mockCallback = vi.fn()
    const { result, rerender } = renderHook(() =>
      useDebounce(mockCallback, 1000)
    )

    const firstInstance = result.current

    // Trigger a re-render
    rerender()
    const secondInstance = result.current

    // Function should maintain the same identity
    expect(firstInstance).toBe(secondInstance)
  })

  it('should clean up pending calls when callback changes', () => {
    const mockCallback1 = vi.fn()
    const mockCallback2 = vi.fn()

    const { result, rerender } = renderHook(
      ({ callback }) => useDebounce(callback, 1000),
      { initialProps: { callback: mockCallback1 } }
    )

    // Call the debounced function
    act(() => {
      result.current('test1')
    })

    // Change the callback before delay completes
    rerender({ callback: mockCallback2 })

    // Complete the original delay
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Original callback should not have been called
    expect(mockCallback1).not.toHaveBeenCalled()

    // New debounced function should work with new callback
    act(() => {
      result.current('test2')
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mockCallback2).toHaveBeenCalledWith('test2')
  })

  it('should clean up on unmount', () => {
    const mockCallback = vi.fn()
    const { result, unmount } = renderHook(() =>
      useDebounce(mockCallback, 1000)
    )

    // Call the debounced function
    act(() => {
      result.current('test')
    })

    // Unmount before delay completes
    unmount()

    // Complete the delay
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Callback should not have been called after unmount
    expect(mockCallback).not.toHaveBeenCalled()
  })

  it('should handle different delay values', () => {
    const mockCallback = vi.fn()

    const { result: result500 } = renderHook(() =>
      useDebounce(mockCallback, 500)
    )

    const { result: result1500 } = renderHook(() =>
      useDebounce(mockCallback, 1500)
    )

    act(() => {
      result500.current('fast')
      result1500.current('slow')
    })

    // Fast forward 500ms
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(mockCallback).toHaveBeenCalledWith('fast')
    expect(mockCallback).not.toHaveBeenCalledWith('slow')

    // Fast forward another 1000ms
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mockCallback).toHaveBeenCalledWith('slow')
    expect(mockCallback).toHaveBeenCalledTimes(2)
  })

  it('should handle multiple arguments correctly', () => {
    const mockCallback = vi.fn()
    const { result } = renderHook(() =>
      useDebounce(mockCallback, 1000)
    )

    act(() => {
      result.current('arg1', 'arg2', 'arg3')
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mockCallback).toHaveBeenCalledWith('arg1', 'arg2', 'arg3')
  })

  it('should work with dependency array', () => {
    const mockCallback1 = vi.fn()
    const mockCallback2 = vi.fn()

    const { result, rerender } = renderHook(
      ({ dep }) =>
        useDebounce(
          dep === 'a' ? mockCallback1 : mockCallback2,
          1000,
          [dep]
        ),
      { initialProps: { dep: 'a' } }
    )

    act(() => {
      result.current('test')
    })

    // Change dependency before delay completes
    rerender({ dep: 'b' })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Should use new callback due to dependency change
    expect(mockCallback1).not.toHaveBeenCalled()

    // Test new callback works
    act(() => {
      result.current('test2')
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mockCallback2).toHaveBeenCalledWith('test2')
  })
})
