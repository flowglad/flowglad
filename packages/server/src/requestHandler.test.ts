import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from './FlowgladServer'
import { RequestHandlerError, requestHandler } from './requestHandler'
import { isHybridActionKey } from './subrouteHandlers'

const mockBillingResponse = {
  customer: { id: 'cust_123' },
  subscriptions: [],
}

const createMockFlowgladServer = () => {
  const mockGetBilling = vi.fn()
  const server = {
    getBilling: mockGetBilling,
  } as unknown as FlowgladServer
  return { server, mocks: { getBilling: mockGetBilling } }
}

describe('requestHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('authenticated routes', () => {
    it('returns data for valid authenticated route', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingResponse)

      const handler = requestHandler({
        getCustomerExternalId: async () => 'user_123',
        flowglad: async () => server,
      })

      const result = await handler(
        {
          path: ['customers', 'billing'],
          method: HTTPMethod.POST,
          body: { externalId: 'user_123' },
        },
        {}
      )

      expect(result.status).toBe(200)
    })

    it('propagates error when getCustomerExternalId throws for authenticated route', async () => {
      const handler = requestHandler({
        getCustomerExternalId: async () => {
          throw new Error('Not authenticated')
        },
        flowglad: async () => ({}) as FlowgladServer,
      })

      const result = await handler(
        {
          path: ['customers', 'billing'],
          method: HTTPMethod.POST,
          body: {},
        },
        {}
      )

      // Authenticated routes should propagate auth errors, NOT fall back
      expect(result.status).toBe(500)
      expect(result.error).toEqual({ message: 'Not authenticated' })
    })

    it('calls onError callback when error occurs', async () => {
      const onError = vi.fn()

      const handler = requestHandler({
        getCustomerExternalId: async () => {
          throw new Error('Auth failed')
        },
        flowglad: async () => ({}) as FlowgladServer,
        onError,
      })

      await handler(
        {
          path: ['customers', 'billing'],
          method: HTTPMethod.POST,
          body: {},
        },
        {}
      )

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('calls beforeRequest hook before processing', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingResponse)
      const beforeRequest = vi.fn()

      const handler = requestHandler({
        getCustomerExternalId: async () => 'user_123',
        flowglad: async () => server,
        beforeRequest,
      })

      await handler(
        {
          path: ['customers', 'billing'],
          method: HTTPMethod.POST,
          body: { externalId: 'user_123' },
        },
        {}
      )

      expect(beforeRequest).toHaveBeenCalledTimes(1)
    })

    it('calls afterRequest hook after processing', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingResponse)
      const afterRequest = vi.fn()

      const handler = requestHandler({
        getCustomerExternalId: async () => 'user_123',
        flowglad: async () => server,
        afterRequest,
      })

      await handler(
        {
          path: ['customers', 'billing'],
          method: HTTPMethod.POST,
          body: { externalId: 'user_123' },
        },
        {}
      )

      expect(afterRequest).toHaveBeenCalledTimes(1)
    })
  })

  describe('invalid routes', () => {
    it('returns 404 for unknown route', async () => {
      const handler = requestHandler({
        getCustomerExternalId: async () => 'user_123',
        flowglad: async () => ({}) as FlowgladServer,
      })

      const result = await handler(
        {
          path: ['unknown', 'route'],
          method: HTTPMethod.POST,
          body: {},
        },
        {}
      )

      expect(result.status).toBe(404)
      expect(result.error).toEqual({
        message: '"unknown/route" is not a valid Flowglad API path',
      })
    })
  })

  describe('hybrid route behavior (GetPricingModel)', () => {
    /**
     * Note: The current implementation returns 501 for hybrid routes
     * as the full hybrid route support (with apiKey configuration)
     * requires additional implementation work.
     *
     * These tests verify the current behavior and serve as
     * documentation for the expected hybrid route behavior.
     */

    it('returns 501 for hybrid route without apiKey configuration', async () => {
      // Current implementation requires apiKey for hybrid routes
      const handler = requestHandler({
        getCustomerExternalId: async () => 'user_123',
        flowglad: async () => ({}) as FlowgladServer,
      })

      const result = await handler(
        {
          path: ['pricing-models', 'retrieve'],
          method: HTTPMethod.POST,
          body: {},
        },
        {}
      )

      // Current implementation returns 501 for hybrid routes
      expect(result.status).toBe(501)
      expect(result.error).toEqual({
        message:
          '"pricing-models/retrieve" requires apiKey configuration for hybrid route support',
      })
    })

    it('isHybridActionKey correctly identifies GetPricingModel as hybrid', () => {
      expect(
        isHybridActionKey(FlowgladActionKey.GetPricingModel)
      ).toBe(true)
      expect(
        isHybridActionKey(FlowgladActionKey.GetCustomerBilling)
      ).toBe(false)
      expect(
        isHybridActionKey(FlowgladActionKey.CancelSubscription)
      ).toBe(false)
    })
  })

  describe('RequestHandlerError', () => {
    it('has correct default status of 400', () => {
      const error = new RequestHandlerError('Test error')
      expect(error.status).toBe(400)
      expect(error.message).toBe('Test error')
      expect(error.name).toBe('RequestHandlerError')
    })

    it('accepts custom status code', () => {
      const error = new RequestHandlerError('Not found', 404)
      expect(error.status).toBe(404)
      expect(error.message).toBe('Not found')
    })
  })
})
