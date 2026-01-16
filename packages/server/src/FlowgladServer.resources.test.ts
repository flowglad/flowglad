import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowgladServer } from './FlowgladServer'
import type { CoreCustomerUser } from './types'

/**
 * Mock subscription data for testing
 */
const mockSubscription = {
  id: 'sub_test_123',
  customerId: 'cust_test_123',
  status: 'active',
}

const mockSubscription2 = {
  id: 'sub_test_456',
  customerId: 'cust_test_123',
  status: 'active',
}

const mockCustomer = {
  id: 'cust_test_123',
  externalId: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
}

const mockResourceUsage = {
  resourceSlug: 'seats',
  resourceId: 'res_123',
  capacity: 10,
  claimed: 3,
  available: 7,
}

const mockResourceClaim = {
  id: 'claim_123',
  subscriptionItemFeatureId: 'sif_123',
  resourceId: 'res_123',
  subscriptionId: 'sub_test_123',
  pricingModelId: 'pm_123',
  externalId: null,
  claimedAt: Date.now(),
  releasedAt: null,
  releaseReason: null,
  metadata: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

/**
 * Creates a mock FlowgladServer with mocked flowgladNode methods
 */
const createMockFlowgladServer = (overrides: {
  currentSubscriptions?: Array<{ id: string }>
  subscriptionCustomerId?: string
  customerId?: string
}) => {
  const server = new FlowgladServer({
    apiKey: 'test-api-key',
    baseURL: 'http://localhost:3000',
    getRequestingCustomer: async (): Promise<CoreCustomerUser> => ({
      externalId: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
    }),
  })

  // Mock the internal methods
  const mockGetBilling = vi.fn().mockResolvedValue({
    currentSubscriptions: overrides.currentSubscriptions ?? [
      { id: mockSubscription.id },
    ],
  })

  const mockGetCustomer = vi.fn().mockResolvedValue({
    customer: {
      ...mockCustomer,
      id: overrides.customerId ?? mockCustomer.id,
    },
  })

  const mockSubscriptionsRetrieve = vi.fn().mockResolvedValue({
    subscription: {
      ...mockSubscription,
      customerId:
        overrides.subscriptionCustomerId ??
        mockSubscription.customerId,
    },
  })

  const mockGet = vi.fn()
  const mockPost = vi.fn()
  const mockResourceClaimsClaim = vi.fn()
  const mockResourceClaimsRelease = vi.fn()

  // Access private properties for mocking
  // We use type assertion to bypass strict type checking for partial mocks
  // @ts-expect-error - accessing private property for testing
  server.flowgladNode = {
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
    },
    customers: {
      retrieve: mockGetCustomer,
    },
    resourceClaims: {
      claim: mockResourceClaimsClaim,
      release: mockResourceClaimsRelease,
    },
    get: mockGet,
    post: mockPost,
  } as unknown

  // Override getBilling and getCustomer
  server.getBilling = mockGetBilling
  server.getCustomer = mockGetCustomer

  return {
    server,
    mocks: {
      getBilling: mockGetBilling,
      getCustomer: mockGetCustomer,
      subscriptionsRetrieve: mockSubscriptionsRetrieve,
      get: mockGet,
      post: mockPost,
      resourceClaimsClaim: mockResourceClaimsClaim,
      resourceClaimsRelease: mockResourceClaimsRelease,
    },
  }
}

