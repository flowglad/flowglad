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
const mockCustomerPricingModel = {
  id: 'pm_customer_123',
  name: 'Customer Plan',
  products: [],
  usageMeters: [],
} as unknown as PricingModel

const mockDefaultPricingModel = {
  id: 'pm_default_123',
  name: 'Default Plan',
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
      const { server, mocks: serverMocks } =
        createMockFlowgladServer()
      serverMocks.getPricingModel.mockResolvedValue({
        pricingModel: mockCustomerPricingModel,
      })

      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()

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
        pricingModel: mockCustomerPricingModel,
        source: 'customer',
      })
      expect(serverMocks.getPricingModel).toHaveBeenCalledTimes(1)
      expect(adminMocks.getDefaultPricingModel).not.toHaveBeenCalled()
    })

    it('returns 500 error when authenticated but customer pricing fetch fails (does NOT fall back to default)', async () => {
      const { server, mocks: serverMocks } =
        createMockFlowgladServer()
      serverMocks.getPricingModel.mockRejectedValue(
        new Error('Network error')
      )

      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()

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
            details: 'Network error',
          },
        },
        data: {},
      })
      expect(serverMocks.getPricingModel).toHaveBeenCalledTimes(1)
      // Default pricing should NOT be called when authenticated
      expect(adminMocks.getDefaultPricingModel).not.toHaveBeenCalled()
    })

    it('handles non-Error exceptions gracefully with undefined details', async () => {
      const { server, mocks: serverMocks } =
        createMockFlowgladServer()
      serverMocks.getPricingModel.mockRejectedValue(
        'Unexpected string error'
      )

      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()

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

      expect(result.status).toBe(500)
      expect(result.error?.code).toBe('PRICING_MODEL_FETCH_FAILED')
      expect(result.error!.json.details).toBeUndefined()
      expect(adminMocks.getDefaultPricingModel).not.toHaveBeenCalled()
    })
  })

  describe('unauthenticated path (flowgladServer is null)', () => {
    it('returns default pricing model with source "default" when unauthenticated', async () => {
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      adminMocks.getDefaultPricingModel.mockResolvedValue({
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
      expect(adminMocks.getDefaultPricingModel).toHaveBeenCalledTimes(
        1
      )
    })

    it('returns 500 error when default pricing fetch fails', async () => {
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      adminMocks.getDefaultPricingModel.mockRejectedValue(
        new Error('API unavailable')
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
            details: 'API unavailable',
          },
        },
        data: {},
      })
      expect(adminMocks.getDefaultPricingModel).toHaveBeenCalledTimes(
        1
      )
    })

    it('normalizes response when getDefaultPricingModel returns wrapped pricing model', async () => {
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      adminMocks.getDefaultPricingModel.mockResolvedValue({
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
    })

    it('normalizes response when getDefaultPricingModel returns unwrapped pricing model', async () => {
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      // Simulating a direct return that doesn't have 'pricingModel' key
      adminMocks.getDefaultPricingModel.mockResolvedValue(
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

    it('handles non-Error exceptions in default pricing path with undefined details', async () => {
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      adminMocks.getDefaultPricingModel.mockRejectedValue({
        code: 'UNKNOWN',
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

      expect(result.status).toBe(500)
      expect(result.error?.code).toBe(
        'DEFAULT_PRICING_MODEL_FETCH_FAILED'
      )
      expect(result.error?.json.message).toBe(
        'Failed to retrieve default pricing model'
      )
      expect(result.error?.json.details).toBeUndefined()
    })
  })
})
