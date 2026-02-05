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
import { act, renderHook } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { useCheckouts } from './useCheckouts'

// Mock checkout session response
const mockCheckoutSessionResponse = {
  data: {
    checkoutSession: {
      id: 'cs_test_123',
    },
    url: 'https://checkout.stripe.com/test-session',
  },
}

// Create mock billing data for dev mode
const createMockBillingData = (): CustomerBillingDetails => {
  const now = Date.now()
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
    billingPortalUrl: 'https://billing.example.com',
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
    purchases: [],
    subscriptions: [],
  }
}

// Create wrapper for hooks
const createWrapper = (
  devMode = false,
  billingMocks?: CustomerBillingDetails,
  betterAuthBasePath?: string
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
        betterAuthBasePath={betterAuthBasePath}
        __devMode={devMode}
        billingMocks={billingMocks}
      >
        {children}
      </FlowgladConfigProvider>
    </QueryClientProvider>
  )
}

describe('useCheckouts', () => {
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

  it('createCheckoutSession calls API with params', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockCheckoutSessionResponse),
    })

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.createCheckoutSession({
        priceSlug: 'pro-monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe(
      'https://test.example.com/api/flowglad/checkout-sessions/create'
    )
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(options.body)
    expect(body.priceSlug).toBe('pro-monthly')
    expect(body.successUrl).toBe('https://example.com/success')
    expect(body.cancelUrl).toBe('https://example.com/cancel')
    expect(body.type).toBe('product')
  })

  it('createCheckoutSession returns checkout session', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockCheckoutSessionResponse),
    })

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(),
    })

    let response: Awaited<
      ReturnType<typeof result.current.createCheckoutSession>
    >
    await act(async () => {
      response = await result.current.createCheckoutSession({
        priceSlug: 'pro-monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
    })

    expect(response!).toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test-session',
    })
  })

  it('createCheckoutSession returns mock in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(true, billingMocks),
    })

    let response: Awaited<
      ReturnType<typeof result.current.createCheckoutSession>
    >
    await act(async () => {
      response = await result.current.createCheckoutSession({
        priceSlug: 'pro-monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(response!).toEqual({
      id: 'mock_checkout_session',
      url: 'https://checkout.stripe.com/mock',
    })
  })

  it('createAddPaymentMethodCheckoutSession calls API', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockCheckoutSessionResponse),
    })

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.createAddPaymentMethodCheckoutSession({
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe(
      'https://test.example.com/api/flowglad/checkout-sessions/create-add-payment-method'
    )
    expect(options.method).toBe('POST')
  })

  it('createAddPaymentMethodCheckoutSession sends required URLs in request body', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockCheckoutSessionResponse),
    })

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(),
    })

    let response: Awaited<
      ReturnType<
        typeof result.current.createAddPaymentMethodCheckoutSession
      >
    >
    await act(async () => {
      response =
        await result.current.createAddPaymentMethodCheckoutSession({
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body).toEqual({
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })

    expect(response!).toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test-session',
    })
  })

  it('createAddPaymentMethodCheckoutSession returns mock in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(true, billingMocks),
    })

    let response: Awaited<
      ReturnType<
        typeof result.current.createAddPaymentMethodCheckoutSession
      >
    >
    await act(async () => {
      response =
        await result.current.createAddPaymentMethodCheckoutSession({
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(response!).toEqual({
      id: 'mock_add_pm_session',
      url: 'https://checkout.stripe.com/mock-add-pm',
    })
  })

  it('createActivateSubscriptionCheckoutSession calls API', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockCheckoutSessionResponse),
    })

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(),
    })

    let response: Awaited<
      ReturnType<
        typeof result.current.createActivateSubscriptionCheckoutSession
      >
    >
    await act(async () => {
      response =
        await result.current.createActivateSubscriptionCheckoutSession(
          {
            targetSubscriptionId: 'sub_123',
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel',
          }
        )
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe(
      'https://test.example.com/api/flowglad/checkout-sessions/create-activate-subscription'
    )
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.targetSubscriptionId).toBe('sub_123')
    expect(body.successUrl).toBe('https://example.com/success')
    expect(body.cancelUrl).toBe('https://example.com/cancel')

    expect(response!).toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test-session',
    })
  })

  it('createActivateSubscriptionCheckoutSession returns mock in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(true, billingMocks),
    })

    let response: Awaited<
      ReturnType<
        typeof result.current.createActivateSubscriptionCheckoutSession
      >
    >
    await act(async () => {
      response =
        await result.current.createActivateSubscriptionCheckoutSession(
          {
            targetSubscriptionId: 'sub_123',
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel',
          }
        )
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(response!).toEqual({
      id: 'mock_activate_sub_session',
      url: 'https://checkout.stripe.com/mock-activate',
    })
  })

  it('handles API errors', async () => {
    const errorResponse = {
      error: {
        code: 'INVALID_PRICE',
        json: { message: 'Price not found' },
      },
    }
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(errorResponse),
    })

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(),
    })

    let response: Awaited<
      ReturnType<typeof result.current.createCheckoutSession>
    >
    await act(async () => {
      response = await result.current.createCheckoutSession({
        priceSlug: 'nonexistent-price',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
    })

    expect(response!).toEqual({
      error: {
        code: 'INVALID_PRICE',
        json: { message: 'Price not found' },
      },
    })
  })

  it('returns NETWORK_ERROR when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'))

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(),
    })

    let response: Awaited<
      ReturnType<typeof result.current.createCheckoutSession>
    >
    await act(async () => {
      response = await result.current.createCheckoutSession({
        priceSlug: 'pro-monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
    })

    expect(response!).toEqual({
      error: {
        code: 'NETWORK_ERROR',
        json: {
          message: 'Network failure',
          original: 'Error: Network failure',
        },
      },
    })
  })

  it('returns INVALID_JSON when response is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.reject(new Error('Unexpected token')),
    })

    const { result } = renderHook(() => useCheckouts(), {
      wrapper: createWrapper(),
    })

    let response: Awaited<
      ReturnType<typeof result.current.createCheckoutSession>
    >
    await act(async () => {
      response = await result.current.createCheckoutSession({
        priceSlug: 'pro-monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
    })

    expect(response!).toEqual({
      error: {
        code: 'INVALID_JSON',
        json: {
          message: 'Unexpected token',
          original: 'Error: Unexpected token',
        },
      },
    })
  })
})
