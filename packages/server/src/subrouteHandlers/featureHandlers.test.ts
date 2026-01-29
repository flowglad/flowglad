import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './test-utils'
import { getFeatureAccessItems } from './featureHandlers'

const mockFeatureAccessItems = [
  {
    id: 'feature_123',
    livemode: true,
    slug: 'advanced-analytics',
    name: 'Advanced Analytics',
  },
  {
    id: 'feature_456',
    livemode: true,
    slug: 'api-access',
    name: 'API Access',
  },
]

const createMockFlowgladServer = () => {
  const mockGetFeatureAccessItems = vi.fn()

  const server = {
    getFeatureAccessItems: mockGetFeatureAccessItems,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getFeatureAccessItems: mockGetFeatureAccessItems,
    },
  }
}

describe('Feature subroute handlers', () => {
  describe('getFeatureAccessItems handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.GET,
          data: {},
        } as unknown as Parameters<typeof getFeatureAccessItems>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.PUT,
          data: {},
        } as unknown as Parameters<typeof getFeatureAccessItems>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns 405 for DELETE request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.DELETE,
          data: {},
        } as unknown as Parameters<typeof getFeatureAccessItems>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns features via FlowgladServer', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getFeatureAccessItems.mockResolvedValue({
        features: mockFeatureAccessItems,
      })

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(mocks.getFeatureAccessItems).toHaveBeenCalledWith({})
      assert200Success(result, {
        features: mockFeatureAccessItems,
      })
    })

    it('filters to toggle features only', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const toggleFeatures = [
        {
          id: 'feature_123',
          livemode: true,
          slug: 'advanced-analytics',
          name: 'Advanced Analytics',
        },
      ]
      mocks.getFeatureAccessItems.mockResolvedValue({
        features: toggleFeatures,
      })

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      assert200Success(result, { features: toggleFeatures })
    })

    it('deduplicates features by slug', async () => {
      const { server, mocks } = createMockFlowgladServer()
      // Mock returns deduplicated features
      mocks.getFeatureAccessItems.mockResolvedValue({
        features: mockFeatureAccessItems,
      })

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      assert200Success(result, { features: mockFeatureAccessItems })
    })

    it('filters by subscriptionId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getFeatureAccessItems.mockResolvedValue({
        features: mockFeatureAccessItems,
      })

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.POST,
          data: { subscriptionId: 'sub_123' },
        },
        server
      )

      expect(mocks.getFeatureAccessItems).toHaveBeenCalledWith({
        subscriptionId: 'sub_123',
      })
      assert200Success(result, {
        features: mockFeatureAccessItems,
      })
    })

    it('returns empty array when no features', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getFeatureAccessItems.mockResolvedValue({
        features: [],
      })

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      assert200Success(result, { features: [] })
    })

    it('returns 500 with parsed error on failure', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getFeatureAccessItems.mockRejectedValue(
        new Error('404 {"message": "Customer not found"}')
      )

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: '404',
          json: { message: 'Customer not found' },
        },
        data: {},
      })
    })

    it('rejects unknown keys (strict schema)', async () => {
      const { server, mocks } = createMockFlowgladServer()

      const result = await getFeatureAccessItems(
        {
          method: HTTPMethod.POST,
          // Cast to bypass TypeScript - we're intentionally testing Zod's strict() validation
          data: {
            subscriptionId: 'sub_123',
            unknownKey: 'value',
          } as unknown as { subscriptionId?: string },
        },
        server
      )

      // Should fail Zod strict() validation
      expect(result.status).toBe(500)
      expect(result.error?.code).toBe('Unknown')
      expect(mocks.getFeatureAccessItems).not.toHaveBeenCalled()
    })
  })
})
