import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { useSubscriptions } from './useSubscriptions'

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

const mockSubscription2 = {
  id: 'sub_456',
  status: 'active',
  current: true,
  livemode: false,
  customerId: 'cust_123',
  priceId: 'price_456',
  productId: 'prod_456',
  currentPeriodStart: Date.now(),
  currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const mockHistoricalSubscription = {
  id: 'sub_789',
  status: 'canceled',
  current: false,
  livemode: false,
  customerId: 'cust_123',
  priceId: 'price_789',
  productId: 'prod_789',
  currentPeriodStart: Date.now() - 60 * 24 * 60 * 60 * 1000,
  currentPeriodEnd: Date.now() - 30 * 24 * 60 * 60 * 1000,
  createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
}

const mockSubscriptionsResponse = {
  data: {
    subscriptions: [mockSubscription1, mockSubscription2],
    currentSubscriptions: [mockSubscription1, mockSubscription2],
    currentSubscription: mockSubscription1,
  },
}

// Create mock billing data for dev mode
const createMockBillingData = () => ({
  customer: {
    id: 'cust_123',
    email: 'test@example.com',
    name: 'Test Customer',
    externalId: 'ext_123',
    livemode: false,
    organizationId: 'org_123',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    catalog: null,
  },
  subscriptions: [
    mockSubscription1,
    mockSubscription2,
    mockHistoricalSubscription,
  ],
  currentSubscription: mockSubscription1,
  currentSubscriptions: [mockSubscription1, mockSubscription2],
  purchases: [],
  invoices: [],
  paymentMethods: [],
  billingPortalUrl: 'https://billing.example.com',
  pricingModel: {
    id: 'pm_123',
    products: [],
    prices: [],
    usageMeters: [],
    features: [],
    resources: [],
  },
  catalog: {
    id: 'pm_123',
    products: [],
    prices: [],
    usageMeters: [],
    features: [],
    resources: [],
  },
})

// Create wrapper for hooks
const createWrapper = (
  devMode = false,
  billingMocks?: ReturnType<typeof createMockBillingData>
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
        billingMocks={billingMocks as never}
      >
        {children}
      </FlowgladConfigProvider>
    </QueryClientProvider>
  )
}

describe('useSubscriptions', () => {
  let originalFetch: typeof fetch
  let mockFetch: ReturnType<typeof mock>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    mockFetch = mock()
    globalThis.fetch = mockFetch as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    mockFetch.mockReset()
  })

  it('returns subscriptions after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubscriptionsResponse),
    })

    const { result } = renderHook(() => useSubscriptions(), {
      wrapper: createWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.subscriptions).toHaveLength(2)
    expect(result.current.subscriptions?.[0].id).toBe('sub_123')
    expect(result.current.subscriptions?.[1].id).toBe('sub_456')
    expect(result.current.error).toBe(null)
  })

  it('returns currentSubscriptions and currentSubscription', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubscriptionsResponse),
    })

    const { result } = renderHook(() => useSubscriptions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.currentSubscriptions).toHaveLength(2)
    expect(result.current.currentSubscriptions?.[0].id).toBe(
      'sub_123'
    )
    expect(result.current.currentSubscriptions?.[1].id).toBe(
      'sub_456'
    )
    expect(result.current.currentSubscription?.id).toBe('sub_123')
    expect(result.current.currentSubscription?.status).toBe('active')
    expect(result.current.error).toBe(null)
  })

  it('returns error on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          error: {
            code: 'UNAUTHORIZED',
            json: { message: 'Authentication required' },
          },
        }),
    })

    const { result } = renderHook(() => useSubscriptions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'Authentication required'
    )
    expect(result.current.subscriptions).toBeUndefined()
    expect(result.current.currentSubscriptions).toBeUndefined()
    expect(result.current.currentSubscription).toBeUndefined()
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useSubscriptions(), {
      wrapper: createWrapper(true, billingMocks),
    })

    // In dev mode, data should be immediately available
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)

    // No fetch calls should be made in dev mode
    expect(mockFetch).not.toHaveBeenCalled()

    // Should have subscriptions from billingMocks
    // Without includeHistorical, only current subscriptions are returned
    expect(result.current.subscriptions).toHaveLength(2)
    expect(result.current.currentSubscriptions).toHaveLength(2)
    expect(result.current.currentSubscription?.id).toBe('sub_123')
  })

  it('passes includeHistorical param', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(
      () => useSubscriptions({ includeHistorical: true }),
      {
        wrapper: createWrapper(true, billingMocks),
      }
    )

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)

    // With includeHistorical=true, should include historical subscription
    expect(result.current.subscriptions).toHaveLength(3)
    expect(result.current.subscriptions?.map((s) => s.id)).toContain(
      'sub_789'
    )

    // currentSubscriptions should still only have active subscriptions
    expect(result.current.currentSubscriptions).toHaveLength(2)
  })

  it('returns error on HTTP failure (non-2xx status)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useSubscriptions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'HTTP 500: Internal Server Error'
    )
    expect(result.current.subscriptions).toBeUndefined()
  })

  it('uses betterAuthBasePath route when configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubscriptionsResponse),
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const wrapperWithBetterAuth = ({
      children,
    }: {
      children: React.ReactNode
    }) => (
      <QueryClientProvider client={queryClient}>
        <FlowgladConfigProvider betterAuthBasePath="/api/auth">
          {children}
        </FlowgladConfigProvider>
      </QueryClientProvider>
    )

    const { result } = renderHook(() => useSubscriptions(), {
      wrapper: wrapperWithBetterAuth,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verify the fetch was called with the betterAuth route
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[0]).toBe('/api/auth/flowglad/subscriptions/list')
    expect(fetchCall[1].method).toBe('POST')
  })
})