describe('FlowgladServer resource methods', () => {
  describe('getResources', () => {
    it('returns all resources with usage when customer has single subscription and no subscriptionId provided', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      // Mock the /usages endpoint response format
      mocks.get.mockResolvedValue([
        { usage: mockResourceUsage, claims: [] },
      ])

      const result = await server.getResourceUsages()

      expect(result).toEqual({ resources: [mockResourceUsage] })
      expect(mocks.get).toHaveBeenCalledWith(
        `/api/v1/resource-claims/${mockSubscription.id}/usages`
      )
    })

    it('returns resources when subscriptionId is explicitly provided', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      // Mock the /usages endpoint response format
      mocks.get.mockResolvedValue([
        { usage: mockResourceUsage, claims: [] },
      ])

      const result = await server.getResourceUsages({
        subscriptionId: mockSubscription.id,
      })

      expect(result).toEqual({ resources: [mockResourceUsage] })
      expect(mocks.getBilling).not.toHaveBeenCalled() // Should not call getBilling when subscriptionId is provided
    })

    it('throws "multiple active subscriptions" error when customer has 2 subscriptions and no subscriptionId provided', async () => {
      const { server } = createMockFlowgladServer({
        currentSubscriptions: [
          { id: mockSubscription.id },
          { id: mockSubscription2.id },
        ],
      })

      await expect(server.getResourceUsages()).rejects.toThrow(
        'Customer has multiple active subscriptions. Please specify subscriptionId.'
      )
    })

    it('throws "No active subscription found" error when customer has no subscriptions', async () => {
      const { server } = createMockFlowgladServer({
        currentSubscriptions: [],
      })

      await expect(server.getResourceUsages()).rejects.toThrow(
        'No active subscription found for this customer'
      )
    })

    it('throws ownership error when subscription belongs to different customer', async () => {
      const { server } = createMockFlowgladServer({
        subscriptionCustomerId: 'cust_different',
        customerId: 'cust_test_123',
      })

      await expect(
        server.getResourceUsages({
          subscriptionId: mockSubscription.id,
        })
      ).rejects.toThrow(
        'Subscription is not owned by the current user'
      )
    })
  })

  describe('claimResource', () => {
    it('auto-resolves subscriptionId when customer has single subscription', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      mocks.resourceClaimsClaim.mockResolvedValue({
        claims: [mockResourceClaim],
        usage: mockResourceUsage,
      })

      const result = await server.claimResource({
        resourceSlug: 'seats',
        quantity: 1,
      })

      expect(result).toEqual({
        claims: [mockResourceClaim],
        usage: mockResourceUsage,
      })
      expect(mocks.resourceClaimsClaim).toHaveBeenCalledWith(
        mockSubscription.id,
        expect.objectContaining({
          resourceSlug: 'seats',
          quantity: 1,
        })
      )
    })

    it('throws "multiple active subscriptions" error when customer has multiple subscriptions without subscriptionId', async () => {
      const { server } = createMockFlowgladServer({
        currentSubscriptions: [
          { id: mockSubscription.id },
          { id: mockSubscription2.id },
        ],
      })

      await expect(
        server.claimResource({
          resourceSlug: 'seats',
          quantity: 1,
        })
      ).rejects.toThrow(
        'Customer has multiple active subscriptions. Please specify subscriptionId.'
      )
    })

    it('throws "No active subscription found" error when customer has no subscriptions', async () => {
      const { server } = createMockFlowgladServer({
        currentSubscriptions: [],
      })

      await expect(
        server.claimResource({
          resourceSlug: 'seats',
          quantity: 1,
        })
      ).rejects.toThrow(
        'No active subscription found for this customer'
      )
    })

    it('throws "not owned by current user" error when subscriptionId belongs to different customer', async () => {
      const { server } = createMockFlowgladServer({
        subscriptionCustomerId: 'cust_different',
        customerId: 'cust_test_123',
      })

      await expect(
        server.claimResource({
          resourceSlug: 'seats',
          subscriptionId: mockSubscription.id,
          quantity: 1,
        })
      ).rejects.toThrow(
        'Subscription is not owned by the current user'
      )
    })

    it('sends correct payload for anonymous claims with quantity', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      mocks.resourceClaimsClaim.mockResolvedValue({
        claims: [mockResourceClaim, mockResourceClaim],
        usage: { ...mockResourceUsage, claimed: 5, available: 5 },
      })

      await server.claimResource({
        resourceSlug: 'seats',
        quantity: 2,
      })

      expect(mocks.resourceClaimsClaim).toHaveBeenCalledWith(
        mockSubscription.id,
        {
          resourceSlug: 'seats',
          metadata: undefined,
          quantity: 2,
          externalId: undefined,
          externalIds: undefined,
        }
      )
    })

    it('sends correct payload for named claims with externalId', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      const namedClaim = {
        ...mockResourceClaim,
        externalId: 'user_123',
      }
      mocks.resourceClaimsClaim.mockResolvedValue({
        claims: [namedClaim],
        usage: mockResourceUsage,
      })

      await server.claimResource({
        resourceSlug: 'seats',
        externalId: 'user_123',
        metadata: { assignedTo: 'John Doe' },
      })

      expect(mocks.resourceClaimsClaim).toHaveBeenCalledWith(
        mockSubscription.id,
        {
          resourceSlug: 'seats',
          metadata: { assignedTo: 'John Doe' },
          quantity: undefined,
          externalId: 'user_123',
          externalIds: undefined,
        }
      )
    })

    it('sends correct payload for named claims with externalIds array', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      mocks.resourceClaimsClaim.mockResolvedValue({
        claims: [
          { ...mockResourceClaim, externalId: 'user_1' },
          { ...mockResourceClaim, externalId: 'user_2' },
        ],
        usage: mockResourceUsage,
      })

      await server.claimResource({
        resourceSlug: 'seats',
        externalIds: ['user_1', 'user_2'],
      })

      expect(mocks.resourceClaimsClaim).toHaveBeenCalledWith(
        mockSubscription.id,
        {
          resourceSlug: 'seats',
          metadata: undefined,
          quantity: undefined,
          externalId: undefined,
          externalIds: ['user_1', 'user_2'],
        }
      )
    })
  })

  describe('releaseResource', () => {
    it('sends correct payload for releasing by quantity (anonymous, FIFO)', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      const releasedClaim = {
        ...mockResourceClaim,
        releasedAt: Date.now(),
      }
      mocks.resourceClaimsRelease.mockResolvedValue({
        releasedClaims: [releasedClaim, releasedClaim],
        usage: { ...mockResourceUsage, claimed: 1, available: 9 },
      })

      const result = await server.releaseResource({
        resourceSlug: 'seats',
        quantity: 2,
      })

      expect(result.releasedClaims).toHaveLength(2)
      expect(mocks.resourceClaimsRelease).toHaveBeenCalledWith(
        mockSubscription.id,
        {
          resourceSlug: 'seats',
          quantity: 2,
          externalId: undefined,
          externalIds: undefined,
          claimIds: undefined,
        }
      )
    })

    it('sends correct payload for releasing by externalId', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      mocks.resourceClaimsRelease.mockResolvedValue({
        releasedClaims: [
          {
            ...mockResourceClaim,
            externalId: 'user_123',
            releasedAt: Date.now(),
          },
        ],
        usage: mockResourceUsage,
      })

      await server.releaseResource({
        resourceSlug: 'seats',
        externalId: 'user_123',
      })

      expect(mocks.resourceClaimsRelease).toHaveBeenCalledWith(
        mockSubscription.id,
        {
          resourceSlug: 'seats',
          quantity: undefined,
          externalId: 'user_123',
          externalIds: undefined,
          claimIds: undefined,
        }
      )
    })

    it('sends correct payload for releasing by externalIds array', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      mocks.resourceClaimsRelease.mockResolvedValue({
        releasedClaims: [
          {
            ...mockResourceClaim,
            externalId: 'user_1',
            releasedAt: Date.now(),
          },
          {
            ...mockResourceClaim,
            externalId: 'user_2',
            releasedAt: Date.now(),
          },
        ],
        usage: mockResourceUsage,
      })

      await server.releaseResource({
        resourceSlug: 'seats',
        externalIds: ['user_1', 'user_2'],
      })

      expect(mocks.resourceClaimsRelease).toHaveBeenCalledWith(
        mockSubscription.id,
        {
          resourceSlug: 'seats',
          quantity: undefined,
          externalId: undefined,
          externalIds: ['user_1', 'user_2'],
          claimIds: undefined,
        }
      )
    })

    it('sends correct payload for releasing by claimIds', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      mocks.resourceClaimsRelease.mockResolvedValue({
        releasedClaims: [
          {
            ...mockResourceClaim,
            id: 'claim_1',
            releasedAt: Date.now(),
          },
          {
            ...mockResourceClaim,
            id: 'claim_2',
            releasedAt: Date.now(),
          },
        ],
        usage: mockResourceUsage,
      })

      await server.releaseResource({
        resourceSlug: 'seats',
        claimIds: ['claim_1', 'claim_2'],
      })

      expect(mocks.resourceClaimsRelease).toHaveBeenCalledWith(
        mockSubscription.id,
        {
          resourceSlug: 'seats',
          quantity: undefined,
          externalId: undefined,
          externalIds: undefined,
          claimIds: ['claim_1', 'claim_2'],
        }
      )
    })

    it('throws ownership error when subscription belongs to different customer', async () => {
      const { server } = createMockFlowgladServer({
        subscriptionCustomerId: 'cust_different',
        customerId: 'cust_test_123',
      })

      await expect(
        server.releaseResource({
          resourceSlug: 'seats',
          subscriptionId: mockSubscription.id,
          quantity: 1,
        })
      ).rejects.toThrow(
        'Subscription is not owned by the current user'
      )
    })
  })

  describe('listResourceClaims', () => {
    it('returns all active claims when subscription has claims and no filter provided', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      const claims = [
        mockResourceClaim,
        {
          ...mockResourceClaim,
          id: 'claim_2',
          externalId: 'user_123',
        },
      ]
      mocks.get.mockResolvedValue({ claims })

      const result = await server.listResourceClaims()

      expect(result).toEqual({ claims })
      expect(mocks.get).toHaveBeenCalledWith(
        `/api/v1/resource-claims/${mockSubscription.id}/claims`,
        { query: undefined }
      )
    })

    it('returns filtered claims when resourceSlug filter is provided', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      const seatClaims = [mockResourceClaim]
      mocks.get.mockResolvedValue({ claims: seatClaims })

      const result = await server.listResourceClaims({
        resourceSlug: 'seats',
      })

      expect(result).toEqual({ claims: seatClaims })
      expect(mocks.get).toHaveBeenCalledWith(
        `/api/v1/resource-claims/${mockSubscription.id}/claims`,
        { query: { resourceSlug: 'seats' } }
      )
    })

    it('returns claims for specific subscription when subscriptionId is provided', async () => {
      const { server, mocks } = createMockFlowgladServer({})
      mocks.get.mockResolvedValue({ claims: [mockResourceClaim] })

      await server.listResourceClaims({
        subscriptionId: mockSubscription.id,
      })

      expect(mocks.getBilling).not.toHaveBeenCalled()
      expect(mocks.get).toHaveBeenCalledWith(
        `/api/v1/resource-claims/${mockSubscription.id}/claims`,
        { query: undefined }
      )
    })

    it('throws ownership error when subscription belongs to different customer', async () => {
      const { server } = createMockFlowgladServer({
        subscriptionCustomerId: 'cust_different',
        customerId: 'cust_test_123',
      })

      await expect(
        server.listResourceClaims({
          subscriptionId: mockSubscription.id,
        })
      ).rejects.toThrow(
        'Subscription is not owned by the current user'
      )
    })

    it('throws "multiple active subscriptions" error when customer has multiple subscriptions without subscriptionId', async () => {
      const { server } = createMockFlowgladServer({
        currentSubscriptions: [
          { id: mockSubscription.id },
          { id: mockSubscription2.id },
        ],
      })

      await expect(server.listResourceClaims()).rejects.toThrow(
        'Customer has multiple active subscriptions. Please specify subscriptionId.'
      )
    })
  })
})
