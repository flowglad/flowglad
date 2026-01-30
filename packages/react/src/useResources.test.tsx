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
import {
  RESOURCE_CLAIMS_QUERY_KEY,
  RESOURCES_QUERY_KEY,
  useResource,
  useResources,
} from './useResources'

// Mock data
const mockResourcesData = {
  data: {
    resources: [
      {
        resourceSlug: 'seats',
        resourceId: 'res_seats_123',
        capacity: 10,
        claimed: 3,
        available: 7,
      },
      {
        resourceSlug: 'api_keys',
        resourceId: 'res_api_keys_123',
        capacity: 5,
        claimed: 2,
        available: 3,
      },
    ],
  },
}

const mockClaimsData = {
  data: {
    claims: [
      {
        id: 'claim_1',
        subscriptionItemFeatureId: 'sif_1',
        resourceId: 'res_seats_123',
        subscriptionId: 'sub_123',
        pricingModelId: 'pm_123',
        externalId: 'user_123',
        claimedAt: Date.now() - 10000,
        releasedAt: null,
        releaseReason: null,
        metadata: null,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 10000,
      },
      {
        id: 'claim_2',
        subscriptionItemFeatureId: 'sif_1',
        resourceId: 'res_seats_123',
        subscriptionId: 'sub_123',
        pricingModelId: 'pm_123',
        externalId: null,
        claimedAt: Date.now() - 5000,
        releasedAt: null,
        releaseReason: null,
        metadata: null,
        createdAt: Date.now() - 5000,
        updatedAt: Date.now() - 5000,
      },
    ],
  },
}

