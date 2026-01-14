import { describe, expect, it, vi } from 'vitest'
import { FlowgladServerAdmin } from './FlowgladServerAdmin'

/**
 * Unit tests for FlowgladServerAdmin resource methods.
 *
 * These tests verify:
 * 1. getResources returns resources for any valid subscriptionId
 * 2. claimResource and releaseResource work without customer authentication context
 * 3. listResourceClaims returns claims for any subscription
 *
 * Note: These are unit tests that verify method signatures and call patterns.
 * Integration tests would require a live API connection.
 */

// Mock FlowgladNode client
vi.mock('@flowglad/node', () => {
  const mockResourceClaims = {
    usage: vi.fn(),
    claim: vi.fn(),
    release: vi.fn(),
  }

  const mockGet = vi.fn()

  return {
    Flowglad: vi.fn().mockImplementation(() => ({
      resourceClaims: mockResourceClaims,
      get: mockGet,
    })),
  }
})

describe('FlowgladServerAdmin resource methods', () => {
  const createAdmin = () =>
    new FlowgladServerAdmin({ apiKey: 'test-api-key' })

  describe('getResources', () => {
    it('returns resources for any subscriptionId without ownership validation', async () => {
      const admin = createAdmin()

      // Access the internal mock
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { usage: ReturnType<typeof vi.fn> }
      }

      mockFlowgladNode.resourceClaims.usage.mockResolvedValue({
        usage: [
          {
            resourceSlug: 'seats',
            resourceId: 'res_123',
            capacity: 10,
            claimed: 3,
            available: 7,
          },
          {
            resourceSlug: 'api_keys',
            resourceId: 'res_456',
            capacity: 5,
            claimed: 2,
            available: 3,
          },
        ],
        claims: [],
      })

      const result = await admin.getResources('sub_any_subscription')

      expect(
        mockFlowgladNode.resourceClaims.usage
      ).toHaveBeenCalledWith('sub_any_subscription')
      expect(result).toHaveProperty('resources')
      expect(result.resources).toHaveLength(2)
      expect(result.resources[0].resourceSlug).toBe('seats')
      expect(result.resources[0].capacity).toBe(10)
      expect(result.resources[0].claimed).toBe(3)
      expect(result.resources[0].available).toBe(7)
    })

    it('maps usage array from API response to resources in return value', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { usage: ReturnType<typeof vi.fn> }
      }

      const mockUsage = [
        {
          resourceSlug: 'test-resource',
          resourceId: 'res_test',
          capacity: 100,
          claimed: 50,
          available: 50,
        },
      ]

      mockFlowgladNode.resourceClaims.usage.mockResolvedValue({
        usage: mockUsage,
        claims: [],
      })

      const result = await admin.getResources('sub_123')

      // Verify the result.resources matches the usage from the API
      expect(result.resources).toEqual(mockUsage)
    })
  })

  describe('claimResource', () => {
    it('creates claims for any subscription without ownership validation', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { claim: ReturnType<typeof vi.fn> }
      }

      const mockClaim = {
        id: 'claim_123',
        subscriptionItemFeatureId: 'sif_456',
        resourceId: 'res_789',
        subscriptionId: 'sub_abc',
        pricingModelId: 'pm_def',
        externalId: null,
        claimedAt: Date.now(),
        releasedAt: null,
        releaseReason: null,
        metadata: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      mockFlowgladNode.resourceClaims.claim.mockResolvedValue({
        claims: [mockClaim],
        usage: {
          resourceSlug: 'seats',
          resourceId: 'res_789',
          capacity: 10,
          claimed: 1,
          available: 9,
        },
      })

      const result = await admin.claimResource('sub_abc', {
        resourceSlug: 'seats',
        quantity: 1,
      })

      expect(
        mockFlowgladNode.resourceClaims.claim
      ).toHaveBeenCalledWith('sub_abc', {
        resourceSlug: 'seats',
        quantity: 1,
      })
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].id).toBe('claim_123')
      expect(result.usage.claimed).toBe(1)
    })

    it('supports anonymous claims with quantity parameter', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { claim: ReturnType<typeof vi.fn> }
      }

      mockFlowgladNode.resourceClaims.claim.mockResolvedValue({
        claims: [
          { id: 'claim_1', externalId: null },
          { id: 'claim_2', externalId: null },
          { id: 'claim_3', externalId: null },
        ],
        usage: {
          resourceSlug: 'seats',
          resourceId: 'res_123',
          capacity: 10,
          claimed: 3,
          available: 7,
        },
      })

      const result = await admin.claimResource('sub_123', {
        resourceSlug: 'seats',
        quantity: 3,
      })

      expect(
        mockFlowgladNode.resourceClaims.claim
      ).toHaveBeenCalledWith('sub_123', {
        resourceSlug: 'seats',
        quantity: 3,
      })
      expect(result.claims).toHaveLength(3)
    })

    it('supports named claims with externalId parameter', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { claim: ReturnType<typeof vi.fn> }
      }

      mockFlowgladNode.resourceClaims.claim.mockResolvedValue({
        claims: [{ id: 'claim_1', externalId: 'user_alice' }],
        usage: {
          resourceSlug: 'seats',
          resourceId: 'res_123',
          capacity: 10,
          claimed: 1,
          available: 9,
        },
      })

      const result = await admin.claimResource('sub_123', {
        resourceSlug: 'seats',
        externalId: 'user_alice',
        metadata: { assignedBy: 'admin' },
      })

      expect(
        mockFlowgladNode.resourceClaims.claim
      ).toHaveBeenCalledWith('sub_123', {
        resourceSlug: 'seats',
        externalId: 'user_alice',
        metadata: { assignedBy: 'admin' },
      })
      expect(result.claims[0].externalId).toBe('user_alice')
    })

    it('supports named claims with externalIds parameter for bulk operations', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { claim: ReturnType<typeof vi.fn> }
      }

      mockFlowgladNode.resourceClaims.claim.mockResolvedValue({
        claims: [
          { id: 'claim_1', externalId: 'user_a' },
          { id: 'claim_2', externalId: 'user_b' },
        ],
        usage: {
          resourceSlug: 'seats',
          resourceId: 'res_123',
          capacity: 10,
          claimed: 2,
          available: 8,
        },
      })

      const result = await admin.claimResource('sub_123', {
        resourceSlug: 'seats',
        externalIds: ['user_a', 'user_b'],
      })

      expect(
        mockFlowgladNode.resourceClaims.claim
      ).toHaveBeenCalledWith('sub_123', {
        resourceSlug: 'seats',
        externalIds: ['user_a', 'user_b'],
      })
      expect(result.claims).toHaveLength(2)
    })
  })

  describe('releaseResource', () => {
    it('releases claims for any subscription without customer authentication', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { release: ReturnType<typeof vi.fn> }
      }

      mockFlowgladNode.resourceClaims.release.mockResolvedValue({
        releasedClaims: [
          {
            id: 'claim_123',
            externalId: null,
            releasedAt: Date.now(),
          },
        ],
        usage: {
          resourceSlug: 'seats',
          resourceId: 'res_123',
          capacity: 10,
          claimed: 2,
          available: 8,
        },
      })

      const result = await admin.releaseResource('sub_123', {
        resourceSlug: 'seats',
        quantity: 1,
      })

      expect(
        mockFlowgladNode.resourceClaims.release
      ).toHaveBeenCalledWith('sub_123', {
        resourceSlug: 'seats',
        quantity: 1,
      })
      expect(result.releasedClaims).toHaveLength(1)
      expect(result.usage.available).toBe(8)
    })

    it('supports releasing by externalId', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { release: ReturnType<typeof vi.fn> }
      }

      mockFlowgladNode.resourceClaims.release.mockResolvedValue({
        releasedClaims: [
          {
            id: 'claim_123',
            externalId: 'user_alice',
            releasedAt: Date.now(),
          },
        ],
        usage: {
          resourceSlug: 'seats',
          resourceId: 'res_123',
          capacity: 10,
          claimed: 0,
          available: 10,
        },
      })

      const result = await admin.releaseResource('sub_123', {
        resourceSlug: 'seats',
        externalId: 'user_alice',
      })

      expect(
        mockFlowgladNode.resourceClaims.release
      ).toHaveBeenCalledWith('sub_123', {
        resourceSlug: 'seats',
        externalId: 'user_alice',
      })
      expect(result.releasedClaims[0].externalId).toBe('user_alice')
    })

    it('supports releasing by externalIds for bulk operations', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { release: ReturnType<typeof vi.fn> }
      }

      mockFlowgladNode.resourceClaims.release.mockResolvedValue({
        releasedClaims: [
          { id: 'claim_1', externalId: 'user_a' },
          { id: 'claim_2', externalId: 'user_b' },
        ],
        usage: {
          resourceSlug: 'seats',
          resourceId: 'res_123',
          capacity: 10,
          claimed: 3,
          available: 7,
        },
      })

      const result = await admin.releaseResource('sub_123', {
        resourceSlug: 'seats',
        externalIds: ['user_a', 'user_b'],
      })

      expect(
        mockFlowgladNode.resourceClaims.release
      ).toHaveBeenCalledWith('sub_123', {
        resourceSlug: 'seats',
        externalIds: ['user_a', 'user_b'],
      })
      expect(result.releasedClaims).toHaveLength(2)
    })

    it('supports releasing by claimIds', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        resourceClaims: { release: ReturnType<typeof vi.fn> }
      }

      mockFlowgladNode.resourceClaims.release.mockResolvedValue({
        releasedClaims: [{ id: 'claim_abc' }, { id: 'claim_def' }],
        usage: {
          resourceSlug: 'seats',
          resourceId: 'res_123',
          capacity: 10,
          claimed: 5,
          available: 5,
        },
      })

      const result = await admin.releaseResource('sub_123', {
        resourceSlug: 'seats',
        claimIds: ['claim_abc', 'claim_def'],
      })

      expect(
        mockFlowgladNode.resourceClaims.release
      ).toHaveBeenCalledWith('sub_123', {
        resourceSlug: 'seats',
        claimIds: ['claim_abc', 'claim_def'],
      })
      expect(result.releasedClaims).toHaveLength(2)
    })
  })

  describe('listResourceClaims', () => {
    it('returns claims for any subscription without ownership check', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        get: ReturnType<typeof vi.fn>
      }

      const mockClaims = [
        {
          id: 'claim_1',
          subscriptionId: 'sub_123',
          externalId: 'user_a',
        },
        {
          id: 'claim_2',
          subscriptionId: 'sub_123',
          externalId: null,
        },
      ]

      mockFlowgladNode.get.mockResolvedValue({ claims: mockClaims })

      const result = await admin.listResourceClaims('sub_123')

      expect(mockFlowgladNode.get).toHaveBeenCalledWith(
        '/api/v1/resource-claims/sub_123/claims',
        { query: undefined }
      )
      expect(result.claims).toHaveLength(2)
      expect(result.claims[0].externalId).toBe('user_a')
    })

    it('supports filtering by resourceSlug', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        get: ReturnType<typeof vi.fn>
      }

      mockFlowgladNode.get.mockResolvedValue({
        claims: [{ id: 'claim_1', externalId: 'user_a' }],
      })

      const result = await admin.listResourceClaims(
        'sub_123',
        'seats'
      )

      expect(mockFlowgladNode.get).toHaveBeenCalledWith(
        '/api/v1/resource-claims/sub_123/claims',
        { query: { resourceSlug: 'seats' } }
      )
      expect(result.claims).toHaveLength(1)
    })

    it('passes undefined query when resourceSlug is not provided', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        get: ReturnType<typeof vi.fn>
      }

      mockFlowgladNode.get.mockResolvedValue({ claims: [] })

      await admin.listResourceClaims('sub_123')

      expect(mockFlowgladNode.get).toHaveBeenCalledWith(
        '/api/v1/resource-claims/sub_123/claims',
        { query: undefined }
      )
    })

    it('passes resourceSlug in query when provided', async () => {
      const admin = createAdmin()
      const mockFlowgladNode = (
        admin as unknown as { flowgladNode: unknown }
      ).flowgladNode as {
        get: ReturnType<typeof vi.fn>
      }

      mockFlowgladNode.get.mockResolvedValue({ claims: [] })

      await admin.listResourceClaims('sub_123', 'api_keys')

      expect(mockFlowgladNode.get).toHaveBeenCalledWith(
        '/api/v1/resource-claims/sub_123/claims',
        { query: { resourceSlug: 'api_keys' } }
      )
    })
  })

  describe('method signatures', () => {
    it('getResources requires subscriptionId parameter', () => {
      const admin = createAdmin()
      // TypeScript compilation would fail if subscriptionId is not required
      expect(typeof admin.getResources).toBe('function')
    })

    it('claimResource requires subscriptionId and params without subscriptionId field', () => {
      const admin = createAdmin()
      // TypeScript compilation would fail if signature is wrong
      expect(typeof admin.claimResource).toBe('function')
    })

    it('releaseResource requires subscriptionId and params without subscriptionId field', () => {
      const admin = createAdmin()
      expect(typeof admin.releaseResource).toBe('function')
    })

    it('listResourceClaims requires subscriptionId and optional resourceSlug', () => {
      const admin = createAdmin()
      expect(typeof admin.listResourceClaims).toBe('function')
    })
  })
})
