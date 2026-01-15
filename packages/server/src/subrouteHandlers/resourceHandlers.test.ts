import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  claimResource,
  getResources,
  listResourceClaims,
  releaseResource,
} from './resourceHandlers'

/**
 * Mock data for testing resource handlers
 */
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
 * Creates a mock FlowgladServer for testing handlers
 */
const createMockFlowgladServer = () => {
  const mockGetResources = vi.fn()
  const mockClaimResource = vi.fn()
  const mockReleaseResource = vi.fn()
  const mockListResourceClaims = vi.fn()

  const server = {
    getResources: mockGetResources,
    claimResource: mockClaimResource,
    releaseResource: mockReleaseResource,
    listResourceClaims: mockListResourceClaims,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getResources: mockGetResources,
      claimResource: mockClaimResource,
      releaseResource: mockReleaseResource,
      listResourceClaims: mockListResourceClaims,
    },
  }
}

describe('Resource subroute handlers', () => {
  describe('getResources handler', () => {
    it('returns { status: 405, error: { code: "Method not allowed" } } for GET request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await getResources(
        {
          method: HTTPMethod.GET as HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error).toEqual({
        code: 'Method not allowed',
        json: {},
      })
      expect(result.data).toEqual({})
    })

    it('returns { status: 405, error } for PUT request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await getResources(
        {
          method: HTTPMethod.PUT as HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error?.code).toBe('Method not allowed')
    })

    it('returns { status: 405, error } for DELETE request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await getResources(
        {
          method: HTTPMethod.DELETE as HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error?.code).toBe('Method not allowed')
    })

    it('returns { status: 200, data: { resources } } for valid POST request', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockResources = [mockResourceUsage]
      mocks.getResources.mockResolvedValue({
        resources: mockResources,
      })

      const result = await getResources(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ resources: mockResources })
      expect(result.error).toBeUndefined()
      expect(mocks.getResources).toHaveBeenCalledWith({})
    })

    it('returns { status: 200, data: { resources } } when subscriptionId is provided', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockResources = [mockResourceUsage]
      mocks.getResources.mockResolvedValue({
        resources: mockResources,
      })

      const result = await getResources(
        {
          method: HTTPMethod.POST,
          data: { subscriptionId: 'sub_123' },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ resources: mockResources })
      expect(mocks.getResources).toHaveBeenCalledWith({
        subscriptionId: 'sub_123',
      })
    })

    it('returns { status: 500, error: { code: "get_resources_failed", json: { message } } } when FlowgladServer throws', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getResources.mockRejectedValue(
        new Error('No active subscription found for this customer')
      )

      const result = await getResources(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error).toEqual({
        code: 'get_resources_failed',
        json: {
          message: 'No active subscription found for this customer',
        },
      })
      expect(result.data).toEqual({})
    })

    it('returns { status: 500, error } when server throws ownership error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getResources.mockRejectedValue(
        new Error('Subscription is not owned by the current user')
      )

      const result = await getResources(
        {
          method: HTTPMethod.POST,
          data: { subscriptionId: 'sub_wrong' },
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error?.code).toBe('get_resources_failed')
      expect(result.error?.json).toEqual({
        message: 'Subscription is not owned by the current user',
      })
    })
  })

  describe('claimResource handler', () => {
    it('returns { status: 405 } for GET request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await claimResource(
        {
          method: HTTPMethod.GET as HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 1 },
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error?.code).toBe('Method not allowed')
    })

    it('returns { status: 405 } for PUT request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await claimResource(
        {
          method: HTTPMethod.PUT as HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 1 },
        },
        server
      )

      expect(result.status).toBe(405)
    })

    it('returns { status: 200, data: { claims, usage } } for valid POST request with quantity', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockResponse = {
        claims: [mockResourceClaim],
        usage: mockResourceUsage,
      }
      mocks.claimResource.mockResolvedValue(mockResponse)

      const result = await claimResource(
        {
          method: HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 1 },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual(mockResponse)
      expect(result.error).toBeUndefined()
      expect(mocks.claimResource).toHaveBeenCalledWith({
        resourceSlug: 'seats',
        quantity: 1,
      })
    })

    it('returns { status: 200, data: { claims, usage } } for valid POST request with externalId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const namedClaim = {
        ...mockResourceClaim,
        externalId: 'user_123',
      }
      const mockResponse = {
        claims: [namedClaim],
        usage: mockResourceUsage,
      }
      mocks.claimResource.mockResolvedValue(mockResponse)

      const result = await claimResource(
        {
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            externalId: 'user_123',
            metadata: { team: 'engineering' },
          },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual(mockResponse)
      expect(mocks.claimResource).toHaveBeenCalledWith({
        resourceSlug: 'seats',
        externalId: 'user_123',
        metadata: { team: 'engineering' },
      })
    })

    it('returns { status: 200, data: { claims, usage } } for valid POST request with externalIds array', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const claims = [
        { ...mockResourceClaim, externalId: 'user_1' },
        {
          ...mockResourceClaim,
          id: 'claim_124',
          externalId: 'user_2',
        },
      ]
      const mockResponse = {
        claims,
        usage: { ...mockResourceUsage, claimed: 5, available: 5 },
      }
      mocks.claimResource.mockResolvedValue(mockResponse)

      const result = await claimResource(
        {
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            externalIds: ['user_1', 'user_2'],
          },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual(mockResponse)
    })

    it('returns { status: 500, error: { code: "claim_resource_failed", json: { message } } } when server throws', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.claimResource.mockRejectedValue(
        new Error('Insufficient capacity')
      )

      const result = await claimResource(
        {
          method: HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 100 },
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error).toEqual({
        code: 'claim_resource_failed',
        json: { message: 'Insufficient capacity' },
      })
      expect(result.data).toEqual({})
    })

    it('returns { status: 500, error } when server throws multiple subscriptions error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.claimResource.mockRejectedValue(
        new Error(
          'Customer has multiple active subscriptions. Please specify subscriptionId.'
        )
      )

      const result = await claimResource(
        {
          method: HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 1 },
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error?.code).toBe('claim_resource_failed')
      expect(result.error?.json).toEqual({
        message:
          'Customer has multiple active subscriptions. Please specify subscriptionId.',
      })
    })
  })

  describe('releaseResource handler', () => {
    it('returns { status: 405 } for GET request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await releaseResource(
        {
          method: HTTPMethod.GET as HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 1 },
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error?.code).toBe('Method not allowed')
    })

    it('returns { status: 405 } for DELETE request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await releaseResource(
        {
          method: HTTPMethod.DELETE as HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 1 },
        },
        server
      )

      expect(result.status).toBe(405)
    })

    it('returns { status: 200, data: { releasedClaims, usage } } for valid POST request with quantity', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const releasedClaims = [
        { ...mockResourceClaim, releasedAt: Date.now() },
      ]
      const mockResponse = {
        releasedClaims,
        usage: { ...mockResourceUsage, claimed: 2, available: 8 },
      }
      mocks.releaseResource.mockResolvedValue(mockResponse)

      const result = await releaseResource(
        {
          method: HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 1 },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual(mockResponse)
      expect(result.error).toBeUndefined()
      expect(mocks.releaseResource).toHaveBeenCalledWith({
        resourceSlug: 'seats',
        quantity: 1,
      })
    })

    it('returns { status: 200, data: { releasedClaims, usage } } for valid POST request with externalId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const releasedClaims = [
        {
          ...mockResourceClaim,
          externalId: 'user_123',
          releasedAt: Date.now(),
        },
      ]
      const mockResponse = {
        releasedClaims,
        usage: mockResourceUsage,
      }
      mocks.releaseResource.mockResolvedValue(mockResponse)

      const result = await releaseResource(
        {
          method: HTTPMethod.POST,
          data: { resourceSlug: 'seats', externalId: 'user_123' },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual(mockResponse)
    })

    it('returns { status: 200, data: { releasedClaims, usage } } for valid POST request with externalIds', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const releasedClaims = [
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
      ]
      const mockResponse = {
        releasedClaims,
        usage: mockResourceUsage,
      }
      mocks.releaseResource.mockResolvedValue(mockResponse)

      const result = await releaseResource(
        {
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            externalIds: ['user_1', 'user_2'],
          },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual(mockResponse)
    })

    it('returns { status: 200, data: { releasedClaims, usage } } for valid POST request with claimIds', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const releasedClaims = [
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
      ]
      const mockResponse = {
        releasedClaims,
        usage: mockResourceUsage,
      }
      mocks.releaseResource.mockResolvedValue(mockResponse)

      const result = await releaseResource(
        {
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            claimIds: ['claim_1', 'claim_2'],
          },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual(mockResponse)
      expect(mocks.releaseResource).toHaveBeenCalledWith({
        resourceSlug: 'seats',
        claimIds: ['claim_1', 'claim_2'],
      })
    })

    it('returns { status: 500, error: { code: "release_resource_failed", json: { message } } } when server throws', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.releaseResource.mockRejectedValue(
        new Error('Claim not found')
      )

      const result = await releaseResource(
        {
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            claimIds: ['invalid_claim'],
          },
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error).toEqual({
        code: 'release_resource_failed',
        json: { message: 'Claim not found' },
      })
      expect(result.data).toEqual({})
    })

    it('returns { status: 500, error } when server throws ownership error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.releaseResource.mockRejectedValue(
        new Error('Subscription is not owned by the current user')
      )

      const result = await releaseResource(
        {
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            subscriptionId: 'sub_wrong',
            quantity: 1,
          },
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error?.code).toBe('release_resource_failed')
    })
  })

  describe('listResourceClaims handler', () => {
    it('returns { status: 405 } for GET request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await listResourceClaims(
        {
          method: HTTPMethod.GET as HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error?.code).toBe('Method not allowed')
    })

    it('returns { status: 405 } for PATCH request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await listResourceClaims(
        {
          method: HTTPMethod.PATCH as HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(405)
    })

    it('returns { status: 200, data: { claims } } for valid POST request', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockClaims = [mockResourceClaim]
      mocks.listResourceClaims.mockResolvedValue({
        claims: mockClaims,
      })

      const result = await listResourceClaims(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ claims: mockClaims })
      expect(result.error).toBeUndefined()
      expect(mocks.listResourceClaims).toHaveBeenCalledWith({})
    })

    it('returns { status: 200, data: { claims } } with resourceSlug filter', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const seatClaims = [mockResourceClaim]
      mocks.listResourceClaims.mockResolvedValue({
        claims: seatClaims,
      })

      const result = await listResourceClaims(
        {
          method: HTTPMethod.POST,
          data: { resourceSlug: 'seats' },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ claims: seatClaims })
      expect(mocks.listResourceClaims).toHaveBeenCalledWith({
        resourceSlug: 'seats',
      })
    })

    it('returns { status: 200, data: { claims } } with subscriptionId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockClaims = [mockResourceClaim]
      mocks.listResourceClaims.mockResolvedValue({
        claims: mockClaims,
      })

      const result = await listResourceClaims(
        {
          method: HTTPMethod.POST,
          data: { subscriptionId: 'sub_123' },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ claims: mockClaims })
      expect(mocks.listResourceClaims).toHaveBeenCalledWith({
        subscriptionId: 'sub_123',
      })
    })

    it('returns { status: 200, data: { claims } } with both filters', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockClaims = [mockResourceClaim]
      mocks.listResourceClaims.mockResolvedValue({
        claims: mockClaims,
      })

      const result = await listResourceClaims(
        {
          method: HTTPMethod.POST,
          data: { subscriptionId: 'sub_123', resourceSlug: 'seats' },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(mocks.listResourceClaims).toHaveBeenCalledWith({
        subscriptionId: 'sub_123',
        resourceSlug: 'seats',
      })
    })

    it('returns empty claims array when no claims exist', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.listResourceClaims.mockResolvedValue({
        claims: [],
      })

      const result = await listResourceClaims(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ claims: [] })
    })

    it('returns { status: 500, error: { code: "list_resource_claims_failed", json: { message } } } when server throws', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.listResourceClaims.mockRejectedValue(
        new Error('No active subscription found for this customer')
      )

      const result = await listResourceClaims(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error).toEqual({
        code: 'list_resource_claims_failed',
        json: {
          message: 'No active subscription found for this customer',
        },
      })
      expect(result.data).toEqual({})
    })

    it('returns { status: 500, error } when server throws multiple subscriptions error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.listResourceClaims.mockRejectedValue(
        new Error(
          'Customer has multiple active subscriptions. Please specify subscriptionId.'
        )
      )

      const result = await listResourceClaims(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error?.code).toBe('list_resource_claims_failed')
      expect(result.error?.json).toEqual({
        message:
          'Customer has multiple active subscriptions. Please specify subscriptionId.',
      })
    })
  })
})
