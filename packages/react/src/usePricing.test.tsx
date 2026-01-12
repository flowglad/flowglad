import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FlowgladContextProvider } from './FlowgladContext'
import { usePricing } from './index'

// Helper to create a fresh QueryClient for each test
const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

// Type for the fetch mock
type MockFetch = typeof fetch

// Create wrapper with FlowgladProvider
const createWrapper = (mockFetch: MockFetch) => {
  const queryClient = createQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <FlowgladContextProvider requestConfig={{ fetch: mockFetch }}>
        {children}
      </FlowgladContextProvider>
    </QueryClientProvider>
  )
}

describe('usePricing hook', () => {
  it('returns data.id as "pm_123" and data.name as "Pro Plan" when fetch returns valid pricing model', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          pricingModel: {
            id: 'pm_123',
            name: 'Pro Plan',
            products: [],
            usageMeters: [],
            isDefault: true,
            livemode: false,
            organizationId: 'org_1',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      }),
    }) as unknown as MockFetch

    const { result } = renderHook(() => usePricing(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.data?.id).toBe('pm_123')
    expect(result.current.data?.name).toBe('Pro Plan')
    expect(result.current.error).toBeNull()
  })

  it('returns isPending true and data null immediately after mount before fetch completes', () => {
    const mockFetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    ) as unknown as MockFetch

    const { result } = renderHook(() => usePricing(), {
      wrapper: createWrapper(mockFetch),
    })

    expect(result.current.isPending).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns error with message when fetch rejects with network error', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(
        new Error('Network request failed')
      ) as unknown as MockFetch

    const { result } = renderHook(() => usePricing(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.error?.message).toContain(
      'Network request failed'
    )
    expect(result.current.data).toBeNull()
  })

  it('returns error when fetch returns non-OK response with status 500', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: { message: 'Internal server error' },
      }),
    }) as unknown as MockFetch

    const { result } = renderHook(() => usePricing(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.error?.message).toBe(
      'Internal server error'
    )
    expect(result.current.data).toBeNull()
  })

  it('returns error when fetch returns malformed JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    }) as unknown as MockFetch

    const { result } = renderHook(() => usePricing(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(typeof result.current.error?.message).toBe('string')
    expect(result.current.data).toBeNull()
  })

  it('sets isRefetching true and keeps stale data when refetch() called after successful load', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      fetchCount++
      if (fetchCount === 1) {
        return {
          ok: true,
          json: async () => ({
            data: {
              pricingModel: {
                id: 'pm_v1',
                name: 'V1 Plan',
                products: [],
                usageMeters: [],
                isDefault: true,
                livemode: false,
                organizationId: 'org_1',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            },
          }),
        }
      }
      // Second call never resolves to keep isRefetching true
      return new Promise(() => {})
    }) as unknown as MockFetch

    const { result } = renderHook(() => usePricing(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() => expect(result.current.data?.id).toBe('pm_v1'))

    act(() => {
      result.current.refetch()
    })

    // After refetch is called, isRefetching should be true
    await waitFor(() =>
      expect(result.current.isRefetching).toBe(true)
    )

    // Stale data should still be available
    expect(result.current.data?.id).toBe('pm_v1')
  })

  it('returns FlowgladHookData shape with all required fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          pricingModel: {
            id: 'pm_test',
            name: 'Test Plan',
            products: [],
            usageMeters: [],
            isDefault: true,
            livemode: false,
            organizationId: 'org_1',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      }),
    }) as unknown as MockFetch

    const { result } = renderHook(() => usePricing(), {
      wrapper: createWrapper(mockFetch),
    })

    // Initially
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isPending')
    expect(result.current).toHaveProperty('isRefetching')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })
})
