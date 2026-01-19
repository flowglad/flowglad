import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from './FlowgladServer'
import {
  type RequestHandlerInput,
  type RequestHandlerOptions,
  requestHandler,
} from './requestHandler'

// Mock request type for testing
type MockRequest = { headers: Record<string, string> }

const createMockFlowgladServer = () => {
  return {
    getBilling: vi.fn(),
    getSession: vi.fn(),
  } as unknown as FlowgladServer
}

const createMockOptions = (
  overrides?: Partial<RequestHandlerOptions<MockRequest>>
): RequestHandlerOptions<MockRequest> => ({
  getCustomerExternalId: vi.fn().mockResolvedValue('customer_123'),
  flowglad: vi.fn().mockResolvedValue(createMockFlowgladServer()),
  ...overrides,
})

describe('requestHandler', () => {
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
    it('calls getCustomerExternalId and flowglad for authenticated routes', async () => {
      const getCustomerExternalId = vi
        .fn()
        .mockResolvedValue('customer_123')
      const flowglad = vi
        .fn()
        .mockResolvedValue(createMockFlowgladServer())
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
  })

  describe('lifecycle hooks', () => {
    it('calls beforeRequest before processing', async () => {
      const beforeRequest = vi.fn()
      const options = createMockOptions({ beforeRequest })
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: {},
      }

      await handler(input, { headers: {} })

      expect(beforeRequest).toHaveBeenCalledTimes(1)
    })

    it('calls onError when an error occurs', async () => {
      const onError = vi.fn()
      const getCustomerExternalId = vi
        .fn()
        .mockRejectedValue(new Error('Auth failed'))
      const options = createMockOptions({
        onError,
        getCustomerExternalId,
      })
      const handler = requestHandler(options)

      const input: RequestHandlerInput = {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: {},
      }

      await handler(input, { headers: {} })

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
})
