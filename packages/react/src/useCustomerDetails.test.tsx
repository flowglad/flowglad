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
import { invalidateCustomerData } from './lib/invalidation'
import {
  CUSTOMER_DETAILS_QUERY_KEY,
  useCustomerDetails,
} from './useCustomerDetails'

// Mock data
const mockCustomerDetails = {
  id: 'cust_123',
  livemode: false,
  email: 'test@example.com',
  name: 'Test Customer',
  externalId: 'ext_123',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const mockCustomerDetailsResponse = {
  data: {
    customer: mockCustomerDetails,
  },
}

// Create mock billing data
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
  currentSubscription: null,
  currentSubscriptions: [],
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
const createWrapper = (devMode = false, billingMocks?: unknown) => {
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

describe('useCustomerDetails', () => {
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

  it('returns customer after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockCustomerDetailsResponse),
    })

    const { result } = renderHook(() => useCustomerDetails(), {
      wrapper: createWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.customer).toEqual(mockCustomerDetails)
    expect(result.current.error).toBe(null)

    // Verify fetch was called with correct URL and method
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[0]).toBe(
      'https://test.example.com/api/flowglad/customerDetails'
    )
    expect(fetchCall[1].method).toBe('POST')
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

    const { result } = renderHook(() => useCustomerDetails(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'Authentication required'
    )
    expect(result.current.customer).toBeUndefined()
  })

  it('uses billingMocks in dev mode', async () => {
    const billingMocks = createMockBillingData()

    const { result } = renderHook(() => useCustomerDetails(), {
      wrapper: createWrapper(true, billingMocks),
    })

    // In dev mode, data should be immediately available
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)

    // No fetch calls should be made in dev mode
    expect(mockFetch).not.toHaveBeenCalled()

    // Should have customer derived from billingMocks
    expect(result.current.customer?.id).toBe('cust_123')
    expect(result.current.customer?.email).toBe('test@example.com')
    expect(result.current.customer?.name).toBe('Test Customer')
    expect(result.current.customer?.externalId).toBe('ext_123')
  })

  it('throws error in dev mode when billingMocks.customer missing', () => {
    // Create a wrapper without customer in billingMocks for dev mode
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const wrapperWithoutCustomer = ({
      children,
    }: {
      children: React.ReactNode
    }) => (
      <QueryClientProvider client={queryClient}>
        <FlowgladConfigProvider
          baseURL="https://test.example.com"
          __devMode={true}
          billingMocks={{ customer: null } as never}
        >
          {children}
        </FlowgladConfigProvider>
      </QueryClientProvider>
    )

    expect(() => {
      renderHook(() => useCustomerDetails(), {
        wrapper: wrapperWithoutCustomer,
      })
    }).toThrow('billingMocks.customer is required in dev mode')
  })

  it('returns error on HTTP failure (non-2xx status)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useCustomerDetails(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).not.toBe(null)
    expect(result.current.error?.message).toBe(
      'HTTP 500: Internal Server Error'
    )
    expect(result.current.customer).toBeUndefined()
  })

  it('uses betterAuthBasePath route when configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockCustomerDetailsResponse),
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

    const { result } = renderHook(() => useCustomerDetails(), {
      wrapper: wrapperWithBetterAuth,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verify the fetch was called with the betterAuth route
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[0]).toBe('/api/auth/flowglad/customerDetails')
    expect(fetchCall[1].method).toBe('POST')
  })
})

describe('subscription mutations', () => {
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

  it('invalidate customer details query key', async () => {
    const { wrapper, queryClient } = createWrapperWithQueryClient()

    // Mock fetch to return customer details data
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCustomerDetailsResponse),
    })

    // Render the hook to populate the cache
    const { result } = renderHook(() => useCustomerDetails(), {
      wrapper,
    })

    // Wait for the query to succeed
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.customer?.id).toBe('cust_123')

    // Spy on invalidateQueries to verify it was called
    const invalidateQueriesSpy = spyOn(
      queryClient,
      'invalidateQueries'
    )

    // Call the invalidation helper (simulating a subscription mutation)
    await act(async () => {
      await invalidateCustomerData(queryClient)
    })

    // Verify that invalidateQueries was called with CUSTOMER_DETAILS_QUERY_KEY
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: [CUSTOMER_DETAILS_QUERY_KEY],
    })

    // Cleanup
    invalidateQueriesSpy.mockRestore()
  })
})

// Export query key for external tests
export { CUSTOMER_DETAILS_QUERY_KEY }