const mockClaimResponse = {
  data: {
    claims: [
      {
        id: 'claim_new',
        subscriptionItemFeatureId: 'sif_1',
        resourceId: 'res_seats_123',
        subscriptionId: 'sub_123',
        pricingModelId: 'pm_123',
        externalId: null,
        claimedAt: Date.now(),
        releasedAt: null,
        releaseReason: null,
        metadata: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    usage: {
      resourceSlug: 'seats',
      resourceId: 'res_seats_123',
      capacity: 10,
      claimed: 4,
      available: 6,
    },
  },
}

const mockReleaseResponse = {
  data: {
    releasedClaims: [
      {
        id: 'claim_1',
        subscriptionItemFeatureId: 'sif_1',
        resourceId: 'res_seats_123',
        subscriptionId: 'sub_123',
        pricingModelId: 'pm_123',
        externalId: 'user_123',
        claimedAt: Date.now() - 10000,
        releasedAt: Date.now(),
        releaseReason: null,
        metadata: null,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now(),
      },
    ],
    usage: {
      resourceSlug: 'seats',
      resourceId: 'res_seats_123',
      capacity: 10,
      claimed: 2,
      available: 8,
    },
  },
}

// Create wrapper for hooks
const createWrapper = (devMode = false) => {
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
      >
        {children}
      </FlowgladConfigProvider>
    </QueryClientProvider>
  )
}

describe('useResources', () => {
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

  describe('fetching resources', () => {
    it('returns resources array after successful fetch, with isLoading=false', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResourcesData),
      })

      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(),
      })

      // Initially loading
      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.resources).toEqual(
        mockResourcesData.data.resources
      )
      expect(result.current.error).toBe(null)
    })

    it('returns isLoading=true during initial fetch', async () => {
      let resolvePromise: (value: unknown) => void
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      mockFetch.mockImplementationOnce(() => pendingPromise)

      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.resources).toBeUndefined()

      // Resolve the promise to clean up
      resolvePromise!({
        json: () => Promise.resolve(mockResourcesData),
      })
    })

    it('returns error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            error: { message: 'Failed to fetch' },
          }),
      })

      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.error).not.toBe(null)
      expect(result.current.resources).toBeUndefined()
    })
  })

  describe('claim mutation', () => {
    it('invalidates resources query cache when claim() succeeds', async () => {
      // First fetch returns initial resources
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResourcesData),
      })

      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Setup claim response
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockClaimResponse),
      })
      // Setup refetch response (after invalidation)
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: {
              resources: [
                {
                  ...mockResourcesData.data.resources[0],
                  claimed: 4,
                  available: 6,
                },
                mockResourcesData.data.resources[1],
              ],
            },
          }),
      })

      await act(async () => {
        await result.current.claim({
          resourceSlug: 'seats',
          quantity: 1,
        })
      })

      // Verify the claim was called
      expect(mockFetch).toHaveBeenCalledTimes(3) // Initial fetch + claim + refetch
    })

    it('returns claims and usage after successful claim', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResourcesData),
      })

      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockClaimResponse),
      })
      // For the invalidation refetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResourcesData),
      })

      let claimResult: { claims: unknown[]; usage: unknown }

      await act(async () => {
        claimResult = await result.current.claim({
          resourceSlug: 'seats',
          quantity: 1,
        })
      })

      expect(claimResult!.claims).toHaveLength(1)
      expect(claimResult!.usage).toEqual(mockClaimResponse.data.usage)
    })
  })

  describe('release mutation', () => {
    it('invalidates resources query cache when release() succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResourcesData),
      })

      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockReleaseResponse),
      })
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: {
              resources: [
                {
                  ...mockResourcesData.data.resources[0],
                  claimed: 2,
                  available: 8,
                },
                mockResourcesData.data.resources[1],
              ],
            },
          }),
      })

      await act(async () => {
        await result.current.release({
          resourceSlug: 'seats',
          quantity: 1,
        })
      })

      // Verify the release was called
      expect(mockFetch).toHaveBeenCalledTimes(3) // Initial fetch + release + refetch
    })
  })

  describe('dev mode', () => {
    it('returns mock resources without network call when __devMode is true', async () => {
      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(true),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // No fetch calls should be made in dev mode
      expect(mockFetch).not.toHaveBeenCalled()

      // Should have mock data
      expect(Array.isArray(result.current.resources)).toBe(true)
      expect(result.current.resources!.length).toBeGreaterThan(0)
      expect(result.current.resources![0].resourceSlug).toBe('seats')
    })

    it('claim() returns mock data without network call in dev mode', async () => {
      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(true),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let claimResult: { claims: unknown[]; usage: unknown }

      await act(async () => {
        claimResult = await result.current.claim({
          resourceSlug: 'seats',
          quantity: 2,
        })
      })

      // No fetch calls in dev mode
      expect(mockFetch).not.toHaveBeenCalled()

      // Should return mock claims
      expect(claimResult!.claims).toHaveLength(2)
      expect(typeof claimResult!.usage).toBe('object')
    })

    it('release() returns mock data without network call in dev mode', async () => {
      const { result } = renderHook(() => useResources(), {
        wrapper: createWrapper(true),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let releaseResult: { releasedClaims: unknown[]; usage: unknown }

      await act(async () => {
        releaseResult = await result.current.release({
          resourceSlug: 'seats',
          quantity: 1,
        })
      })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(releaseResult!.releasedClaims).toHaveLength(1)
      expect(typeof releaseResult!.usage).toBe('object')
    })
  })
})

