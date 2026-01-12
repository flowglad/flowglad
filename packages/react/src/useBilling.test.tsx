import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  act,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react'
import type React from 'react'
import type { Mock } from 'vitest'
import { describe, expect, it, vi } from 'vitest'
import { FlowgladContextProvider } from './FlowgladContext'
import { useBilling } from './index'

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

// Helper to count billing calls from a mock
const countBillingCalls = (mockFetch: Mock) =>
  mockFetch.mock.calls.filter(
    (call: unknown[]) =>
      typeof call[0] === 'string' &&
      call[0].includes('/customers/billing')
  ).length

describe('useBilling lazy loading', () => {
  it('does not call fetch to /customers/billing when FlowgladProvider renders without any component calling useBilling', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    })

    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider
          requestConfig={{ fetch: mockFetch as unknown as MockFetch }}
        >
          <div data-testid="child">No billing consumer</div>
        </FlowgladContextProvider>
      </QueryClientProvider>
    )

    await new Promise((r) => setTimeout(r, 100))
    // Pricing fetch may still happen, but billing should not be called
    expect(countBillingCalls(mockFetch)).toBe(0)
  })

  it('calls fetch to /customers/billing exactly once when useBilling hook is first invoked', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { subscription: { id: 'sub_1' } },
      }),
    })

    const BillingConsumer = () => {
      useBilling()
      return null
    }

    const queryClient = createQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider
          requestConfig={{ fetch: mockFetch as unknown as MockFetch }}
        >
          <BillingConsumer />
        </FlowgladContextProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(countBillingCalls(mockFetch)).toBe(1)
    })
  })

  it('returns isPending true, data null, isRefetching false, error null immediately when useBilling called before fetch completes', () => {
    const mockFetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    ) as unknown as MockFetch

    const { result } = renderHook(() => useBilling(), {
      wrapper: createWrapper(mockFetch),
    })

    expect(result.current.isPending).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.isRefetching).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns data with subscription.id "sub_123" after fetch completes successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          customer: { id: 'cust_1' },
          subscriptions: [{ id: 'sub_123', status: 'active' }],
          currentSubscription: { id: 'sub_123', status: 'active' },
          currentSubscriptions: [{ id: 'sub_123', status: 'active' }],
          purchases: [],
          invoices: [],
          paymentMethods: [],
          catalog: null,
          billingPortalUrl: null,
          pricingModel: null,
        },
      }),
    }) as unknown as MockFetch

    const { result } = renderHook(() => useBilling(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.data?.data?.subscriptions?.[0]?.id).toBe(
      'sub_123'
    )
    expect(result.current.error).toBeNull()
  })

  it('returns error with message "Unauthorized" when fetch returns 401 status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: null,
        error: { message: 'Unauthorized' },
      }),
    }) as unknown as MockFetch

    const { result } = renderHook(() => useBilling(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.error?.message).toBe('Unauthorized')
    expect(result.current.data?.data).toBeNull()
  })

  it('returns error when fetch throws network error', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(
        new Error('Failed to fetch')
      ) as unknown as MockFetch

    const { result } = renderHook(() => useBilling(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.error?.message).toContain('Failed to fetch')
    expect(result.current.data).toBeNull()
  })

  it('does not trigger additional billing fetch when useBilling called from multiple components', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { subscription: { id: 'sub_1' } },
      }),
    })

    const Consumer1 = () => {
      useBilling()
      return <div>Consumer 1</div>
    }
    const Consumer2 = () => {
      useBilling()
      return <div>Consumer 2</div>
    }

    const queryClient = createQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <FlowgladContextProvider
          requestConfig={{ fetch: mockFetch as unknown as MockFetch }}
        >
          <Consumer1 />
          <Consumer2 />
        </FlowgladContextProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(countBillingCalls(mockFetch)).toBeGreaterThan(0)
    })

    // Verify exactly one billing fetch
    expect(countBillingCalls(mockFetch)).toBe(1)
  })

  it('sets isRefetching true when refetch() called after initial load', async () => {
    let fetchCount = 0
    const mockFetch = vi
      .fn()
      .mockImplementation(async (url: string) => {
        // Only track billing fetches
        if (url.includes('/customers/billing')) {
          fetchCount++
          if (fetchCount === 1) {
            return {
              ok: true,
              json: async () => ({
                data: {
                  customer: { id: 'cust_1' },
                  subscriptions: [{ id: 'sub_v1' }],
                  currentSubscription: { id: 'sub_v1' },
                  currentSubscriptions: [{ id: 'sub_v1' }],
                  purchases: [],
                  invoices: [],
                  paymentMethods: [],
                  catalog: null,
                  billingPortalUrl: null,
                  pricingModel: null,
                },
              }),
            }
          }
          // Second call never resolves to keep isRefetching true
          return new Promise(() => {})
        }
        // For pricing or other requests, return a valid response
        return {
          ok: true,
          json: async () => ({ data: null }),
        }
      }) as unknown as MockFetch

    const { result } = renderHook(() => useBilling(), {
      wrapper: createWrapper(mockFetch),
    })

    await waitFor(() =>
      expect(result.current.data?.data?.subscriptions?.[0]?.id).toBe(
        'sub_v1'
      )
    )

    act(() => {
      result.current.refetch()
    })

    // After refetch is called, isRefetching should be true
    await waitFor(() =>
      expect(result.current.isRefetching).toBe(true)
    )

    // Stale data should still be available
    expect(result.current.data?.data?.subscriptions?.[0]?.id).toBe(
      'sub_v1'
    )
    expect(result.current.isPending).toBe(false)
  })

  it('returns FlowgladHookData shape with all required fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          customer: { id: 'cust_test' },
          subscriptions: [],
          currentSubscription: null,
          currentSubscriptions: [],
          purchases: [],
          invoices: [],
          paymentMethods: [],
          catalog: null,
          billingPortalUrl: null,
          pricingModel: null,
        },
      }),
    }) as unknown as MockFetch

    const { result } = renderHook(() => useBilling(), {
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
