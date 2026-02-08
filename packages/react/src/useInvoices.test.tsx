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
  InvoiceDetails,
} from '@flowglad/shared'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'
import { useInvoices } from './useInvoices'

const mockInvoices: InvoiceDetails[] = [
  {
    invoice: {
      id: 'inv_123',
      type: 'purchase',
      status: 'paid',
      amountDue: 9900,
      currency: 'USD',
      customerId: 'cust_123',
      livemode: false,
      organizationId: 'org_123',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      applicationFee: null,
      bankPaymentOnly: null,
      billingRunId: null,
      dueDate: null,
      memo: null,
      pdfURL: null,
      purchaseId: 'purch_123',
      receiptPdfURL: null,
      stripeInvoiceId: null,
      stripePaymentIntentId: null,
      subscriptionId: null,
      invoiceNumber: null,
    },
    invoiceLineItems: [],
  } as unknown as InvoiceDetails,
  {
    invoice: {
      id: 'inv_456',
      type: 'purchase',
      status: 'paid',
      amountDue: 19900,
      currency: 'USD',
      customerId: 'cust_123',
      livemode: false,
      organizationId: 'org_123',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      applicationFee: null,
      bankPaymentOnly: null,
      billingRunId: null,
      dueDate: null,
      memo: null,
      pdfURL: null,
      purchaseId: 'purch_456',
      receiptPdfURL: null,
      stripeInvoiceId: null,
      stripePaymentIntentId: null,
      subscriptionId: null,
      invoiceNumber: null,
    },
    invoiceLineItems: [],
  } as unknown as InvoiceDetails,
]

const mockInvoicesResponse = {
  data: {
    invoices: mockInvoices,
  },
}

const createMockBillingData = (
  options: { invoices?: InvoiceDetails[] | undefined } = {}
): CustomerBillingDetails => {
  const now = Date.now()
  const hasInvoices = Object.prototype.hasOwnProperty.call(
    options,
    'invoices'
  )
  const resolvedInvoices = hasInvoices
    ? (options.invoices ?? [])
    : mockInvoices

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
    invoices: resolvedInvoices as CustomerBillingDetails['invoices'],
    paymentMethods: [],
    pricingModel,
    purchases: [],
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

describe('useInvoices', () => {
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

  it('returns invoices after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockInvoicesResponse),
    })

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.invoices).toHaveLength(2)
    expect(result.current.invoices?.[0]?.invoice.id).toBe('inv_123')
    expect(result.current.invoices?.[1]?.invoice.id).toBe('inv_456')
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

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'Authentication required'
    )
    expect(result.current.invoices).toBeUndefined()
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(true, billingMocks),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.invoices).toHaveLength(2)
    expect(result.current.invoices?.[0]?.invoice.id).toBe('inv_123')
    expect(result.current.invoices?.[1]?.invoice.id).toBe('inv_456')
  })

  it('passes limit param', async () => {
    const limitedResponse = {
      data: {
        invoices: [mockInvoices[0]],
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(limitedResponse),
    })

    const { result } = renderHook(() => useInvoices({ limit: 1 }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.invoices).toHaveLength(1)
    expect(result.current.invoices?.[0]?.invoice.id).toBe('inv_123')
    expect(result.current.error).toBe(null)

    // Verify the fetch was called with the limit in the body
    const fetchCall = mockFetch.mock.calls[0]
    expect(JSON.parse(fetchCall[1].body)).toEqual({ limit: 1 })
  })

  it('passes startingAfter param', async () => {
    const limitedResponse = {
      data: {
        invoices: [mockInvoices[1]],
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(limitedResponse),
    })

    const { result } = renderHook(
      () => useInvoices({ startingAfter: 'inv_123' }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.invoices).toHaveLength(1)
    expect(result.current.invoices?.[0]?.invoice.id).toBe('inv_456')
    expect(result.current.error).toBe(null)

    const fetchCall = mockFetch.mock.calls[0]
    expect(JSON.parse(fetchCall[1].body)).toEqual({
      startingAfter: 'inv_123',
    })
  })

  it('returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'HTTP 500: Internal Server Error'
    )
    expect(result.current.invoices).toBeUndefined()
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
      renderHook(() => useInvoices(), {
        wrapper: wrapperWithoutMocks,
      })
    }).toThrow('FlowgladProvider: __devMode requires billingMocks')
  })
})
