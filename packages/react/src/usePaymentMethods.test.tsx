/**
 * @vitest-environment jsdom
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'
import type { CustomerBillingDetails } from '@flowglad/shared'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { usePaymentMethods } from './usePaymentMethods'

/**
 * Test-only partial payment method type.
 * Contains only the fields needed for test assertions.
 */
interface TestPaymentMethod {
  id: string
  type: string
  card?: {
    brand: string
    last4: string
    expMonth: number
    expYear: number
  }
}

/**
 * Test billing data type - a partial CustomerBillingDetails
 * that includes the minimum fields needed for testing.
 */
interface TestBillingData {
  customer: {
    id: string
    email: string
    name: string
    externalId: string
    livemode: boolean
    organizationId: string
    createdAt: number
    updatedAt: number
    catalog: null
  }
  subscriptions: never[]
  currentSubscription: null
  currentSubscriptions: never[]
  purchases: never[]
  invoices: never[]
  paymentMethods: TestPaymentMethod[] | undefined
  billingPortalUrl: string | null
  pricingModel: {
    id: string
    products: never[]
    prices: never[]
    usageMeters: never[]
    features: never[]
    resources: never[]
  }
  catalog: {
    id: string
    products: never[]
    prices: never[]
    usageMeters: never[]
    features: never[]
    resources: never[]
  }
}

// Mock payment methods data with explicit type
const mockPaymentMethods: TestPaymentMethod[] = [
  {
    id: 'pm_1',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2025,
    },
  },
  {
    id: 'pm_2',
    type: 'card',
    card: {
      brand: 'mastercard',
      last4: '5555',
      expMonth: 6,
      expYear: 2026,
    },
  },
]

const mockBillingPortalUrl =
  'https://billing.stripe.com/p/session_xyz'

const mockPaymentMethodsResponse = {
  data: {
    paymentMethods: mockPaymentMethods,
    billingPortalUrl: mockBillingPortalUrl,
  },
}

/**
 * Creates mock billing data for dev mode testing.
 * Returns a TestBillingData that satisfies the shape expected by the provider.
 */
const createMockBillingData = (
  paymentMethods:
    | TestPaymentMethod[]
    | undefined = mockPaymentMethods,
  billingPortalUrl: string | null = mockBillingPortalUrl
): TestBillingData => ({
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
  currentSubscription: null,
  currentSubscriptions: [],
  purchases: [],
  invoices: [],
  paymentMethods,
  billingPortalUrl,
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
  billingMocks?: TestBillingData
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  // Cast to CustomerBillingDetails - safe because TestBillingData
  // is structurally compatible with the fields the hook accesses
  const typedBillingMocks = billingMocks as
    | CustomerBillingDetails
    | undefined

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <FlowgladConfigProvider
        baseURL="https://test.example.com"
        __devMode={devMode}
        billingMocks={typedBillingMocks}
      >
        {children}
      </FlowgladConfigProvider>
    </QueryClientProvider>
  )
}

describe('usePaymentMethods', () => {
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

  it('returns payment methods after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPaymentMethodsResponse),
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verify payment methods data structure
    expect(result.current.paymentMethods).toHaveLength(2)
    expect(result.current.paymentMethods?.[0]?.id).toBe('pm_1')
    expect(result.current.paymentMethods?.[0]?.type).toBe('card')
    expect(result.current.paymentMethods?.[1]?.id).toBe('pm_2')
    expect(result.current.paymentMethods?.[1]?.type).toBe('card')
    expect(result.current.error).toBe(null)
  })

  it('returns billingPortalUrl after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPaymentMethodsResponse),
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.billingPortalUrl).toBe(mockBillingPortalUrl)
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

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'Authentication required'
    )
    expect(result.current.paymentMethods).toBeUndefined()
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(true, billingMocks),
    })

    // In dev mode, data should be immediately available
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)

    // No fetch calls should be made in dev mode
    expect(mockFetch).not.toHaveBeenCalled()

    // Should have payment methods from billingMocks
    expect(result.current.paymentMethods).toHaveLength(2)
    expect(result.current.paymentMethods?.[0]?.id).toBe('pm_1')
    expect(result.current.paymentMethods?.[0]?.type).toBe('card')
    expect(result.current.paymentMethods?.[1]?.id).toBe('pm_2')
    expect(result.current.paymentMethods?.[1]?.type).toBe('card')
    expect(result.current.billingPortalUrl).toBe(mockBillingPortalUrl)
  })

  it('returns empty array when billingMocks.paymentMethods missing', async () => {
    // Create billing data inline to avoid default parameter behavior
    // (passing undefined to createMockBillingData triggers the default value)
    const billingMocksWithoutPaymentMethods: TestBillingData = {
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
      currentSubscription: null,
      currentSubscriptions: [],
      purchases: [],
      invoices: [],
      paymentMethods: undefined,
      billingPortalUrl: null,
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
    }

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(true, billingMocksWithoutPaymentMethods),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.paymentMethods).toEqual([])
    expect(result.current.billingPortalUrl).toBe(null)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns error on HTTP failure (non-2xx status)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'HTTP 500: Internal Server Error'
    )
    expect(result.current.paymentMethods).toBeUndefined()
  })

  it('uses betterAuthBasePath route when configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPaymentMethodsResponse),
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

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: wrapperWithBetterAuth,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verify the fetch was called with the betterAuth route
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[0]).toBe(
      '/api/auth/flowglad/payment-methods/list'
    )
    expect(fetchCall[1].method).toBe('POST')
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
      renderHook(() => usePaymentMethods(), {
        wrapper: wrapperWithoutMocks,
      })
    }).toThrow('FlowgladProvider: __devMode requires billingMocks')
  })
})

describe('subscription mutations', () => {
  it.skip('invalidate payment methods query key', () => {
    // Setup: Pre-populate query cache with payment methods
    // Action: Trigger subscription mutation
    // Assert: Payment methods query is invalidated
  })
})
