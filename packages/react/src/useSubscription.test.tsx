import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'
import type { CustomerBillingDetails } from '@flowglad/shared'
import { FlowgladActionKey } from '@flowglad/shared'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { useSubscription } from './useSubscription'

// Mock subscription data
const mockSubscription1 = {
  id: 'sub_123',
  status: 'active',
  current: true,
  livemode: false,
  customerId: 'cust_123',
  priceId: 'price_123',
  productId: 'prod_123',
  currentPeriodStart: Date.now(),
  currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const mockSubscriptionsResponse = {
  data: {
    subscriptions: [mockSubscription1],
    currentSubscriptions: [mockSubscription1],
    currentSubscription: mockSubscription1,
  },
}

const mockEmptySubscriptionsResponse = {
  data: {
    subscriptions: [],
    currentSubscriptions: [],
    currentSubscription: null,
  },
}

// Create mock billing data for dev mode
// Uses type assertion since test mocks only need partial data
const createMockBillingData = () =>
  ({
    customer: {
      id: 'cust_123',
      email: 'test@example.com',
      name: 'Test Customer',
      externalId: 'ext_123',
      livemode: false,
      organizationId: 'org_123',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    subscriptions: [mockSubscription1],
    currentSubscription: mockSubscription1,
    currentSubscriptions: [mockSubscription1],
    purchases: [],
    invoices: [],
    paymentMethods: [],
    billingPortalUrl: 'https://billing.example.com',
    pricingModel: {
      id: 'pm_123',
      products: [],
      usageMeters: [],
      features: [],
      resources: [],
    },
    catalog: {
      id: 'pm_123',
      products: [],
      usageMeters: [],
      features: [],
      resources: [],
    },
  }) as unknown as CustomerBillingDetails

// Create wrapper for hooks
const createWrapper = (
  devMode = false,
  billingMocks?: CustomerBillingDetails
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <FlowgladConfigProvider
        baseURL="https://test.example.com"
        __devMode={devMode}
        billingMocks={billingMocks}
      >
        {children}
      </FlowgladConfigProvider>
    </QueryClientProvider>
  )
}

describe('useSubscription', () => {
  let originalFetch: typeof fetch
  let mockFetch: ReturnType<typeof mock>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    mockFetch = mock()
    // Create a fetch proxy that preserves the original preconnect method
    const fetchProxy = Object.assign(
      (...args: Parameters<typeof fetch>) => mockFetch(...args),
      { preconnect: originalFetch.preconnect }
    ) as typeof fetch
    globalThis.fetch = fetchProxy
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    mockFetch.mockReset()
  })

  it('returns currentSubscription from useSubscriptions with loading and error states', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubscriptionsResponse),
    })

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.subscription).toBeUndefined()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // After loading, subscription should be set
    expect(result.current.subscription?.id).toBe('sub_123')
    expect(result.current.subscription?.status).toBe('active')
    expect(result.current.error).toBe(null)

    // Verify cancel, uncancel, adjust functions exist
    expect(typeof result.current.cancel).toBe('function')
    expect(typeof result.current.uncancel).toBe('function')
    expect(typeof result.current.adjust).toBe('function')
  })

  it('cancel() calls cancel endpoint with subscription id and cancellation params', async () => {
    // First call: fetch subscriptions
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubscriptionsResponse),
    })

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Second call: cancel subscription
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            subscription: {
              ...mockSubscription1,
              status: 'canceled',
            },
          },
        }),
    })

    await act(async () => {
      await result.current.cancel({
        cancellation: { timing: 'at_end_of_current_billing_period' },
      })
    })

    // Verify the cancel endpoint was called with correct params
    const cancelCall = mockFetch.mock.calls[1]
    expect(cancelCall[0]).toBe(
      `https://test.example.com/api/flowglad/${FlowgladActionKey.CancelSubscription}`
    )
    expect(cancelCall[1].method).toBe('POST')

    const cancelBody = JSON.parse(cancelCall[1].body)
    expect(cancelBody.id).toBe('sub_123')
    expect(cancelBody.cancellation.timing).toBe(
      'at_end_of_current_billing_period'
    )
  })

  it('cancel() throws "No active subscription" error when currentSubscription is null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockEmptySubscriptionsResponse),
    })

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Subscription should be null
    expect(result.current.subscription).toBe(null)

    // Calling cancel should throw
    await expect(
      result.current.cancel({
        cancellation: { timing: 'immediately' },
      })
    ).rejects.toThrow('No active subscription')
  })

  it('cancel() throws error when API returns error response payload', async () => {
    // First call: fetch subscriptions
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubscriptionsResponse),
    })

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Second call: cancel returns 200 but with error payload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          error: {
            code: 'SUBSCRIPTION_ALREADY_CANCELED',
            json: { message: 'Subscription is already canceled' },
          },
        }),
    })

    await expect(
      result.current.cancel({
        cancellation: { timing: 'immediately' },
      })
    ).rejects.toThrow('SUBSCRIPTION_ALREADY_CANCELED')
  })

  it('uncancel() calls uncancel endpoint with subscription id', async () => {
    // First call: fetch subscriptions
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubscriptionsResponse),
    })

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Second call: uncancel subscription
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { subscription: mockSubscription1 },
        }),
    })

    await act(async () => {
      await result.current.uncancel()
    })

    // Verify the uncancel endpoint was called
    const uncancelCall = mockFetch.mock.calls[1]
    expect(uncancelCall[0]).toBe(
      `https://test.example.com/api/flowglad/${FlowgladActionKey.UncancelSubscription}`
    )
    expect(uncancelCall[1].method).toBe('POST')

    const uncancelBody = JSON.parse(uncancelCall[1].body)
    expect(uncancelBody.id).toBe('sub_123')
  })

  it('adjust() calls adjust endpoint with subscriptionId and adjustment params', async () => {
    // First call: fetch subscriptions
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubscriptionsResponse),
    })

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Second call: adjust subscription
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            subscription: mockSubscription1,
            subscriptionItems: [],
            isUpgrade: true,
            resolvedTiming: 'immediately',
          },
        }),
    })

    await act(async () => {
      await result.current.adjust({
        priceSlug: 'pro-monthly',
        quantity: 1,
      })
    })

    // Verify the adjust endpoint was called with subscriptionId
    const adjustCall = mockFetch.mock.calls[1]
    expect(adjustCall[0]).toBe(
      `https://test.example.com/api/flowglad/${FlowgladActionKey.AdjustSubscription}`
    )
    expect(adjustCall[1].method).toBe('POST')

    const adjustBody = JSON.parse(adjustCall[1].body)
    expect(adjustBody.subscriptionId).toBe('sub_123')
    expect(adjustBody.priceSlug).toBe('pro-monthly')
    expect(adjustBody.quantity).toBe(1)
  })

  it('uses billingMocks in dev mode and returns mock responses for mutations without making network calls', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(true, billingMocks),
    })

    // In dev mode, data should be immediately available
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.subscription?.id).toBe('sub_123')

    // No fetch calls should be made in dev mode for initial load
    expect(mockFetch).not.toHaveBeenCalled()

    // Call cancel in dev mode
    const cancelResult = await result.current.cancel({
      cancellation: { timing: 'immediately' },
    })

    // Should return mock success response
    expect(cancelResult).toEqual({ success: true })

    // Still no fetch calls in dev mode
    expect(mockFetch).not.toHaveBeenCalled()

    // Call uncancel in dev mode
    const uncancelResult = await result.current.uncancel()
    expect(uncancelResult).toEqual({ success: true })
    expect(mockFetch).not.toHaveBeenCalled()

    // Call adjust in dev mode
    const adjustResult = await result.current.adjust({
      priceSlug: 'pro-monthly',
    })
    expect(adjustResult).toEqual({ success: true })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
