/**
 * @vitest-environment jsdom
 */

import type { CustomerBillingDetails } from '@flowglad/shared'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import {
  fetchCustomerBilling,
  fetchPricingModel,
  getFlowgladRoute,
  useBilling,
  useCatalog,
  usePricing,
  usePricingModel,
} from './FlowgladContext'

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Creates a minimal valid CustomerBillingDetails object for testing.
 * This represents the data structure returned from the billing API.
 */
const createMockBillingData = (
  overrides: Partial<CustomerBillingDetails> = {}
): CustomerBillingDetails => {
  const mockSubscription = {
    id: 'sub_mock_123',
    livemode: true,
    organizationId: 'org_mock_123',
    customerId: 'cust_mock_123',
    priceId: 'price_mock_123',
    name: 'Test Subscription',
    status: 'active' as const,
    current: true,
    intervalCount: 1,
    interval: 'month' as const,
    metadata: null,
    trialStart: null,
    trialEnd: null,
    currentBillingPeriodStart: Date.now() - 30 * 24 * 60 * 60 * 1000,
    currentBillingPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
    canceledAt: null,
    cancelScheduledAt: null,
    backupPaymentMethodId: null,
    defaultPaymentMethodId: 'pm_mock_123',
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
    experimental: {
      features: [],
      usageMeterBalances: [],
    },
  }

  const mockPricingModel = {
    products: [
      {
        id: 'prod_mock_123',
        slug: 'pro-plan',
        name: 'Pro Plan',
        livemode: true,
        organizationId: 'org_mock_123',
        description: 'Professional plan',
        active: true,
        metadata: null,
        singularName: null,
        pluralName: null,
        displayFeatures: [],
        prices: [
          {
            id: 'price_mock_123',
            slug: 'pro-monthly',
            name: 'Pro Monthly',
            type: 'subscription' as const,
            livemode: true,
            organizationId: 'org_mock_123',
            productId: 'prod_mock_123',
            unitPrice: 2900,
            unitPriceDecimal: null,
            setupFeeAmount: 0,
            setupFeeAmountDecimal: null,
            setupFeeEnabled: false,
            currency: 'usd',
            isDefault: true,
            active: true,
            metadata: null,
            interval: 'month' as const,
            intervalCount: 1,
            trialPeriodDays: 0,
            isCustom: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isMetered: false,
            usageMeterId: null,
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    usageMeters: [],
    defaultCurrency: 'usd',
  }

  return {
    customer: {
      id: 'cust_mock_123',
      livemode: true,
      organizationId: 'org_mock_123',
      externalId: 'ext_user_123',
      email: 'test@example.com',
      name: 'Test Customer',
      billingAddress: null,
      invoiceNumberBase: null,
      invoiceNumberSeq: 1,
      domain: null,
      phone: null,
      metadata: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    subscriptions: [mockSubscription],
    currentSubscription: mockSubscription,
    currentSubscriptions: [mockSubscription],
    purchases: [],
    invoices: [],
    paymentMethods: [],
    billingPortalUrl: 'https://billing.example.com/portal',
    pricingModel: mockPricingModel,
    catalog: mockPricingModel,
    ...overrides,
  } as CustomerBillingDetails
}

/**
 * Creates a wrapper component with QueryClientProvider and FlowgladConfigProvider.
 * Used for testing React hooks that depend on these contexts.
 */
const createWrapper = (config: {
  devMode?: boolean
  billingMocks?: CustomerBillingDetails
  baseURL?: string
}) => {
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
        baseURL={config.baseURL ?? 'https://test.example.com'}
        __devMode={config.devMode ?? false}
        billingMocks={config.billingMocks}
      >
        {children}
      </FlowgladConfigProvider>
    </QueryClientProvider>
  )
}

// ============================================================================
// getFlowgladRoute Tests
// ============================================================================

describe('getFlowgladRoute', () => {
  it('returns betterAuthBasePath + /flowglad when betterAuthBasePath is provided', () => {
    const result = getFlowgladRoute(undefined, '/api/auth')
    expect(result).toBe('/api/auth/flowglad')
  })

  it('removes trailing slashes from betterAuthBasePath before appending /flowglad', () => {
    const result = getFlowgladRoute(undefined, '/api/auth///')
    expect(result).toBe('/api/auth/flowglad')
  })

  it('trims whitespace from betterAuthBasePath', () => {
    const result = getFlowgladRoute(undefined, '  /api/auth  ')
    expect(result).toBe('/api/auth/flowglad')
  })

  it('returns baseURL + /api/flowglad when only baseURL is provided', () => {
    const result = getFlowgladRoute('https://example.com')
    expect(result).toBe('https://example.com/api/flowglad')
  })

  it('removes trailing slashes from baseURL before appending /api/flowglad', () => {
    const result = getFlowgladRoute('https://example.com///')
    expect(result).toBe('https://example.com/api/flowglad')
  })

  it('returns /api/flowglad when neither argument is provided', () => {
    const result = getFlowgladRoute()
    expect(result).toBe('/api/flowglad')
  })

  it('prioritizes betterAuthBasePath over baseURL when both are provided', () => {
    const result = getFlowgladRoute(
      'https://example.com',
      '/api/auth'
    )
    expect(result).toBe('/api/auth/flowglad')
  })
})

// ============================================================================
// fetchCustomerBilling Tests
// ============================================================================

describe('fetchCustomerBilling', () => {
  it('returns billing data when API responds with valid data', async () => {
    const mockBillingData = {
      data: {
        customer: { id: 'cust_123' },
        subscriptions: [],
      },
    }

    const mockFetch: typeof fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify(mockBillingData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(result).toEqual(mockBillingData)
  })

  it('returns error when API responds with error object', async () => {
    const mockErrorResponse = { error: { message: 'Unauthorized' } }

    const mockFetch: typeof fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify(mockErrorResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(result).toEqual(mockErrorResponse)
  })

  it('returns parse error when response is not valid JSON', async () => {
    const mockFetch: typeof fetch = async (): Promise<Response> => {
      return new Response('not valid json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    const result = await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(result).toEqual({
      data: null,
      error: { message: 'Failed to parse billing response JSON' },
    })
  })

  it('returns unexpected shape error when response lacks data or error keys', async () => {
    const mockFetch: typeof fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ unexpected: 'shape' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(result).toEqual({
      data: null,
      error: { message: 'Unexpected billing response shape' },
    })
  })

  it('uses custom fetch from requestConfig when provided', async () => {
    let fetchWasCalled = false

    const mockFetch: typeof fetch = async (): Promise<Response> => {
      fetchWasCalled = true
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(fetchWasCalled).toBe(true)
  })

  it('constructs the correct URL using getFlowgladRoute', async () => {
    let capturedUrl = ''

    const mockFetch: typeof fetch = async (
      url
    ): Promise<Response> => {
      capturedUrl = String(url)
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await fetchCustomerBilling({
      baseURL: 'https://api.example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(capturedUrl).toBe(
      'https://api.example.com/api/flowglad/customers/billing'
    )
  })
})

// ============================================================================
// fetchPricingModel Tests
// ============================================================================

describe('fetchPricingModel', () => {
  it('returns pricing model data when API responds with valid data', async () => {
    const mockPricingModelResponse = {
      data: {
        pricingModel: {
          products: [],
          defaultCurrency: 'usd',
        },
        source: 'default',
      },
    }

    const mockFetch: typeof fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify(mockPricingModelResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchPricingModel({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(result).toEqual(mockPricingModelResponse)
  })

  it('returns error when API responds with error object', async () => {
    const mockErrorResponse = {
      error: { code: 'NOT_FOUND', json: {} },
    }

    const mockFetch: typeof fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify(mockErrorResponse), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchPricingModel({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(result).toEqual(mockErrorResponse)
  })

  it('returns PRICING_MODEL_JSON_PARSE_FAILED error when response is not valid JSON', async () => {
    const mockFetch: typeof fetch = async (): Promise<Response> => {
      return new Response('not valid json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    const result = await fetchPricingModel({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(result.data).toBe(null)
    expect(result.error?.code).toBe('PRICING_MODEL_JSON_PARSE_FAILED')
    expect(result.error?.json).toEqual({
      message: 'Failed to parse pricing model response JSON',
    })
  })

  it('returns UNEXPECTED_PRICING_MODEL_RESPONSE error when response lacks data or error keys', async () => {
    const mockFetch: typeof fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ unexpected: 'shape' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchPricingModel({
      baseURL: 'https://example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(result.data).toBe(null)
    expect(result.error?.code).toBe(
      'UNEXPECTED_PRICING_MODEL_RESPONSE'
    )
    expect(result.error?.json).toEqual({
      message: 'Unexpected pricing model response shape',
    })
  })

  it('constructs the correct URL using getFlowgladRoute', async () => {
    let capturedUrl = ''

    const mockFetch: typeof fetch = async (
      url
    ): Promise<Response> => {
      capturedUrl = String(url)
      return new Response(
        JSON.stringify({ data: { pricingModel: {} } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    await fetchPricingModel({
      baseURL: 'https://api.example.com',
      requestConfig: { fetch: mockFetch },
    })

    expect(capturedUrl).toBe(
      'https://api.example.com/api/flowglad/pricing-models/retrieve'
    )
  })
})

// ============================================================================
// useBilling Hook Tests
// ============================================================================

describe('useBilling', () => {
  let originalFetch: typeof fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  describe('when __devMode is true', () => {
    it('returns loaded billing value from billingMocks with all properties populated', async () => {
      const mockBillingData = createMockBillingData()

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      // In dev mode, data should be immediately available
      expect(result.current.loaded).toBe(true)
      expect(result.current.errors).toBe(null)
      expect(result.current.customer?.id).toBe('cust_mock_123')
      expect(result.current.subscriptions).toHaveLength(1)
      expect(result.current.pricingModel?.defaultCurrency).toBe('usd')
      expect(typeof result.current.createCheckoutSession).toBe(
        'function'
      )
      expect(typeof result.current.cancelSubscription).toBe(
        'function'
      )
      expect(typeof result.current.adjustSubscription).toBe(
        'function'
      )
      expect(typeof result.current.reload).toBe('function')

      // No fetch calls should be made in dev mode
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('throws error when __devMode is true but billingMocks is undefined', () => {
      // Rendering the hook without billingMocks in dev mode should throw
      expect(() => {
        renderHook(() => useBilling(), {
          wrapper: createWrapper({
            devMode: true,
            billingMocks: undefined,
          }),
        })
      }).toThrow('FlowgladProvider: __devMode requires billingMocks')
    })
  })

  describe('when __devMode is false (production mode)', () => {
    it('returns not-loaded state while billing fetch is pending', async () => {
      // Create a promise that never resolves to simulate pending state
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolves
          })
      )

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({ devMode: false }),
      })

      // Should be in loading state
      expect(result.current.loaded).toBe(false)
      expect(result.current.errors).toBe(null)
      expect(result.current.customer).toBe(null)
      expect(result.current.subscriptions).toBe(null)
      expect(result.current.createCheckoutSession).toBe(null)
    })

    it('returns loaded state with billing data on successful fetch', async () => {
      const mockBillingData = createMockBillingData()

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: mockBillingData }),
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        expect(result.current.loaded).toBe(true)
      })

      expect(result.current.errors).toBe(null)
      expect(result.current.customer?.id).toBe('cust_mock_123')
      expect(result.current.subscriptions).toHaveLength(1)
      expect(result.current.pricingModel?.defaultCurrency).toBe('usd')
      expect(typeof result.current.createCheckoutSession).toBe(
        'function'
      )
      expect(typeof result.current.cancelSubscription).toBe(
        'function'
      )
      expect(typeof result.current.adjustSubscription).toBe(
        'function'
      )
      expect(typeof result.current.reload).toBe('function')
    })

    it('returns error state when response contains error object', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            error: { message: 'Auth failed' },
          }),
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        expect(result.current.loaded).toBe(true)
      })

      expect(result.current.errors).toHaveLength(1)
      expect(result.current.errors?.[0].message).toBe('Auth failed')
      expect(result.current.customer).toBe(null)
    })

    it('returns not-authenticated state when billing data is null', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: null }),
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        expect(result.current.loaded).toBe(true)
      })

      expect(result.current.errors).toBe(null)
      expect(result.current.customer).toBe(null)
      expect(result.current.subscriptions).toBe(null)
    })
  })

  describe('adjustSubscription in production mode', () => {
    it('auto-resolves subscriptionId when customer has exactly one current subscription', async () => {
      const mockBillingData = createMockBillingData()

      // First call: billing fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: mockBillingData }),
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        expect(result.current.loaded).toBe(true)
      })

      // Second call: adjust subscription
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              subscription: mockBillingData.currentSubscription,
              subscriptionItems: [],
              isUpgrade: false,
              resolvedTiming: 'immediately',
            },
          }),
      })

      // Third call: billing refetch after adjustment
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: mockBillingData }),
      })

      if (result.current.adjustSubscription) {
        await result.current.adjustSubscription({
          priceSlug: 'pro-monthly',
        })
      }

      // Verify the adjust call included the auto-resolved subscriptionId
      const adjustCall = mockFetch.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('subscriptions/adjust')
      )
      expect(adjustCall).not.toBe(undefined)
      const body = JSON.parse(adjustCall?.[1]?.body)
      expect(body.subscriptionId).toBe('sub_mock_123')
    })

    it('throws error when no subscriptionId provided and customer has no subscriptions', async () => {
      const mockBillingData = createMockBillingData({
        currentSubscriptions: [],
      })

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: mockBillingData }),
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        expect(result.current.loaded).toBe(true)
      })

      if (result.current.adjustSubscription) {
        await expect(
          result.current.adjustSubscription({
            priceSlug: 'pro-monthly',
          })
        ).rejects.toThrow(
          'No active subscription found for this customer'
        )
      }
    })

    it('throws error when no subscriptionId provided and customer has multiple subscriptions', async () => {
      const mockSubscription1 = {
        id: 'sub_1',
        livemode: true,
        organizationId: 'org_mock_123',
        customerId: 'cust_mock_123',
        priceId: 'price_mock_1',
        name: 'Subscription 1',
        status: 'active' as const,
        current: true,
        intervalCount: 1,
        interval: 'month' as const,
        metadata: null,
        trialStart: null,
        trialEnd: null,
        currentBillingPeriodStart: Date.now(),
        currentBillingPeriodEnd: Date.now(),
        canceledAt: null,
        cancelScheduledAt: null,
        backupPaymentMethodId: null,
        defaultPaymentMethodId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        experimental: { features: [], usageMeterBalances: [] },
      }

      const mockSubscription2 = {
        ...mockSubscription1,
        id: 'sub_2',
        name: 'Subscription 2',
      }

      const mockBillingData = createMockBillingData({
        currentSubscriptions: [mockSubscription1, mockSubscription2],
      })

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: mockBillingData }),
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        expect(result.current.loaded).toBe(true)
      })

      if (result.current.adjustSubscription) {
        await expect(
          result.current.adjustSubscription({
            priceSlug: 'pro-monthly',
          })
        ).rejects.toThrow(
          'Customer has multiple active subscriptions. Please specify subscriptionId in params.'
        )
      }
    })
  })
})

