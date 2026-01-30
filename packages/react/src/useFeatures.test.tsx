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

describe.skip('useFeatures', () => {
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
    // Test stub - to be implemented in Patch 5
  })

  it('returns error on API error (auth edge case)', async () => {
    // Test stub - to be implemented in Patch 5
  })

  it('uses billingMocks in dev mode', async () => {
    // Test stub - to be implemented in Patch 5
  })

  it('throws error in dev mode when billingMocks missing', () => {
    // Test stub - to be implemented in Patch 5
  })

  it('filters by subscriptionId in dev mode', async () => {
    // Test stub - to be implemented in Patch 5
  })

  it('returns empty array when no toggle features', async () => {
    // Test stub - to be implemented in Patch 5
  })
})

describe.skip('useFeature', () => {
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
    // Test stub - to be implemented in Patch 5
  })

  it('returns hasAccess: true when feature exists', async () => {
    // Test stub - to be implemented in Patch 5
  })

  it('returns hasAccess: false when feature not found', async () => {
    // Test stub - to be implemented in Patch 5
  })

  it('uses billingMocks in dev mode', async () => {
    // Test stub - to be implemented in Patch 5
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
