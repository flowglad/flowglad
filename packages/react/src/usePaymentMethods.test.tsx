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
import type { PaymentMethodDetails } from '@flowglad/shared'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { invalidateCustomerData } from './lib/invalidation'
import {
  PAYMENT_METHODS_QUERY_KEY,
  usePaymentMethods,
} from './usePaymentMethods'

// Mock payment methods data - cast as PaymentMethodDetails for type safety
// In tests, we only need the fields used by assertions
const mockPaymentMethods = [
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
] as unknown as PaymentMethodDetails[]

const mockBillingPortalUrl =
  'https://billing.stripe.com/p/session_xyz'

const mockPaymentMethodsResponse = {
  data: {
    paymentMethods: mockPaymentMethods,
    billingPortalUrl: mockBillingPortalUrl,
  },
}

// Create mock billing data for dev mode
const createMockBillingData = (
  paymentMethods = mockPaymentMethods,
  billingPortalUrl: string | null = mockBillingPortalUrl
) => ({
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

    expect(result.current.paymentMethods).toEqual(mockPaymentMethods)
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
    expect(result.current.paymentMethods).toEqual(mockPaymentMethods)
    expect(result.current.billingPortalUrl).toBe(mockBillingPortalUrl)
  })

  it('returns empty array when billingMocks.paymentMethods missing', async () => {
    const billingMocks = createMockBillingData(
      undefined as never,
      null
    )
    // Explicitly set paymentMethods to undefined to test default behavior
    ;(billingMocks as { paymentMethods: unknown }).paymentMethods =
      undefined

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(true, billingMocks),
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
  it('invalidateCustomerData invalidates payment methods query key', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    // Pre-populate query cache with payment methods data
    queryClient.setQueryData([PAYMENT_METHODS_QUERY_KEY], {
      data: {
        paymentMethods: mockPaymentMethods,
        billingPortalUrl: mockBillingPortalUrl,
      },
    })

    // Verify data is in cache before invalidation
    const dataBefore = queryClient.getQueryData([
      PAYMENT_METHODS_QUERY_KEY,
    ])
    expect(dataBefore).toEqual({
      data: {
        paymentMethods: mockPaymentMethods,
        billingPortalUrl: mockBillingPortalUrl,
      },
    })

    // Get query state before invalidation
    const stateBefore = queryClient.getQueryState([
      PAYMENT_METHODS_QUERY_KEY,
    ])
    expect(stateBefore?.isInvalidated).toBe(false)

    // Call the shared invalidation helper
    await invalidateCustomerData(queryClient)

    // Assert that the payment methods query is now invalidated
    const stateAfter = queryClient.getQueryState([
      PAYMENT_METHODS_QUERY_KEY,
    ])
    expect(stateAfter?.isInvalidated).toBe(true)
  })
})