// ============================================================================
// usePricingModel Hook Tests
// ============================================================================

describe('usePricingModel', () => {
  let originalFetch: typeof fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  describe('when __devMode is true', () => {
    it('returns pricingModel from billingMocks without network calls', async () => {
      const mockBillingData = createMockBillingData()

      const { result } = renderHook(() => usePricingModel(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      expect(result.current?.defaultCurrency).toBe('usd')
      expect(result.current?.products).toHaveLength(1)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('when __devMode is false (production mode)', () => {
    it('returns null while pricing model fetch is pending', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolves
          })
      )

      const { result } = renderHook(() => usePricingModel(), {
        wrapper: createWrapper({ devMode: false }),
      })

      expect(result.current).toBe(null)
    })

    it('returns pricing model on successful fetch', async () => {
      const mockPricingModel = {
        products: [{ id: 'prod_1', slug: 'test-product' }],
        defaultCurrency: 'usd',
      }

      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: {
              pricingModel: mockPricingModel,
              source: 'default',
            },
          }),
      })

      const { result } = renderHook(() => usePricingModel(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        expect(result.current).not.toBe(null)
      })

      expect(result.current?.defaultCurrency).toBe('usd')
      expect(result.current?.products).toHaveLength(1)
    })

    it('returns null when response contains error object', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            error: { code: 'NOT_FOUND', json: {} },
          }),
      })

      const { result } = renderHook(() => usePricingModel(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        // Wait for the query to complete - we check the fetch was called
        expect(mockFetch).toHaveBeenCalled()
      })

      // Give it a moment to process the error
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(result.current).toBe(null)
    })

    it('returns null when pricingModel is not present in response data', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: {},
          }),
      })

      const { result } = renderHook(() => usePricingModel(), {
        wrapper: createWrapper({ devMode: false }),
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      // Give it a moment to process
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(result.current).toBe(null)
    })
  })
})

