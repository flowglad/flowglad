import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  assert200Success,
  assert400BadRequest,
  assert403Forbidden,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './test-utils'
import { createUsageEvent } from './usageEventHandlers'

const mockUsageEvent = {
  id: 'ue_123',
  subscriptionId: 'sub_123',
  priceId: 'price_123',
  amount: 1,
  transactionId: 'txn_123',
}

const mockBillingWithSubscription = {
  currentSubscription: { id: 'sub_123', status: 'active' },
  currentSubscriptions: [
    { id: 'sub_123', status: 'active' },
    { id: 'sub_456', status: 'active' },
  ],
}

const mockBillingWithoutSubscription = {
  currentSubscription: null,
  currentSubscriptions: [],
}

const createMockFlowgladServer = () => {
  const mockGetBilling = vi.fn()
  const mockCreateUsageEvent = vi.fn()

  const server = {
    getBilling: mockGetBilling,
    createUsageEvent: mockCreateUsageEvent,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getBilling: mockGetBilling,
      createUsageEvent: mockCreateUsageEvent,
    },
  }
}

describe('Usage event subroute handlers', () => {
  describe('createUsageEvent handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await createUsageEvent(
        {
          method: HTTPMethod.GET,
          data: { priceId: 'price_123' },
        } as unknown as Parameters<typeof createUsageEvent>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await createUsageEvent(
        {
          method: HTTPMethod.PUT,
          data: { priceId: 'price_123' },
        } as unknown as Parameters<typeof createUsageEvent>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns 405 for DELETE request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await createUsageEvent(
        {
          method: HTTPMethod.DELETE,
          data: { priceId: 'price_123' },
        } as unknown as Parameters<typeof createUsageEvent>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns 400 with missing_subscription_id when no subscriptionId and no currentSubscription', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(
        mockBillingWithoutSubscription
      )

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: { priceId: 'price_123' },
        },
        server
      )

      expect(mocks.getBilling).toHaveBeenCalled()
      assert400BadRequest(
        result,
        'missing_subscription_id',
        'subscriptionId required: no current subscription found'
      )
    })

    it('returns 403 forbidden when subscriptionId not in customer subscriptions', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_123',
            subscriptionId: 'sub_999',
          },
        },
        server
      )

      expect(mocks.getBilling).toHaveBeenCalled()
      assert403Forbidden(
        result,
        "Subscription sub_999 is not found among the customer's current subscriptions"
      )
    })

    it('returns 200 with usageEvent for valid POST with explicit subscriptionId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)
      mocks.createUsageEvent.mockResolvedValue(mockUsageEvent)

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_123',
            subscriptionId: 'sub_123',
            amount: 5,
          },
        },
        server
      )

      assert200Success(result, mockUsageEvent)
      expect(mocks.createUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          priceId: 'price_123',
          subscriptionId: 'sub_123',
          amount: 5,
        })
      )
    })

    it('returns 200 with usageEvent using default subscriptionId from currentSubscription', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)
      mocks.createUsageEvent.mockResolvedValue(mockUsageEvent)

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: { priceId: 'price_123' },
        },
        server
      )

      assert200Success(result, mockUsageEvent)
      expect(mocks.createUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 'sub_123', // from currentSubscription
        })
      )
    })

    it('returns 200 with default amount of 1 when amount not provided', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)
      mocks.createUsageEvent.mockResolvedValue(mockUsageEvent)

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_123',
            subscriptionId: 'sub_123',
          },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(mocks.createUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1,
        })
      )
    })

    it('returns 200 with provided transactionId when specified', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)
      mocks.createUsageEvent.mockResolvedValue(mockUsageEvent)

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_123',
            subscriptionId: 'sub_123',
            transactionId: 'custom_txn_123',
          },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(mocks.createUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'custom_txn_123',
        })
      )
    })

    it('returns 200 with generated transactionId when not provided', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)
      mocks.createUsageEvent.mockResolvedValue(mockUsageEvent)

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_123',
            subscriptionId: 'sub_123',
          },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(mocks.createUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: expect.any(String),
        })
      )
      // Verify it's a non-empty string (nanoid generates 21 char strings by default)
      const callArgs = mocks.createUsageEvent.mock.calls[0][0]
      expect(typeof callArgs.transactionId).toBe('string')
      expect(callArgs.transactionId.length).toBeGreaterThan(0)
    })

    it('returns 500 with parsed error code when server throws Error with parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)
      mocks.createUsageEvent.mockRejectedValue(
        new Error('400 {"message": "Feature not found"}')
      )

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_123',
            subscriptionId: 'sub_123',
          },
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: '400',
          json: { message: 'Feature not found' },
        },
        data: {},
      })
    })

    it('returns 500 with "Unknown" code when server throws Error with non-parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)
      mocks.createUsageEvent.mockRejectedValue(
        new Error('Something went wrong')
      )

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_123',
            subscriptionId: 'sub_123',
          },
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

    it('returns 500 with "Unknown error" when server throws non-Error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingWithSubscription)
      mocks.createUsageEvent.mockRejectedValue('oops')

      const result = await createUsageEvent(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_123',
            subscriptionId: 'sub_123',
          },
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
