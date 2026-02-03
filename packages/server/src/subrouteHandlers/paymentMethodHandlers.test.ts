import type { FlowgladActionKey } from '@flowglad/shared'
import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './__tests__/test-utils'
import { getPaymentMethods } from './paymentMethodHandlers'
import type { InferRouteHandlerParams } from './types'

type GetPaymentMethodsParams =
  InferRouteHandlerParams<FlowgladActionKey.GetPaymentMethods>

const mockPaymentMethods = [
  {
    id: 'pm_123',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2025,
    },
    isDefault: true,
  },
  {
    id: 'pm_456',
    type: 'card',
    card: {
      brand: 'mastercard',
      last4: '5555',
      expMonth: 6,
      expYear: 2026,
    },
    isDefault: false,
  },
]

const mockBillingPortalUrl =
  'https://billing.stripe.com/session/test_123'

const createMockFlowgladServer = () => {
  const mockGetPaymentMethods = vi.fn()

  const server = {
    getPaymentMethods: mockGetPaymentMethods,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getPaymentMethods: mockGetPaymentMethods,
    },
  }
}

describe('getPaymentMethods handler', () => {
  it('returns 405 for GET request', async () => {
    const { server } = createMockFlowgladServer()
    const result = await getPaymentMethods(
      {
        method: HTTPMethod.GET,
        data: {},
      } as unknown as GetPaymentMethodsParams,
      server
    )
    assert405MethodNotAllowed(result)
  })

  it('returns 405 for PUT request', async () => {
    const { server } = createMockFlowgladServer()
    const result = await getPaymentMethods(
      {
        method: HTTPMethod.PUT,
        data: {},
      } as unknown as GetPaymentMethodsParams,
      server
    )
    assert405MethodNotAllowed(result)
  })

  it('returns payment methods via FlowgladServer', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getPaymentMethods.mockResolvedValue({
      paymentMethods: mockPaymentMethods,
      billingPortalUrl: mockBillingPortalUrl,
    })

    const result = await getPaymentMethods(
      { method: HTTPMethod.POST, data: {} },
      server
    )

    assert200Success(result, {
      paymentMethods: mockPaymentMethods,
      billingPortalUrl: mockBillingPortalUrl,
    })
    expect(mocks.getPaymentMethods).toHaveBeenCalledTimes(1)
  })

  it('returns empty array when no payment methods', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getPaymentMethods.mockResolvedValue({
      paymentMethods: [],
      billingPortalUrl: null,
    })

    const result = await getPaymentMethods(
      { method: HTTPMethod.POST, data: {} },
      server
    )

    assert200Success(result, {
      paymentMethods: [],
      billingPortalUrl: null,
    })
    expect(mocks.getPaymentMethods).toHaveBeenCalledTimes(1)
  })

  it('returns 500 with parsed error on failure', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getPaymentMethods.mockRejectedValue(
      new Error('500 {"message": "Failed to fetch payment methods"}')
    )

    const result = await getPaymentMethods(
      { method: HTTPMethod.POST, data: {} },
      server
    )

    assertHandlerResponse(result, {
      status: 500,
      error: {
        code: '500',
        json: { message: 'Failed to fetch payment methods' },
      },
      data: {},
    })
  })
})
