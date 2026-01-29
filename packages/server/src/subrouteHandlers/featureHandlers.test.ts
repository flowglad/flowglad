import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './test-utils'

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
  describe.skip('getFeatureAccessItems handler', () => {
    it('returns 405 for GET request', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('returns 405 for PUT request', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('returns 405 for DELETE request', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('returns features via FlowgladServer', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('filters to toggle features only', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('deduplicates features by slug', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('filters by subscriptionId', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('returns empty array when no features', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('returns 500 with parsed error on failure', async () => {
      // Test stub - to be implemented in Patch 4
    })

    it('rejects unknown keys (strict schema)', async () => {
      // Test stub - to be implemented in Patch 4
    })
  })
})
