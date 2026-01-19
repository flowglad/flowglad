import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from './FlowgladServer'
import {
  RequestHandlerError,
  type RequestHandlerInput,
  type RequestHandlerOptions,
  requestHandler,
} from './requestHandler'
import { isHybridActionKey } from './subrouteHandlers'

// Mock request type for testing
type MockRequest = { headers: Record<string, string> }

const mockBillingResponse = {
  customer: { id: 'cust_123' },
  subscriptions: [],
}

const createMockFlowgladServer = () => {
  const mockGetBilling = vi.fn()
  const server = {
    getBilling: mockGetBilling,
    getSession: vi.fn(),
  } as unknown as FlowgladServer
  return { server, mocks: { getBilling: mockGetBilling } }
}

const createMockOptions = (
  overrides?: Partial<RequestHandlerOptions<MockRequest>>
): RequestHandlerOptions<MockRequest> => ({
  getCustomerExternalId: vi.fn().mockResolvedValue('customer_123'),
  flowglad: vi
    .fn()
    .mockResolvedValue(createMockFlowgladServer().server),
  ...overrides,
})

describe('requestHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('path validation', () => {
    it('returns 404 for invalid paths that do not match any FlowgladActionKey', async () => {
      const options = createMockOptions()
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['invalid', 'path'],
        method: HTTPMethod.POST,
        body: {},
      }

      const result = await handler(input, { headers: {} })

      expect(result.status).toBe(404)
      expect(result.error).toEqual({
        message: '"invalid/path" is not a valid Flowglad API path',
      })
    })

    it('validates path before attempting authentication', async () => {
      const getCustomerExternalId = vi.fn()
      const options = createMockOptions({ getCustomerExternalId })
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['nonexistent', 'route'],
        method: HTTPMethod.POST,
        body: {},
      }

      await handler(input, { headers: {} })

      // getCustomerExternalId should NOT be called for invalid paths
      expect(getCustomerExternalId).not.toHaveBeenCalled()
    })
  })

  describe('hybrid route gating', () => {
    it('returns 501 for GetPricingModel hybrid route with message indicating apiKey configuration required', async () => {
      const getCustomerExternalId = vi.fn()
      const options = createMockOptions({ getCustomerExternalId })
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['pricing-models', 'retrieve'],
        method: HTTPMethod.POST,
        body: {},
      }

      const result = await handler(input, { headers: {} })

      expect(result.status).toBe(501)
      expect(result.error).toEqual({
        message: `"${FlowgladActionKey.GetPricingModel}" requires apiKey configuration for hybrid route support`,
      })
    })

    it('does not call getCustomerExternalId for hybrid routes since they require special handling', async () => {
      const getCustomerExternalId = vi.fn()
      const options = createMockOptions({ getCustomerExternalId })
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['pricing-models', 'retrieve'],
        method: HTTPMethod.POST,
        body: {},
      }

      await handler(input, { headers: {} })

      // Auth functions should not be called for hybrid routes (blocked early)
      expect(getCustomerExternalId).not.toHaveBeenCalled()
    })
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

    it('calls getCustomerExternalId and flowglad for authenticated routes', async () => {
      const getCustomerExternalId = vi
        .fn()
        .mockResolvedValue('customer_123')
      const flowglad = vi
        .fn()
        .mockResolvedValue(createMockFlowgladServer().server)
      const options = createMockOptions({
        getCustomerExternalId,
        flowglad,
      })
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: {},
      }

      await handler(input, { headers: {} })

      expect(getCustomerExternalId).toHaveBeenCalledTimes(1)
      expect(flowglad).toHaveBeenCalledWith('customer_123')
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
  })

  describe('lifecycle hooks', () => {
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
  })

  describe('error handling', () => {
    it('returns error response with status from error object when available', async () => {
      const error = new Error('Custom error')
      ;(error as unknown as { status: number }).status = 403

      const getCustomerExternalId = vi.fn().mockRejectedValue(error)
      const options = createMockOptions({ getCustomerExternalId })
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: {},
      }

      const result = await handler(input, { headers: {} })

      expect(result.status).toBe(403)
      expect(result.error).toEqual({ message: 'Custom error' })
    })

    it('returns 400 with generic message for errors without message property', async () => {
      const getCustomerExternalId = vi
        .fn()
        .mockRejectedValue({ noMessage: true })
      const options = createMockOptions({ getCustomerExternalId })
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: {},
      }

      const result = await handler(input, { headers: {} })

      expect(result.status).toBe(400)
      expect(result.error).toEqual({
        message: 'Internal server error',
      })
    })
  })

  describe('hybrid route behavior (GetPricingModel)', () => {
    it('returns 501 for hybrid route without apiKey configuration', async () => {
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