// ============================================================================
// usePricing and useCatalog Alias Tests
// ============================================================================

describe('usePricing', () => {
  it('returns the same value as usePricingModel (alias function)', async () => {
    const mockBillingData = createMockBillingData()

    const wrapper = createWrapper({
      devMode: true,
      billingMocks: mockBillingData,
    })

    const { result: pricingResult } = renderHook(() => usePricing(), {
      wrapper,
    })
    const { result: pricingModelResult } = renderHook(
      () => usePricingModel(),
      { wrapper }
    )

    // Both should return the same data structure
    expect(pricingResult.current?.defaultCurrency).toBe(
      pricingModelResult.current?.defaultCurrency
    )
    expect(pricingResult.current?.products?.length).toBe(
      pricingModelResult.current?.products?.length
    )
  })
})

describe('useCatalog', () => {
  it('returns the same value as usePricingModel (backward compatibility)', async () => {
    const mockBillingData = createMockBillingData()

    const wrapper = createWrapper({
      devMode: true,
      billingMocks: mockBillingData,
    })

    const { result: catalogResult } = renderHook(() => useCatalog(), {
      wrapper,
    })
    const { result: pricingModelResult } = renderHook(
      () => usePricingModel(),
      { wrapper }
    )

    // useCatalog should be functionally identical to usePricingModel
    expect(catalogResult.current?.defaultCurrency).toBe(
      pricingModelResult.current?.defaultCurrency
    )
    expect(catalogResult.current?.products?.length).toBe(
      pricingModelResult.current?.products?.length
    )
  })
})

