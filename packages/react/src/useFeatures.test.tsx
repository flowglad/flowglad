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
import { act, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { useFeature, useFeatures } from './useFeatures'

// Mock data
const mockFeatureAccessItems = [
  {
    id: 'feature_1',
    livemode: false,
    slug: 'advanced-analytics',
    name: 'Advanced Analytics',
  },
  {
    id: 'feature_2',
    livemode: false,
    slug: 'api-access',
    name: 'API Access',
  },
  {
    id: 'feature_3',
    livemode: false,
    slug: 'custom-branding',
    name: 'Custom Branding',
  },
]

const mockFeatureAccessResponse = {
  data: {
    features: mockFeatureAccessItems,
  },
}

// Create mock billing data with feature items
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
      featureItems: [
        {
          id: 'feature_1',
          livemode: false,
          slug: 'advanced-analytics',
          name: 'Advanced Analytics',
          type: 'toggle',
        },
        {
          id: 'feature_2',
          livemode: false,
          slug: 'api-access',
          name: 'API Access',
          type: 'toggle',
        },
        {
          id: 'feature_credit',
          livemode: false,
          slug: 'credit-grant',
          name: 'Credit Grant',
          type: 'usage_credit_grant',
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
        featureItems: [
          {
            id: 'feature_1',
            livemode: false,
            slug: 'advanced-analytics',
            name: 'Advanced Analytics',
            type: 'toggle',
          },
          {
            id: 'feature_2',
            livemode: false,
            slug: 'api-access',
            name: 'API Access',
            type: 'toggle',
          },
        ],
      },
    },
    {
      id: 'sub_456',
      status: 'active',
      current: true,
      experimental: {
        featureItems: [
          {
            id: 'feature_3',
            livemode: false,
            slug: 'custom-branding',
            name: 'Custom Branding',
            type: 'toggle',
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

describe('useFeatures', () => {
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

  it('returns features after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFeatureAccessResponse),
    })

    const { result } = renderHook(() => useFeatures(), {
      wrapper: createWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.features).toEqual(mockFeatureAccessItems)
    expect(result.current.error).toBe(null)
  })

  it('returns error on API error (auth edge case)', async () => {
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

    const { result } = renderHook(() => useFeatures(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'Authentication required'
    )
    expect(result.current.features).toBeUndefined()
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useFeatures(), {
      wrapper: createWrapper(true, billingMocks),
    })

    // In dev mode, data should be immediately available
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)

    // No fetch calls should be made in dev mode
    expect(mockFetch).not.toHaveBeenCalled()

    // Should have features derived from billingMocks (only toggle types)
    expect(result.current.features).toHaveLength(3)
    const advancedAnalytics = result.current.features?.find(
      (f) => f.slug === 'advanced-analytics'
    )
    expect(advancedAnalytics?.slug).toBe('advanced-analytics')
  })

  it('throws error in dev mode when billingMocks missing', () => {
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
      renderHook(() => useFeatures(), {
        wrapper: wrapperWithoutMocks,
      })
    }).toThrow('FlowgladProvider: __devMode requires billingMocks')
  })

  it('filters by subscriptionId in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(
      () => useFeatures({ subscriptionId: 'sub_123' }),
      {
        wrapper: createWrapper(true, billingMocks),
      }
    )

    expect(result.current.isLoading).toBe(false)
    expect(result.current.features).toHaveLength(2)
    const slugs = result.current.features?.map((f) => f.slug).sort()
    expect(slugs).toEqual(['advanced-analytics', 'api-access'])
  })

  it('returns empty array when no toggle features', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { features: [] } }),
    })

    const { result } = renderHook(() => useFeatures(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.features).toEqual([])
    expect(result.current.error).toBe(null)
  })

  it('returns error on HTTP failure (non-2xx status)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useFeatures(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'HTTP 500: Internal Server Error'
    )
    expect(result.current.features).toBeUndefined()
  })

  it('uses betterAuthBasePath route when configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFeatureAccessResponse),
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

    const { result } = renderHook(() => useFeatures(), {
      wrapper: wrapperWithBetterAuth,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verify the fetch was called with the betterAuth route
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[0]).toBe('/api/auth/flowglad/features/access')
    expect(fetchCall[1].method).toBe('POST')
  })
})

describe('useFeature', () => {
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

  it('returns feature by slug', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFeatureAccessResponse),
    })

    const { result } = renderHook(
      () => useFeature('advanced-analytics'),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.feature).not.toBe(null)
    expect(result.current.feature?.slug).toBe('advanced-analytics')
    expect(result.current.feature?.name).toBe('Advanced Analytics')
  })

  it('returns hasAccess: true when feature exists', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFeatureAccessResponse),
    })

    const { result } = renderHook(() => useFeature('api-access'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasAccess).toBe(true)
    expect(result.current.feature).not.toBe(null)
    expect(result.current.error).toBe(null)
  })

  it('returns hasAccess: false when feature not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFeatureAccessResponse),
    })

    const { result } = renderHook(() => useFeature('nonexistent'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasAccess).toBe(false)
    expect(result.current.feature).toBe(null)
    expect(result.current.error).toBe(null)
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(
      () => useFeature('custom-branding'),
      {
        wrapper: createWrapper(true, billingMocks),
      }
    )

    expect(result.current.isLoading).toBe(false)
    expect(result.current.feature).not.toBe(null)
    expect(result.current.feature?.slug).toBe('custom-branding')
    expect(result.current.hasAccess).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe.skip('subscription mutations', () => {
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

  it('invalidate features query key', async () => {
    // Test stub - to be implemented in Patch 7
  })
})
