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
import { act, renderHook } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'

// TODO: Uncomment when hook is implemented
// import { useCheckouts } from './useCheckouts'

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
const createWrapper = (
  devMode = false,
  billingMocks?: ReturnType<typeof createMockBillingData>,
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
        billingMocks={billingMocks as never}
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

  it.skip('createCheckoutSession calls API with params', () => {
    // TODO: Implement in Patch 2
  })

  it.skip('createCheckoutSession returns checkout session', () => {
    // TODO: Implement in Patch 2
  })

  it.skip('createCheckoutSession returns mock in dev mode', () => {
    // TODO: Implement in Patch 2
  })

  it.skip('createAddPaymentMethodCheckoutSession calls API', () => {
    // TODO: Implement in Patch 2
  })

  it.skip('createAddPaymentMethodCheckoutSession works with no params', () => {
    // TODO: Implement in Patch 2
  })

  it.skip('createAddPaymentMethodCheckoutSession returns mock in dev mode', () => {
    // TODO: Implement in Patch 2
  })

  it.skip('createActivateSubscriptionCheckoutSession calls API', () => {
    // TODO: Implement in Patch 2
  })

  it.skip('createActivateSubscriptionCheckoutSession returns mock in dev mode', () => {
    // TODO: Implement in Patch 2
  })

  it.skip('handles API errors', () => {
    // TODO: Implement in Patch 2
  })
})
