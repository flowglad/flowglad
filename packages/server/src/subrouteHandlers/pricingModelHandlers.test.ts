import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'
import { getPricingModel } from './pricingModelHandlers'

const mockCustomerPricingModel = {
  id: 'pm_customer_123',
  name: 'Customer Plan',
  products: [],
}

const mockDefaultPricingModel = {
  id: 'pm_default_123',
  name: 'Default Plan',
  products: [],
}

const createMockFlowgladServer = () => {
  const mockGetPricingModel = vi.fn()
  const server = {
    getPricingModel: mockGetPricingModel,
  } as unknown as FlowgladServer
  return { server, mocks: { getPricingModel: mockGetPricingModel } }
}

const createMockFlowgladServerAdmin = () => {
  const mockGetDefaultPricingModel = vi.fn()
  const admin = {
    getDefaultPricingModel: mockGetDefaultPricingModel,
  } as unknown as FlowgladServerAdmin
  return {
    admin,
    mocks: { getDefaultPricingModel: mockGetDefaultPricingModel },
  }
}

describe('getPricingModel handler', () => {
  describe('authenticated path (flowgladServer available)', () => {
    it('returns customer pricing when flowgladServer is available', async () => {
      // Setup: Mock FlowgladServer with getPricingModel returning customer pricing
      const { server, mocks: serverMocks } =
        createMockFlowgladServer()
      serverMocks.getPricingModel.mockResolvedValue({
        pricingModel: mockCustomerPricingModel,
      })

      // Setup: Mock FlowgladServerAdmin (should NOT be called)
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()

      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer: server, flowgladServerAdmin: admin }
      )

      // Assert: status=200, data.source='customer', data.pricingModel matches mock
      expect(result.status).toBe(200)
      expect(result.data.source).toBe('customer')
      expect(result.data.pricingModel).toEqual(
        mockCustomerPricingModel
      )
      expect(result.error).toBeUndefined()

      // Assert: mockServer.getPricingModel called once
      expect(serverMocks.getPricingModel).toHaveBeenCalledTimes(1)

      // Assert: mockAdmin.getDefaultPricingModel NOT called
      expect(adminMocks.getDefaultPricingModel).not.toHaveBeenCalled()
    })

    it('returns 500 and does NOT fall back when customer pricing fetch fails', async () => {
      // Setup: Mock FlowgladServer.getPricingModel to reject with Error('Network error')
      const { server, mocks: serverMocks } =
        createMockFlowgladServer()
      serverMocks.getPricingModel.mockRejectedValue(
        new Error('Network error')
      )

      // Setup: Mock FlowgladServerAdmin (should NOT be called)
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()

      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer: server, flowgladServerAdmin: admin }
      )

      // Assert: status=500, error has expected shape
      expect(result.status).toBe(500)
      expect(result.error).toMatchObject({
        code: 'PRICING_MODEL_FETCH_FAILED',
        json: {
          message: 'Failed to retrieve customer pricing model',
          details: 'Network error',
        },
      })

      // Assert: mockAdmin.getDefaultPricingModel NOT called (critical - no silent fallback)
      expect(adminMocks.getDefaultPricingModel).not.toHaveBeenCalled()
    })

    it('handles non-Error exceptions gracefully', async () => {
      // Setup: Mock FlowgladServer.getPricingModel to reject with a string
      const { server, mocks: serverMocks } =
        createMockFlowgladServer()
      serverMocks.getPricingModel.mockRejectedValue(
        'Unexpected string error'
      )

      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()

      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer: server, flowgladServerAdmin: admin }
      )

      // Assert: status=500, error has expected code
      expect(result.status).toBe(500)
      expect(result.error?.code).toBe('PRICING_MODEL_FETCH_FAILED')

      // Assert: details is undefined for non-Error types
      expect(result.error!.json.details).toBeUndefined()

      // Assert: No fallback to default pricing
      expect(adminMocks.getDefaultPricingModel).not.toHaveBeenCalled()
    })
  })

  describe('unauthenticated path (flowgladServer is null)', () => {
    it('returns default pricing when flowgladServer is null', async () => {
      // Setup: flowgladServer=null, mock FlowgladServerAdmin returning default pricing
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      adminMocks.getDefaultPricingModel.mockResolvedValue({
        pricingModel: mockDefaultPricingModel,
      })

      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer: null, flowgladServerAdmin: admin }
      )

      // Assert: status=200, data.source='default', data.pricingModel matches mock
      expect(result.status).toBe(200)
      expect(result.data.source).toBe('default')
      expect(result.data.pricingModel).toEqual(
        mockDefaultPricingModel
      )
      expect(result.error).toBeUndefined()

      // Assert: mockAdmin.getDefaultPricingModel called once
      expect(adminMocks.getDefaultPricingModel).toHaveBeenCalledTimes(
        1
      )
    })

    it('returns 500 when default pricing fetch fails', async () => {
      // Setup: flowgladServer=null, mock admin.getDefaultPricingModel to reject
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      adminMocks.getDefaultPricingModel.mockRejectedValue(
        new Error('API unavailable')
      )

      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer: null, flowgladServerAdmin: admin }
      )

      // Assert: status=500, error has expected shape
      expect(result.status).toBe(500)
      expect(result.error).toMatchObject({
        code: 'DEFAULT_PRICING_MODEL_FETCH_FAILED',
        json: {
          message: 'Failed to retrieve default pricing model',
          details: 'API unavailable',
        },
      })
    })

    it('normalizes response when getDefaultPricingModel returns wrapped pricing model', async () => {
      // Setup: Mock admin to return pricing model wrapped in { pricingModel }
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      adminMocks.getDefaultPricingModel.mockResolvedValue({
        pricingModel: mockDefaultPricingModel,
      })

      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer: null, flowgladServerAdmin: admin }
      )

      // Assert: status=200, response still has correct shape with pricingModel and source='default'
      expect(result.status).toBe(200)
      expect(result.data.pricingModel).toEqual(
        mockDefaultPricingModel
      )
      expect(result.data.source).toBe('default')
    })

    it('normalizes response when getDefaultPricingModel returns unwrapped pricing model', async () => {
      // Setup: Mock admin to return pricing model directly (not wrapped in { pricingModel })
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      // Simulating a direct return that doesn't have 'pricingModel' key
      adminMocks.getDefaultPricingModel.mockResolvedValue(
        mockDefaultPricingModel
      )

      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer: null, flowgladServerAdmin: admin }
      )

      // Assert: status=200, response still has correct shape
      expect(result.status).toBe(200)
      // When returned directly, the whole object becomes the pricingModel
      expect(result.data.pricingModel).toEqual(
        mockDefaultPricingModel
      )
      expect(result.data.source).toBe('default')
    })

    it('handles non-Error exceptions in default pricing path', async () => {
      // Setup: Mock admin to reject with a non-Error value
      const { admin, mocks: adminMocks } =
        createMockFlowgladServerAdmin()
      adminMocks.getDefaultPricingModel.mockRejectedValue({
        code: 'UNKNOWN',
      })

      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer: null, flowgladServerAdmin: admin }
      )

      // Assert: status=500, error has expected code and message
      expect(result.status).toBe(500)
      expect(result.error?.code).toBe(
        'DEFAULT_PRICING_MODEL_FETCH_FAILED'
      )
      expect(result.error?.json.message).toBe(
        'Failed to retrieve default pricing model'
      )
      // details should be undefined for non-Error types
      expect(result.error?.json.details).toBe(undefined)
    })
  })
})
