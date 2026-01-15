import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  createActivateSubscriptionCheckoutSession,
  createAddPaymentMethodCheckoutSession,
  createCheckoutSession,
} from './checkoutSessionHandlers'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './test-utils'

const mockCheckoutSession = {
  id: 'cs_123',
  url: 'https://checkout.stripe.com/session_123',
  status: 'open',
}

const createMockFlowgladServer = () => {
  const mockCreateCheckoutSession = vi.fn()
  const mockCreateAddPaymentMethodCheckoutSession = vi.fn()
  const mockCreateActivateSubscriptionCheckoutSession = vi.fn()

  const server = {
    createCheckoutSession: mockCreateCheckoutSession,
    createAddPaymentMethodCheckoutSession:
      mockCreateAddPaymentMethodCheckoutSession,
    createActivateSubscriptionCheckoutSession:
      mockCreateActivateSubscriptionCheckoutSession,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      createCheckoutSession: mockCreateCheckoutSession,
      createAddPaymentMethodCheckoutSession:
        mockCreateAddPaymentMethodCheckoutSession,
      createActivateSubscriptionCheckoutSession:
        mockCreateActivateSubscriptionCheckoutSession,
    },
  }
}

// Valid test data for each handler
const validCheckoutSessionData = {
  priceId: 'price_123',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
  quantity: 1,
}

const validAddPaymentMethodData = {
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
}

const validActivateSubscriptionData = {
  targetSubscriptionId: 'sub_123',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
}

