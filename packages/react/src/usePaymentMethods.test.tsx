import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'
import type {
  CustomerBillingDetails,
  PaymentMethodDetails,
} from '@flowglad/shared'
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

// Mock payment methods data with explicit type
const mockPaymentMethods: PaymentMethodDetails[] = [
  {
    id: 'pm_1',
    billingDetails: {
      address: {
        country: 'US',
      },
    },
    createdAt: Date.now(),
    customerId: 'cust_123',
    default: true,
    livemode: false,
    paymentMethodData: {
      card: {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2025,
      },
    },
    pricingModelId: 'pm_123',
    type: 'card',
    updatedAt: Date.now(),
  },
  {
    id: 'pm_2',
    billingDetails: {
      address: {
        country: 'US',
      },
    },
    createdAt: Date.now(),
    customerId: 'cust_123',
    default: false,
    livemode: false,
    paymentMethodData: {
      card: {
        brand: 'mastercard',
        last4: '5555',
        expMonth: 6,
        expYear: 2026,
      },
    },
    pricingModelId: 'pm_123',
    type: 'card',
    updatedAt: Date.now(),
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
 * Returns a CustomerBillingDetails object that satisfies the provider requirements.
 */
const createMockBillingData = (
  options: {
    paymentMethods?: PaymentMethodDetails[] | undefined
    billingPortalUrl?: string
  } = {}
): CustomerBillingDetails => {
  const now = Date.now()
  const hasPaymentMethods = Object.prototype.hasOwnProperty.call(
    options,
    'paymentMethods'
  )
  const resolvedPaymentMethods = hasPaymentMethods
    ? (options.paymentMethods ?? [])
    : mockPaymentMethods

  const pricingModel: CustomerBillingDetails['pricingModel'] = {
    id: 'pm_123',
    createdAt: now,
    isDefault: true,
    livemode: false,
    name: 'Default Pricing Model',
    organizationId: 'org_123',
    products: [],
    updatedAt: now,
    usageMeters: [],
  }

  return {
    billingPortalUrl:
      options.billingPortalUrl ?? mockBillingPortalUrl,
    catalog: pricingModel,
    customer: {
      id: 'cust_123',
      archived: false,
      createdAt: now,
      domain: null,
      email: 'test@example.com',
      externalId: 'ext_123',
      iconURL: null,
      invoiceNumberBase: null,
      livemode: false,
      logoURL: null,
      name: 'Test Customer',
      organizationId: 'org_123',
      pricingModelId: 'pm_123',
      updatedAt: now,
      userId: null,
      billingAddress: null,
    },
    invoices: [],
    paymentMethods: resolvedPaymentMethods,
    pricingModel,
    purchases: [],
    subscriptions: [],
  }
}

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
    const billingMocksWithoutPaymentMethods = createMockBillingData({
      paymentMethods: undefined,
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(true, billingMocksWithoutPaymentMethods),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.paymentMethods).toEqual([])
    expect(result.current.billingPortalUrl).toBe(mockBillingPortalUrl)
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
