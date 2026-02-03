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
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { FlowgladConfigProvider } from './FlowgladConfigContext'

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

  it.skip('returns customer after successful fetch', async () => {
    // TODO: Implement in Patch 3
  })

  it.skip('returns error on API error', async () => {
    // TODO: Implement in Patch 3
  })

  it.skip('uses billingMocks in dev mode', async () => {
    // TODO: Implement in Patch 3
  })

  it.skip('throws error in dev mode when billingMocks.customer missing', () => {
    // TODO: Implement in Patch 3
  })

  it.skip('returns error on HTTP failure (non-2xx status)', async () => {
    // TODO: Implement in Patch 3
  })

  it.skip('uses betterAuthBasePath route when configured', async () => {
    // TODO: Implement in Patch 3
  })
})

describe('subscription mutations', () => {
  it.skip('invalidate customer details query key', async () => {
    // TODO: Implement in Patch 4
  })
})