describe('Checkout session subroute handlers', () => {
  describe('createCheckoutSession handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await createCheckoutSession(
        {
          method: HTTPMethod.GET as typeof HTTPMethod.POST,
          data: validCheckoutSessionData,
        },
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await createCheckoutSession(
        {
          method: HTTPMethod.PUT as typeof HTTPMethod.POST,
          data: validCheckoutSessionData,
        },
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 200 with checkoutSession for valid POST request with priceId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createCheckoutSession.mockResolvedValue(
        mockCheckoutSession
      )

      const result = await createCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validCheckoutSessionData,
        },
        server
      )

      assert200Success(result, mockCheckoutSession)
      expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
        validCheckoutSessionData
      )
    })

    it('returns 200 with checkoutSession for valid POST request with custom quantity', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createCheckoutSession.mockResolvedValue(
        mockCheckoutSession
      )

      const dataWithCustomQuantity = {
        ...validCheckoutSessionData,
        quantity: 5,
      }

      const result = await createCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: dataWithCustomQuantity,
        },
        server
      )

      assert200Success(result, mockCheckoutSession)
      expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
        dataWithCustomQuantity
      )
    })

    it('returns 500 with parsed error code when server throws Error with parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createCheckoutSession.mockRejectedValue(
        new Error('400 {"message": "Invalid price"}')
      )

      const result = await createCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validCheckoutSessionData,
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: '400',
          json: { message: 'Invalid price' },
        },
        data: {},
      })
    })

    it('returns 500 with "Unknown" code when server throws Error with non-parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createCheckoutSession.mockRejectedValue(
        new Error('Something went wrong')
      )

      const result = await createCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validCheckoutSessionData,
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'Unknown',
          json: { message: 'Something went wrong' },
        },
        data: {},
      })
    })

    it('returns 500 with "Unknown error" code when server throws non-Error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createCheckoutSession.mockRejectedValue('oops')

      const result = await createCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validCheckoutSessionData,
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'Unknown error',
          json: {},
        },
        data: {},
      })
    })
  })

  describe('createAddPaymentMethodCheckoutSession handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await createAddPaymentMethodCheckoutSession(
        {
          method: HTTPMethod.GET as typeof HTTPMethod.POST,
          data: validAddPaymentMethodData,
        },
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for DELETE request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await createAddPaymentMethodCheckoutSession(
        {
          method: HTTPMethod.DELETE as typeof HTTPMethod.POST,
          data: validAddPaymentMethodData,
        },
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 200 with checkoutSession for valid POST request', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createAddPaymentMethodCheckoutSession.mockResolvedValue(
        mockCheckoutSession
      )

      const result = await createAddPaymentMethodCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validAddPaymentMethodData,
        },
        server
      )

      assert200Success(result, mockCheckoutSession)
      expect(
        mocks.createAddPaymentMethodCheckoutSession
      ).toHaveBeenCalledWith(validAddPaymentMethodData)
    })

    it('returns 200 with checkoutSession for valid POST request with targetSubscriptionId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createAddPaymentMethodCheckoutSession.mockResolvedValue(
        mockCheckoutSession
      )

      const dataWithTargetSubscription = {
        ...validAddPaymentMethodData,
        targetSubscriptionId: 'sub_123',
      }

      const result = await createAddPaymentMethodCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: dataWithTargetSubscription,
        },
        server
      )

      assert200Success(result, mockCheckoutSession)
      expect(
        mocks.createAddPaymentMethodCheckoutSession
      ).toHaveBeenCalledWith(dataWithTargetSubscription)
    })

    it('returns 500 with parsed error code when server throws Error with parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createAddPaymentMethodCheckoutSession.mockRejectedValue(
        new Error('404 {"message": "Customer not found"}')
      )

      const result = await createAddPaymentMethodCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validAddPaymentMethodData,
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

    it('returns 500 with "Unknown" code when server throws Error with non-parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createAddPaymentMethodCheckoutSession.mockRejectedValue(
        new Error('Connection failed')
      )

      const result = await createAddPaymentMethodCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validAddPaymentMethodData,
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'Unknown',
          json: { message: 'Connection failed' },
        },
        data: {},
      })
    })

    it('returns 500 with "Unknown error" when server throws non-Error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createAddPaymentMethodCheckoutSession.mockRejectedValue({
        error: 'unexpected',
      })

      const result = await createAddPaymentMethodCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validAddPaymentMethodData,
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'Unknown error',
          json: {},
        },
        data: {},
      })
    })
  })

  describe('createActivateSubscriptionCheckoutSession handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await createActivateSubscriptionCheckoutSession(
        {
          method: HTTPMethod.GET as typeof HTTPMethod.POST,
          data: validActivateSubscriptionData,
        },
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PATCH request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await createActivateSubscriptionCheckoutSession(
        {
          method: HTTPMethod.PATCH as typeof HTTPMethod.POST,
          data: validActivateSubscriptionData,
        },
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 200 with checkoutSession for valid POST request with targetSubscriptionId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createActivateSubscriptionCheckoutSession.mockResolvedValue(
        mockCheckoutSession
      )

      const result = await createActivateSubscriptionCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validActivateSubscriptionData,
        },
        server
      )

      assert200Success(result, mockCheckoutSession)
      expect(
        mocks.createActivateSubscriptionCheckoutSession
      ).toHaveBeenCalledWith(validActivateSubscriptionData)
    })

    it('returns 200 with checkoutSession for valid POST request with outputMetadata', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createActivateSubscriptionCheckoutSession.mockResolvedValue(
        mockCheckoutSession
      )

      const dataWithMetadata = {
        ...validActivateSubscriptionData,
        outputMetadata: { source: 'test' },
      }

      const result = await createActivateSubscriptionCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: dataWithMetadata,
        },
        server
      )

      assert200Success(result, mockCheckoutSession)
      expect(
        mocks.createActivateSubscriptionCheckoutSession
      ).toHaveBeenCalledWith(dataWithMetadata)
    })

    it('returns 500 with parsed error code when server throws Error with parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createActivateSubscriptionCheckoutSession.mockRejectedValue(
        new Error('404 {"message": "Subscription not found"}')
      )

      const result = await createActivateSubscriptionCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validActivateSubscriptionData,
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: '404',
          json: { message: 'Subscription not found' },
        },
        data: {},
      })
    })

    it('returns 500 with "Unknown" code when server throws Error with non-parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createActivateSubscriptionCheckoutSession.mockRejectedValue(
        new Error('Subscription already active')
      )

      const result = await createActivateSubscriptionCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validActivateSubscriptionData,
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'Unknown',
          json: { message: 'Subscription already active' },
        },
        data: {},
      })
    })

    it('returns 500 with "Unknown error" when server throws non-Error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.createActivateSubscriptionCheckoutSession.mockRejectedValue(
        null
      )

      const result = await createActivateSubscriptionCheckoutSession(
        {
          method: HTTPMethod.POST,
          data: validActivateSubscriptionData,
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'Unknown error',
          json: {},
        },
        data: {},
      })
    })
  })
})
