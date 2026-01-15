import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assert500Error,
} from './__tests__/test-utils'
import {
  adjustSubscription,
  cancelSubscription,
  uncancelSubscription,
} from './subscriptionHandlers'

const mockSubscription = {
  id: 'sub_123',
  status: 'active',
  customerId: 'cust_123',
}

const mockCanceledSubscription = {
  ...mockSubscription,
  status: 'canceled',
  canceledAt: Date.now(),
}

const mockAdjustmentResult = {
  subscription: mockSubscription,
  items: [{ id: 'si_123', priceId: 'price_456' }],
}

const createMockFlowgladServer = () => {
  const mockCancelSubscription = vi.fn()
  const mockUncancelSubscription = vi.fn()
  const mockAdjustSubscription = vi.fn()

  const server = {
    cancelSubscription: mockCancelSubscription,
    uncancelSubscription: mockUncancelSubscription,
    adjustSubscription: mockAdjustSubscription,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      cancelSubscription: mockCancelSubscription,
      uncancelSubscription: mockUncancelSubscription,
      adjustSubscription: mockAdjustSubscription,
    },
  }
}

describe('Subscription subroute handlers', () => {
  describe('cancelSubscription handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await cancelSubscription(
        { method: HTTPMethod.GET, data: {} } as unknown as Parameters<
          typeof cancelSubscription
        >[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await cancelSubscription(
        { method: HTTPMethod.PUT, data: {} } as unknown as Parameters<
          typeof cancelSubscription
        >[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PATCH request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await cancelSubscription(
        {
          method: HTTPMethod.PATCH,
          data: {},
        } as unknown as Parameters<typeof cancelSubscription>[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for DELETE request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await cancelSubscription(
        {
          method: HTTPMethod.DELETE,
          data: {},
        } as unknown as Parameters<typeof cancelSubscription>[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 200 with subscription for valid POST request without explicit subscriptionId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.cancelSubscription.mockResolvedValue(
        mockCanceledSubscription
      )

      const result = await cancelSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            id: 'sub_123',
            cancellation: { timing: 'immediately' },
          },
        },
        server
      )

      assert200Success(result, mockCanceledSubscription)
      expect(mocks.cancelSubscription).toHaveBeenCalledWith({
        id: 'sub_123',
        cancellation: { timing: 'immediately' },
      })
    })

    it('returns 200 with subscription for valid POST request with at_end_of_current_billing_period timing', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.cancelSubscription.mockResolvedValue(
        mockCanceledSubscription
      )

      const result = await cancelSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            id: 'sub_456',
            cancellation: {
              timing: 'at_end_of_current_billing_period',
            },
          },
        },
        server
      )

      assert200Success(result, mockCanceledSubscription)
      expect(mocks.cancelSubscription).toHaveBeenCalledWith({
        id: 'sub_456',
        cancellation: { timing: 'at_end_of_current_billing_period' },
      })
    })

    it('returns 500 with subscription_cancel_failed when server throws', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.cancelSubscription.mockRejectedValue(
        new Error('Subscription already canceled')
      )

      const result = await cancelSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            id: 'sub_123',
            cancellation: { timing: 'immediately' },
          },
        },
        server
      )

      assert500Error(
        result,
        'subscription_cancel_failed',
        'Subscription already canceled'
      )
    })

    it('returns 500 with subscription_cancel_failed when server throws ownership error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.cancelSubscription.mockRejectedValue(
        new Error('Subscription is not owned by the current user')
      )

      const result = await cancelSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            id: 'sub_456',
            cancellation: { timing: 'immediately' },
          },
        },
        server
      )

      assert500Error(
        result,
        'subscription_cancel_failed',
        'Subscription is not owned by the current user'
      )
    })
  })

  describe('uncancelSubscription handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await uncancelSubscription(
        { method: HTTPMethod.GET, data: {} } as unknown as Parameters<
          typeof uncancelSubscription
        >[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await uncancelSubscription(
        { method: HTTPMethod.PUT, data: {} } as unknown as Parameters<
          typeof uncancelSubscription
        >[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PATCH request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await uncancelSubscription(
        {
          method: HTTPMethod.PATCH,
          data: {},
        } as unknown as Parameters<typeof uncancelSubscription>[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for DELETE request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await uncancelSubscription(
        {
          method: HTTPMethod.DELETE,
          data: {},
        } as unknown as Parameters<typeof uncancelSubscription>[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 200 with subscription for valid POST request', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.uncancelSubscription.mockResolvedValue(mockSubscription)

      const result = await uncancelSubscription(
        { method: HTTPMethod.POST, data: { id: 'sub_123' } },
        server
      )

      assert200Success(result, mockSubscription)
      expect(mocks.uncancelSubscription).toHaveBeenCalledWith({
        id: 'sub_123',
      })
    })

    it('returns 200 with subscription for valid POST request with different id', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.uncancelSubscription.mockResolvedValue(mockSubscription)

      const result = await uncancelSubscription(
        { method: HTTPMethod.POST, data: { id: 'sub_456' } },
        server
      )

      assert200Success(result, mockSubscription)
      expect(mocks.uncancelSubscription).toHaveBeenCalledWith({
        id: 'sub_456',
      })
    })

    it('returns 500 with subscription_uncancel_failed when server throws', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.uncancelSubscription.mockRejectedValue(
        new Error('Subscription is not canceled')
      )

      const result = await uncancelSubscription(
        { method: HTTPMethod.POST, data: { id: 'sub_123' } },
        server
      )

      assert500Error(
        result,
        'subscription_uncancel_failed',
        'Subscription is not canceled'
      )
    })

    it('returns 500 with subscription_uncancel_failed when server throws not-found error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.uncancelSubscription.mockRejectedValue(
        new Error('Subscription not found')
      )

      const result = await uncancelSubscription(
        { method: HTTPMethod.POST, data: { id: 'sub_999' } },
        server
      )

      assert500Error(
        result,
        'subscription_uncancel_failed',
        'Subscription not found'
      )
    })

    it('returns 500 with subscription_uncancel_failed when server throws ownership error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.uncancelSubscription.mockRejectedValue(
        new Error('Subscription is not owned by the current user')
      )

      const result = await uncancelSubscription(
        { method: HTTPMethod.POST, data: { id: 'sub_456' } },
        server
      )

      assert500Error(
        result,
        'subscription_uncancel_failed',
        'Subscription is not owned by the current user'
      )
    })
  })

  describe('adjustSubscription handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await adjustSubscription(
        { method: HTTPMethod.GET, data: {} } as unknown as Parameters<
          typeof adjustSubscription
        >[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await adjustSubscription(
        { method: HTTPMethod.PUT, data: {} } as unknown as Parameters<
          typeof adjustSubscription
        >[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PATCH request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await adjustSubscription(
        {
          method: HTTPMethod.PATCH,
          data: {},
        } as unknown as Parameters<typeof adjustSubscription>[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for DELETE request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await adjustSubscription(
        {
          method: HTTPMethod.DELETE,
          data: {},
        } as unknown as Parameters<typeof adjustSubscription>[0],
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 200 with result for valid POST request with priceId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.adjustSubscription.mockResolvedValue(mockAdjustmentResult)

      const result = await adjustSubscription(
        {
          method: HTTPMethod.POST,
          data: { priceId: 'price_456', timing: 'auto', quantity: 1 },
        },
        server
      )

      assert200Success(result, mockAdjustmentResult)
      expect(mocks.adjustSubscription).toHaveBeenCalledWith({
        priceId: 'price_456',
        timing: 'auto',
        quantity: 1,
      })
    })

    it('returns 200 with result for valid POST request with priceSlug', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.adjustSubscription.mockResolvedValue(mockAdjustmentResult)

      const result = await adjustSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            priceSlug: 'pro-monthly',
            timing: 'immediately',
            quantity: 1,
          },
        },
        server
      )

      assert200Success(result, mockAdjustmentResult)
      expect(mocks.adjustSubscription).toHaveBeenCalledWith({
        priceSlug: 'pro-monthly',
        timing: 'immediately',
        quantity: 1,
      })
    })

    it('returns 200 with result for valid POST request with subscriptionId and priceId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.adjustSubscription.mockResolvedValue(mockAdjustmentResult)

      const result = await adjustSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            subscriptionId: 'sub_123',
            priceId: 'price_456',
            timing: 'at_end_of_current_billing_period',
            quantity: 1,
          },
        },
        server
      )

      assert200Success(result, mockAdjustmentResult)
      expect(mocks.adjustSubscription).toHaveBeenCalledWith({
        subscriptionId: 'sub_123',
        priceId: 'price_456',
        timing: 'at_end_of_current_billing_period',
        quantity: 1,
      })
    })

    it('returns 200 with result for valid POST request with custom quantity', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.adjustSubscription.mockResolvedValue(mockAdjustmentResult)

      const result = await adjustSubscription(
        {
          method: HTTPMethod.POST,
          data: { priceId: 'price_456', quantity: 5, timing: 'auto' },
        },
        server
      )

      assert200Success(result, mockAdjustmentResult)
      expect(mocks.adjustSubscription).toHaveBeenCalledWith({
        priceId: 'price_456',
        quantity: 5,
        timing: 'auto',
      })
    })

    it('returns 500 with subscription_adjust_failed when server throws', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.adjustSubscription.mockRejectedValue(
        new Error('Invalid price')
      )

      const result = await adjustSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            priceId: 'price_invalid',
            timing: 'auto',
            quantity: 1,
          },
        },
        server
      )

      assert500Error(
        result,
        'subscription_adjust_failed',
        'Invalid price'
      )
    })

    it('returns 500 with subscription_adjust_failed when server throws subscription-not-found error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.adjustSubscription.mockRejectedValue(
        new Error('Subscription not found')
      )

      const result = await adjustSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            subscriptionId: 'sub_999',
            priceId: 'price_456',
            timing: 'auto',
            quantity: 1,
          },
        },
        server
      )

      assert500Error(
        result,
        'subscription_adjust_failed',
        'Subscription not found'
      )
    })

    it('returns 500 with subscription_adjust_failed when server throws terminal-state error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.adjustSubscription.mockRejectedValue(
        new Error('Cannot adjust subscription in terminal state')
      )

      const result = await adjustSubscription(
        {
          method: HTTPMethod.POST,
          data: { priceId: 'price_456', timing: 'auto', quantity: 1 },
        },
        server
      )

      assert500Error(
        result,
        'subscription_adjust_failed',
        'Cannot adjust subscription in terminal state'
      )
    })

    it('returns 500 with subscription_adjust_failed when server throws ownership error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.adjustSubscription.mockRejectedValue(
        new Error('Subscription is not owned by the current user')
      )

      const result = await adjustSubscription(
        {
          method: HTTPMethod.POST,
          data: {
            subscriptionId: 'sub_456',
            priceId: 'price_456',
            timing: 'auto',
            quantity: 1,
          },
        },
        server
      )

      assert500Error(
        result,
        'subscription_adjust_failed',
        'Subscription is not owned by the current user'
      )
    })
  })
})
