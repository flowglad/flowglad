import type {
  FlowgladActionKey,
  PricingModel,
} from '@flowglad/shared'
import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'
import {
  assert200Success,
  assertHandlerResponse,
} from './__tests__/test-utils'
import { getPricingModel } from './pricingModelHandlers'
import type { InferRouteHandlerParams } from './types'

type GetPricingModelParams = InferRouteHandlerParams<
  typeof FlowgladActionKey.GetPricingModel
>

// Mock data uses type assertion since we only need minimal fields for testing
const mockPricingModel = {
  id: 'pm_123',
  name: 'Test Pricing Model',
  products: [],
  usageMeters: [],
} as unknown as PricingModel

const mockDefaultPricingModel = {
  id: 'pm_default',
  name: 'Default Pricing Model',
  products: [],
  usageMeters: [],
} as unknown as PricingModel

const createMockFlowgladServer = () => {
  const mockGetPricingModel = vi.fn()

  const server = {
    getPricingModel: mockGetPricingModel,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getPricingModel: mockGetPricingModel,
    },
  }
}

const createMockFlowgladServerAdmin = () => {
  const mockGetDefaultPricingModel = vi.fn()

  const admin = {
    getDefaultPricingModel: mockGetDefaultPricingModel,
  } as unknown as FlowgladServerAdmin

  return {
    admin,
    mocks: {
      getDefaultPricingModel: mockGetDefaultPricingModel,
    },
  }
}

describe('getPricingModel handler', () => {
  describe('authenticated path (flowgladServer is present)', () => {
    it('returns customer-specific pricing model with source "customer" when authenticated and fetch succeeds', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const { admin } = createMockFlowgladServerAdmin()

      mocks.getPricingModel.mockResolvedValue({
        pricingModel: mockPricingModel,
      })

      const result = await getPricingModel(
        {
          method: HTTPMethod.POST,
          data: {},
        } as GetPricingModelParams,
        {
          flowgladServer: server,
          flowgladServerAdmin: admin,
        }
      )

      assert200Success(result, {
        pricingModel: mockPricingModel,
        source: 'customer',
      })
      expect(mocks.getPricingModel).toHaveBeenCalledTimes(1)
    })

    it('returns 500 error when authenticated but customer pricing fetch fails (does NOT fall back to default)', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()

      mocks.getPricingModel.mockRejectedValue(
        new Error('Customer pricing fetch failed')
      )

      const result = await getPricingModel(
        {
          method: HTTPMethod.POST,
          data: {},
        } as GetPricingModelParams,
        {
          flowgladServer: server,
          flowgladServerAdmin: admin,
        }
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'PRICING_MODEL_FETCH_FAILED',
          json: {
            message: 'Failed to retrieve customer pricing model',
            details: 'Customer pricing fetch failed',
          },
        },
        data: {},
      })
      expect(mocks.getPricingModel).toHaveBeenCalledTimes(1)
      // Default pricing should NOT be called when authenticated
      expect(adminMocks.getDefaultPricingModel).not.toHaveBeenCalled()
    })
  })

  describe('unauthenticated path (flowgladServer is null)', () => {
    it('returns default pricing model with source "default" when unauthenticated', async () => {
      const { admin, mocks } = createMockFlowgladServerAdmin()

      mocks.getDefaultPricingModel.mockResolvedValue({
        pricingModel: mockDefaultPricingModel,
      })

      const result = await getPricingModel(
        {
          method: HTTPMethod.POST,
          data: {},
        } as GetPricingModelParams,
        {
          flowgladServer: null,
          flowgladServerAdmin: admin,
        }
      )

      assert200Success(result, {
        pricingModel: mockDefaultPricingModel,
        source: 'default',
      })
      expect(mocks.getDefaultPricingModel).toHaveBeenCalledTimes(1)
    })

    it('handles response shape when pricingModel is returned directly (not wrapped)', async () => {
      const { admin, mocks } = createMockFlowgladServerAdmin()

      // Some implementations might return pricingModel directly without wrapper
      mocks.getDefaultPricingModel.mockResolvedValue(
        mockDefaultPricingModel
      )

      const result = await getPricingModel(
        {
          method: HTTPMethod.POST,
          data: {},
        } as GetPricingModelParams,
        {
          flowgladServer: null,
          flowgladServerAdmin: admin,
        }
      )

      assert200Success(result, {
        pricingModel: mockDefaultPricingModel,
        source: 'default',
      })
    })

    it('returns 500 error when default pricing fetch fails', async () => {
      const { admin, mocks } = createMockFlowgladServerAdmin()

      mocks.getDefaultPricingModel.mockRejectedValue(
        new Error('Default pricing not configured')
      )

      const result = await getPricingModel(
        {
          method: HTTPMethod.POST,
          data: {},
        } as GetPricingModelParams,
        {
          flowgladServer: null,
          flowgladServerAdmin: admin,
        }
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'DEFAULT_PRICING_MODEL_FETCH_FAILED',
          json: {
            message: 'Failed to retrieve default pricing model',
            details: 'Default pricing not configured',
          },
        },
        data: {},
      })
      expect(mocks.getDefaultPricingModel).toHaveBeenCalledTimes(1)
    })
  })
})