// ============================================================================
// Dev Mode Action Functions Tests
// ============================================================================

describe('dev mode action functions', () => {
  describe('cancelSubscription in dev mode', () => {
    it('returns canceled subscription with updated status when subscription exists in currentSubscriptions', async () => {
      const mockBillingData = createMockBillingData()

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      const cancelResult = await result.current.cancelSubscription!({
        id: 'sub_mock_123',
        cancellation: {
          timing: 'immediately',
        },
      })

      expect(cancelResult.subscription.subscription.status).toBe(
        'canceled'
      )
      expect(cancelResult.subscription.subscription.current).toBe(
        false
      )
      expect(
        typeof cancelResult.subscription.subscription.canceledAt
      ).toBe('number')
      expect(
        cancelResult.subscription.subscription.cancelScheduledAt
      ).toBe(null)
    })

    it('rejects when subscription id is not found', async () => {
      const mockBillingData = createMockBillingData({
        currentSubscriptions: [],
        currentSubscription: null,
        subscriptions: [],
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      await expect(
        result.current.cancelSubscription!({
          id: 'nonexistent',
          cancellation: { timing: 'immediately' },
        })
      ).rejects.toThrow(
        'Dev mode: no subscription found for id "nonexistent"'
      )
    })
  })

  describe('uncancelSubscription in dev mode', () => {
    it('returns active subscription when subscription exists', async () => {
      const mockBillingData = createMockBillingData()

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      const uncancelResult = await result.current
        .uncancelSubscription!({
        id: 'sub_mock_123',
      })

      expect(uncancelResult.subscription.subscription.status).toBe(
        'active'
      )
      expect(uncancelResult.subscription.subscription.current).toBe(
        true
      )
      expect(
        uncancelResult.subscription.subscription.canceledAt
      ).toBe(null)
      expect(
        uncancelResult.subscription.subscription.cancelScheduledAt
      ).toBe(null)
    })

    it('rejects when subscription id is not found', async () => {
      const mockBillingData = createMockBillingData({
        currentSubscriptions: [],
        currentSubscription: null,
        subscriptions: [],
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      await expect(
        result.current.uncancelSubscription!({
          id: 'nonexistent',
        })
      ).rejects.toThrow(
        'Dev mode: no subscription found for id "nonexistent"'
      )
    })
  })

  describe('adjustSubscription in dev mode', () => {
    it('auto-resolves subscriptionId and returns adjusted subscription when customer has exactly one subscription', async () => {
      const mockBillingData = createMockBillingData()

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      const adjustResult = await result.current.adjustSubscription!({
        priceSlug: 'pro-monthly',
      })

      expect(
        typeof adjustResult.subscription.subscription.updatedAt
      ).toBe('number')
      expect(adjustResult.subscription.subscriptionItems).toEqual([])
      expect(adjustResult.subscription.isUpgrade).toBe(false)
      expect(adjustResult.subscription.resolvedTiming).toBe(
        'immediately'
      )
    })

    it('rejects when no subscriptionId and customer has zero subscriptions', async () => {
      const mockBillingData = createMockBillingData({
        currentSubscriptions: [],
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      await expect(
        result.current.adjustSubscription!({
          priceSlug: 'pro-monthly',
        })
      ).rejects.toThrow(
        'Dev mode: no active subscription found for this customer'
      )
    })

    it('rejects when no subscriptionId and customer has multiple subscriptions', async () => {
      const mockSubscription1 = {
        id: 'sub_1',
        livemode: true,
        organizationId: 'org_mock_123',
        customerId: 'cust_mock_123',
        priceId: 'price_mock_1',
        name: 'Subscription 1',
        status: 'active' as const,
        current: true,
        intervalCount: 1,
        interval: 'month' as const,
        metadata: null,
        trialStart: null,
        trialEnd: null,
        currentBillingPeriodStart: Date.now(),
        currentBillingPeriodEnd: Date.now(),
        canceledAt: null,
        cancelScheduledAt: null,
        backupPaymentMethodId: null,
        defaultPaymentMethodId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        experimental: { features: [], usageMeterBalances: [] },
      }

      const mockSubscription2 = {
        ...mockSubscription1,
        id: 'sub_2',
        name: 'Subscription 2',
      }

      const mockBillingData = createMockBillingData({
        currentSubscriptions: [mockSubscription1, mockSubscription2],
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      await expect(
        result.current.adjustSubscription!({
          priceSlug: 'pro-monthly',
        })
      ).rejects.toThrow(
        'Dev mode: customer has multiple active subscriptions. Please specify subscriptionId in params.'
      )
    })

    it('uses provided subscriptionId when specified', async () => {
      const mockSubscription1 = {
        id: 'sub_specific',
        livemode: true,
        organizationId: 'org_mock_123',
        customerId: 'cust_mock_123',
        priceId: 'price_mock_1',
        name: 'Specific Subscription',
        status: 'active' as const,
        current: true,
        intervalCount: 1,
        interval: 'month' as const,
        metadata: null,
        trialStart: null,
        trialEnd: null,
        currentBillingPeriodStart: Date.now(),
        currentBillingPeriodEnd: Date.now(),
        canceledAt: null,
        cancelScheduledAt: null,
        backupPaymentMethodId: null,
        defaultPaymentMethodId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        experimental: { features: [], usageMeterBalances: [] },
      }

      const mockSubscription2 = {
        ...mockSubscription1,
        id: 'sub_other',
        name: 'Other Subscription',
      }

      const mockBillingData = createMockBillingData({
        currentSubscriptions: [mockSubscription1, mockSubscription2],
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      const adjustResult = await result.current.adjustSubscription!({
        priceSlug: 'pro-monthly',
        subscriptionId: 'sub_specific',
      })

      expect(adjustResult.subscription.subscription.id).toBe(
        'sub_specific'
      )
      expect(adjustResult.subscription.subscription.name).toBe(
        'Specific Subscription'
      )
    })

    it('rejects when provided subscriptionId does not exist', async () => {
      // Need to ensure currentSubscription is null so the fallback doesn't kick in
      // The implementation falls back to currentSubscription if not found in arrays
      const mockBillingData = createMockBillingData({
        currentSubscription: null,
        currentSubscriptions: [],
        subscriptions: [],
      })

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      await expect(
        result.current.adjustSubscription!({
          priceSlug: 'pro-monthly',
          subscriptionId: 'nonexistent',
        })
      ).rejects.toThrow(
        'Dev mode: no subscription found for id "nonexistent"'
      )
    })
  })

  describe('createUsageEvent in dev mode', () => {
    it('returns a mock usage event id', async () => {
      const mockBillingData = createMockBillingData()

      const { result } = renderHook(() => useBilling(), {
        wrapper: createWrapper({
          devMode: true,
          billingMocks: mockBillingData,
        }),
      })

      const usageResult = await result.current.createUsageEvent!({
        usageMeterSlug: 'api-calls',
      })

      expect('usageEvent' in usageResult).toBe(true)
      if ('usageEvent' in usageResult) {
        expect(usageResult.usageEvent.id).toBe('dev-usage-event-id')
      }
    })
  })
})
