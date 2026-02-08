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
  PurchaseDetails,
} from '@flowglad/shared'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { usePurchases } from './usePurchases'

const mockPurchases: PurchaseDetails[] = [
  {
    id: 'purch_123',
    archived: false,
    bankPaymentOnly: null,
    createdAt: Date.now(),
    customerId: 'cust_123',
    firstInvoiceValue: 9900,
    intervalCount: null,
    intervalUnit: null,
    livemode: false,
    name: 'Pro Plan',
    organizationId: 'org_123',
    position: 0,
    priceId: 'price_123',
    pricePerBillingCycle: null,
    priceType: 'single_payment',
    pricingModelId: 'pm_123',
    proposal: null,
    quantity: 1,
    status: 'paid',
    totalPurchaseValue: 9900,
    trialPeriodDays: null,
    updatedAt: Date.now(),
  } as unknown as PurchaseDetails,
  {
    id: 'purch_456',
    archived: false,
    bankPaymentOnly: null,
    createdAt: Date.now(),
    customerId: 'cust_123',
    firstInvoiceValue: 19900,
    intervalCount: null,
    intervalUnit: null,
    livemode: false,
    name: 'Enterprise Plan',
    organizationId: 'org_123',
    position: 1,
    priceId: 'price_456',
    pricePerBillingCycle: null,
    priceType: 'single_payment',
    pricingModelId: 'pm_123',
    proposal: null,
    quantity: 1,
    status: 'paid',
    totalPurchaseValue: 19900,
    trialPeriodDays: null,
    updatedAt: Date.now(),
  } as unknown as PurchaseDetails,
]

const mockPurchasesResponse = {
  data: {
    purchases: mockPurchases,
  },
}

const createMockBillingData = (
  options: { purchases?: PurchaseDetails[] | undefined } = {}
): CustomerBillingDetails => {
  const now = Date.now()
  const hasPurchases = Object.prototype.hasOwnProperty.call(
    options,
    'purchases'
  )
  const resolvedPurchases = hasPurchases
    ? (options.purchases ?? [])
    : mockPurchases

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
    billingPortalUrl: 'https://billing.stripe.com/p/session_xyz',
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
    paymentMethods: [],
    pricingModel,
    purchases:
      resolvedPurchases as CustomerBillingDetails['purchases'],
    subscriptions: [],
  }
}

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

describe('usePurchases', () => {
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

  it('returns purchases after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPurchasesResponse),
    })

    const { result } = renderHook(() => usePurchases(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.purchases).toHaveLength(2)
    expect(result.current.purchases?.[0]?.id).toBe('purch_123')
    expect(result.current.purchases?.[1]?.id).toBe('purch_456')
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

    const { result } = renderHook(() => usePurchases(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'Authentication required'
    )
    expect(result.current.purchases).toBeUndefined()
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => usePurchases(), {
      wrapper: createWrapper(true, billingMocks),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.purchases).toHaveLength(2)
    expect(result.current.purchases?.[0]?.id).toBe('purch_123')
    expect(result.current.purchases?.[1]?.id).toBe('purch_456')
  })

  it('hasPurchased returns true when product purchased', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPurchasesResponse),
    })

    const { result } = renderHook(() => usePurchases(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasPurchased('Pro Plan')).toBe(true)
    expect(result.current.hasPurchased('Enterprise Plan')).toBe(true)
  })

  it('hasPurchased returns false when product not purchased', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPurchasesResponse),
    })

    const { result } = renderHook(() => usePurchases(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasPurchased('Nonexistent Plan')).toBe(
      false
    )
  })

  it('passes limit param', async () => {
    const limitedResponse = {
      data: {
        purchases: [mockPurchases[0]],
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(limitedResponse),
    })

    const { result } = renderHook(() => usePurchases({ limit: 1 }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.purchases).toHaveLength(1)
    expect(result.current.purchases?.[0]?.id).toBe('purch_123')
    expect(result.current.error).toBe(null)

    // Verify the fetch was called with the limit in the body
    const fetchCall = mockFetch.mock.calls[0]
    expect(JSON.parse(fetchCall[1].body)).toEqual({ limit: 1 })
  })

  it('passes startingAfter param', async () => {
    const limitedResponse = {
      data: {
        purchases: [mockPurchases[1]],
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(limitedResponse),
    })

    const { result } = renderHook(
      () => usePurchases({ startingAfter: 'purch_123' }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.purchases).toHaveLength(1)
    expect(result.current.purchases?.[0]?.id).toBe('purch_456')
    expect(result.current.error).toBe(null)

    const fetchCall = mockFetch.mock.calls[0]
    expect(JSON.parse(fetchCall[1].body)).toEqual({
      startingAfter: 'purch_123',
    })
  })

  it('hasPurchased returns false when purchases not loaded', () => {
    // Don't resolve the fetch so purchases remain undefined
    mockFetch.mockImplementation(
      () => new Promise(() => {}) // never resolves
    )

    const { result } = renderHook(() => usePurchases(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.hasPurchased('Pro Plan')).toBe(false)
  })

  it('returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => usePurchases(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'HTTP 500: Internal Server Error'
    )
    expect(result.current.purchases).toBeUndefined()
  })

  it('throws error in dev mode when billingMocks missing', () => {
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
      renderHook(() => usePurchases(), {
        wrapper: wrapperWithoutMocks,
      })
    }).toThrow('FlowgladProvider: __devMode requires billingMocks')
  })
})

describe('subscription mutations', () => {
  it.skip('invalidate invoices and purchases query keys', async () => {
    // TODO: Implement in Patch 8
  })
})
