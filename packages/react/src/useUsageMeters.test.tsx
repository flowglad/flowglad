import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { useBilling } from './FlowgladContext'
import {
  USAGE_METERS_QUERY_KEY,
  useUsageMeter,
  useUsageMeters,
} from './useUsageMeters'

// Mock data
const mockUsageMeterBalances = [
  {
    id: 'meter_1',
    livemode: false,
    name: 'API Credits',
    slug: 'api-credits',
    availableBalance: 1000,
    subscriptionId: 'sub_123',
  },
  {
    id: 'meter_2',
    livemode: false,
    name: 'Storage',
    slug: 'storage',
    availableBalance: 500,
    subscriptionId: 'sub_123',
  },
  {
    id: 'meter_3',
    livemode: false,
    name: 'API Credits',
    slug: 'api-credits',
    availableBalance: 200,
    subscriptionId: 'sub_456',
  },
]

const mockUsageMeterBalancesResponse = {
  data: {
    usageMeterBalances: mockUsageMeterBalances,
  },
}

// Create mock billing data with usage meter balances
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
  subscriptions: [],
  currentSubscription: {
    id: 'sub_123',
    status: 'active',
    current: true,
    experimental: {
      usageMeterBalances: [
        {
          id: 'meter_1',
          livemode: false,
          name: 'API Credits',
          slug: 'api-credits',
          availableBalance: 1000,
          subscriptionId: 'sub_123',
        },
        {
          id: 'meter_2',
          livemode: false,
          name: 'Storage',
          slug: 'storage',
          availableBalance: 500,
          subscriptionId: 'sub_123',
        },
      ],
    },
  },
  currentSubscriptions: [
    {
      id: 'sub_123',
      status: 'active',
      current: true,
      experimental: {
        usageMeterBalances: [
          {
            id: 'meter_1',
            livemode: false,
            name: 'API Credits',
            slug: 'api-credits',
            availableBalance: 1000,
            subscriptionId: 'sub_123',
          },
          {
            id: 'meter_2',
            livemode: false,
            name: 'Storage',
            slug: 'storage',
            availableBalance: 500,
            subscriptionId: 'sub_123',
          },
        ],
      },
    },
    {
      id: 'sub_456',
      status: 'active',
      current: true,
      experimental: {
        usageMeterBalances: [
          {
            id: 'meter_3',
            livemode: false,
            name: 'API Credits',
            slug: 'api-credits',
            availableBalance: 200,
            subscriptionId: 'sub_456',
          },
        ],
      },
    },
  ],
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

// Create wrapper that exposes the query client for testing invalidation
const createWrapperWithQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <FlowgladConfigProvider baseURL="https://test.example.com">
        {children}
      </FlowgladConfigProvider>
    </QueryClientProvider>
  )

  return { wrapper, queryClient }
}

describe('useUsageMeters', () => {
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

  it('returns balances after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockUsageMeterBalancesResponse),
    })

    const { result } = renderHook(() => useUsageMeters(), {
      wrapper: createWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.usageMeters).toEqual(mockUsageMeterBalances)
    expect(result.current.error).toBe(null)
  })

  it('returns error when API responds with error (auth edge case)', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          error: {
            code: 'UNAUTHORIZED',
            json: { message: 'Authentication required' },
          },
        }),
    })

    const { result } = renderHook(() => useUsageMeters(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'Authentication required'
    )
    expect(result.current.usageMeters).toBeUndefined()
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useUsageMeters(), {
      wrapper: createWrapper(true, billingMocks),
    })

    // In dev mode, data should be immediately available
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)

    // No fetch calls should be made in dev mode
    expect(mockFetch).not.toHaveBeenCalled()

    // Should have balances derived from billingMocks
    expect(result.current.usageMeters).toHaveLength(3)
    const apiCreditsMeter = result.current.usageMeters?.find(
      (m) => m.slug === 'api-credits'
    )
    expect(apiCreditsMeter?.slug).toBe('api-credits')
  })

  it('throws error in dev mode when billingMocks is missing', () => {
    // Create a wrapper without billingMocks for dev mode
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const wrapperWithoutMocks = ({
      children,
    }: {
      children: React.ReactNode
    }) => (
      <QueryClientProvider client={queryClient}>
        <FlowgladConfigProvider
          baseURL="https://test.example.com"
          __devMode={true}
        >
          {children}
        </FlowgladConfigProvider>
      </QueryClientProvider>
    )

    expect(() => {
      renderHook(() => useUsageMeters(), {
        wrapper: wrapperWithoutMocks,
      })
    }).toThrow('FlowgladProvider: __devMode requires billingMocks')
  })

  it('filters by subscriptionId in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(
      () => useUsageMeters({ subscriptionId: 'sub_123' }),
      {
        wrapper: createWrapper(true, billingMocks),
      }
    )

    expect(result.current.isLoading).toBe(false)
    expect(result.current.usageMeters).toHaveLength(2)
    expect(
      result.current.usageMeters?.every(
        (m) => m.subscriptionId === 'sub_123'
      )
    ).toBe(true)
  })

  it('returns empty array when API returns empty usageMeterBalances', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({ data: { usageMeterBalances: [] } }),
    })

    const { result } = renderHook(() => useUsageMeters(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.usageMeters).toEqual([])
    expect(result.current.error).toBe(null)
  })
})

describe('useUsageMeter', () => {
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

  it('returns single balance by slug', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockUsageMeterBalancesResponse),
    })

    const { result } = renderHook(
      () => useUsageMeter('api-credits'),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.usageMeter).not.toBe(null)
    expect(result.current.usageMeter?.slug).toBe('api-credits')
    expect(result.current.usageMeter?.availableBalance).toBe(1000)
  })

  it('returns null when slug not found', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockUsageMeterBalancesResponse),
    })

    const { result } = renderHook(
      () => useUsageMeter('nonexistent'),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.usageMeter).toBe(null)
    expect(result.current.error).toBe(null)
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useUsageMeter('storage'), {
      wrapper: createWrapper(true, billingMocks),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.usageMeter).not.toBe(null)
    expect(result.current.usageMeter?.slug).toBe('storage')
    expect(result.current.usageMeter?.availableBalance).toBe(500)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('createUsageEvent invalidation', () => {
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

  it('invalidates usage meter query keys only', async () => {
    const { wrapper, queryClient } = createWrapperWithQueryClient()

    // Mock responses for initial fetches
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('customers/billing')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              data: createMockBillingData(),
            }),
        })
      }
      if (url.includes('usage-events/create')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              data: { usageEvent: { id: 'evt_123' } },
            }),
        })
      }
      return Promise.resolve({
        json: () => Promise.resolve({ data: null }),
      })
    })

    const invalidateSpy = spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useBilling(), { wrapper })

    await waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })

    // Ensure createUsageEvent is available
    expect(result.current.createUsageEvent).not.toBe(null)

    // Call createUsageEvent
    await act(async () => {
      await result.current.createUsageEvent!({
        usageMeterSlug: 'api-credits',
        amount: 1,
      })
    })

    // Verify invalidation was called for usage meter query key
    // Note: useUsageMeter now shares the same query key as useUsageMeters
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [USAGE_METERS_QUERY_KEY],
    })

    // Verify it was NOT called for billing query key
    const billingInvalidationCall = invalidateSpy.mock.calls.find(
      (call) =>
        JSON.stringify(call[0]?.queryKey)?.includes(
          'customers/billing'
        )
    )
    expect(billingInvalidationCall).toBeUndefined()
  })
})