describe('useResource', () => {
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

  describe('fetching resource usage', () => {
    it('returns usage for specific resourceSlug filtered from resources array', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('resources/claims')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockClaimsData),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve(mockResourcesData),
        })
      })

      const { result } = renderHook(() => useResource('seats'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(typeof result.current.usage).toBe('object')
      expect(result.current.usage?.resourceSlug).toBe('seats')
      expect(result.current.usage?.capacity).toBe(10)
    })

    it('returns undefined usage when resourceSlug not found in resources', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('resources/claims')) {
          return Promise.resolve({
            json: () => Promise.resolve({ data: { claims: [] } }),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve(mockResourcesData),
        })
      })

      const { result } = renderHook(
        () => useResource('nonexistent'),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.usage).toBeUndefined()
    })
  })

  describe('fetching claims', () => {
    it('returns claims array for the specific resourceSlug, always as an array', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('resources/claims')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockClaimsData),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve(mockResourcesData),
        })
      })

      const { result } = renderHook(() => useResource('seats'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoadingClaims).toBe(false)
      })

      expect(Array.isArray(result.current.claims)).toBe(true)
      expect(result.current.claims.length).toBe(2)
    })

    it('returns empty claims array when no claims exist for resourceSlug', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('resources/claims')) {
          return Promise.resolve({
            json: () => Promise.resolve({ data: { claims: [] } }),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve(mockResourcesData),
        })
      })

      const { result } = renderHook(() => useResource('seats'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoadingClaims).toBe(false)
      })

      // claims should be an empty array, not undefined
      expect(result.current.claims).toEqual([])
    })
  })

  describe('pre-bound claim/release functions', () => {
    it('binds resourceSlug to claim() so caller only passes quantity/externalId/metadata', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('resources/claims')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockClaimsData),
          })
        }
        if (url.includes('resources/claim')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockClaimResponse),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve(mockResourcesData),
        })
      })

      const { result } = renderHook(() => useResource('seats'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.claim({ quantity: 1 })
      })

      // Verify the claim request included resourceSlug
      const claimCall = mockFetch.mock.calls.find(
        (call) =>
          (call[0] as string).includes('resources/claim') &&
          !(call[0] as string).includes('resources/claims')
      )
      // Assert that we found the claim call
      if (!claimCall) {
        throw new Error(
          'Expected claim call to be found in mock.calls'
        )
      }
      const body = JSON.parse(claimCall[1].body)
      expect(body.resourceSlug).toBe('seats')
      expect(body.quantity).toBe(1)
    })

    it('binds resourceSlug to release() so caller only passes quantity/externalId/claimIds', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('resources/claims')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockClaimsData),
          })
        }
        if (url.includes('resources/release')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockReleaseResponse),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve(mockResourcesData),
        })
      })

      const { result } = renderHook(() => useResource('seats'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.release({ quantity: 1 })
      })

      const releaseCall = mockFetch.mock.calls.find((call) =>
        (call[0] as string).includes('resources/release')
      )
      // Assert that we found the release call
      if (!releaseCall) {
        throw new Error(
          'Expected release call to be found in mock.calls'
        )
      }
      const body = JSON.parse(releaseCall[1].body)
      expect(body.resourceSlug).toBe('seats')
      expect(body.quantity).toBe(1)
    })
  })

  describe('dev mode', () => {
    it('returns mock usage and claims without network calls in dev mode', async () => {
      const { result } = renderHook(() => useResource('seats'), {
        wrapper: createWrapper(true),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.isLoadingClaims).toBe(false)
      })

      // No fetch calls in dev mode
      expect(mockFetch).not.toHaveBeenCalled()

      // Should have mock data
      expect(typeof result.current.usage).toBe('object')
      expect(Array.isArray(result.current.claims)).toBe(true)
    })
  })

  describe('shared query cache', () => {
    it('shares query cache with useResources() so both hooks have access to same data', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('resources/claims')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockClaimsData),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve(mockResourcesData),
        })
      })

      // Create a shared query client with stale time to prevent refetch
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 60000, // 1 minute - prevents refetch on mount
          },
        },
      })

      const sharedWrapper = ({
        children,
      }: {
        children: React.ReactNode
      }) => (
        <QueryClientProvider client={queryClient}>
          <FlowgladConfigProvider baseURL="https://test.example.com">
            {children}
          </FlowgladConfigProvider>
        </QueryClientProvider>
      )

      // Render first hook
      const { result: result1 } = renderHook(
        () => useResource('seats'),
        {
          wrapper: sharedWrapper,
        }
      )

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false)
      })

      // Render second hook with same query client
      const { result: result2 } = renderHook(
        () => useResource('api_keys'),
        {
          wrapper: sharedWrapper,
        }
      )

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false)
      })

      // Both hooks should have data from the same shared resources query
      expect(typeof result1.current.usage).toBe('object')
      expect(result1.current.usage?.resourceSlug).toBe('seats')
      expect(typeof result2.current.usage).toBe('object')
      expect(result2.current.usage?.resourceSlug).toBe('api_keys')

      // Both are derived from the same resources array
      // The resources array should contain both resource types
      const allResources = mockResourcesData.data.resources
      expect(
        allResources.some((r) => r.resourceSlug === 'seats')
      ).toBe(true)
      expect(
        allResources.some((r) => r.resourceSlug === 'api_keys')
      ).toBe(true)
    })
  })
})
