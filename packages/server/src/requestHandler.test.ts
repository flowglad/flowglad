import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from './FlowgladServer'
import type { FlowgladServerAdmin } from './FlowgladServerAdmin'
import { requestHandler } from './requestHandler'

describe('requestHandler public route handling', () => {
  const createMockFlowgladServer = () =>
    ({
      getBilling: async () => ({}),
    }) as unknown as FlowgladServer

  it('returns status 501 with error message when pricing endpoint called without flowgladAdmin configured', async () => {
    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => createMockFlowgladServer(),
    })

    const response = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(response.status).toBe(501)
    expect(response.error).toEqual({
      message: 'Public routes require flowgladAdmin option',
    })
  })

  it('does not call getCustomerExternalId when flowgladAdmin provided and public route requested', async () => {
    const getCustomerExternalId = vi.fn()
    const mockAdmin = {
      getDefaultPricingModel: async () => ({
        pricingModel: { id: 'pm_1' },
      }),
    } as unknown as FlowgladServerAdmin

    const handler = requestHandler({
      getCustomerExternalId,
      flowglad: () => createMockFlowgladServer(),
      flowgladAdmin: () => mockAdmin,
    })

    await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(getCustomerExternalId).not.toHaveBeenCalled()
  })

  it('returns pricing model data when flowgladAdmin is provided', async () => {
    const mockPricingModel = {
      pricingModel: {
        id: 'pm_1',
        name: 'Pro Plan',
        prices: [{ id: 'price_1', unitAmount: 999 }],
      },
    }
    const mockAdmin = {
      getDefaultPricingModel: async () => mockPricingModel,
    } as unknown as FlowgladServerAdmin

    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => createMockFlowgladServer(),
      flowgladAdmin: () => mockAdmin,
    })

    const response = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(response.status).toBe(200)
    expect(response.data).toEqual(mockPricingModel)
  })

  it('calls getCustomerExternalId for non-public routes', async () => {
    const getCustomerExternalId = vi.fn().mockResolvedValue('user_1')
    const mockFlowglad = {
      getBilling: async () => ({ billing: {} }),
    } as unknown as FlowgladServer

    const handler = requestHandler({
      getCustomerExternalId,
      flowglad: () => mockFlowglad,
    })

    await handler(
      {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
      },
      {}
    )

    expect(getCustomerExternalId).toHaveBeenCalled()
  })

  it('returns 404 for invalid action key', async () => {
    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => createMockFlowgladServer(),
    })

    const response = await handler(
      {
        path: ['invalid', 'route'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(response.status).toBe(404)
    expect(response.error).toEqual({
      message: '"invalid/route" is not a valid Flowglad API path',
    })
  })

  it('calls beforeRequest and afterRequest hooks for public routes', async () => {
    const beforeRequest = vi.fn()
    const afterRequest = vi.fn()
    const mockAdmin = {
      getDefaultPricingModel: async () => ({
        pricingModel: { id: 'pm_1' },
      }),
    } as unknown as FlowgladServerAdmin

    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => createMockFlowgladServer(),
      flowgladAdmin: () => mockAdmin,
      beforeRequest,
      afterRequest,
    })

    await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(beforeRequest).toHaveBeenCalled()
    expect(afterRequest).toHaveBeenCalled()
  })

  it('calls onError when error occurs', async () => {
    const onError = vi.fn()
    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => createMockFlowgladServer(),
      onError,
    })

    await handler(
      {
        path: ['invalid', 'route'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(onError).toHaveBeenCalled()
  })
})
