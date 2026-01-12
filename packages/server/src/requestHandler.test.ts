import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from './FlowgladServer'
import type { FlowgladServerAdmin } from './FlowgladServerAdmin'
import { requestHandler } from './requestHandler'

describe('requestHandler public route handling', () => {
  const mockFlowgladServer = {
    getBilling: vi.fn().mockResolvedValue({}),
  } as unknown as FlowgladServer

  it('returns status 501 with error message when pricing endpoint called without flowgladAdmin configured', async () => {
    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => mockFlowgladServer,
    })

    const response = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(response.status).toBe(501)
    expect((response.error as any).message).toBe(
      'Public routes require flowgladAdmin option'
    )
  })

  it('does not call getCustomerExternalId when flowgladAdmin provided and public route requested', async () => {
    const getCustomerExternalId = vi.fn()
    const mockAdmin = {
      getDefaultPricingModel: async () => ({
        pricingModel: { id: 'pm_1', name: 'Test Plan', prices: [] },
      }),
    } as unknown as FlowgladServerAdmin

    const handler = requestHandler({
      getCustomerExternalId,
      flowglad: () => mockFlowgladServer,
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

  it('returns pricing model data when flowgladAdmin is configured and public route is requested', async () => {
    const mockAdmin = {
      getDefaultPricingModel: async () => ({
        pricingModel: {
          id: 'pm_123',
          name: 'Pro Plan',
          prices: [{ id: 'price_1', unitAmount: 1000 }],
        },
      }),
    } as unknown as FlowgladServerAdmin

    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => mockFlowgladServer,
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
    expect((response.data as any).pricingModel.id).toBe('pm_123')
    expect((response.data as any).pricingModel.name).toBe('Pro Plan')
  })

  it('calls getCustomerExternalId for non-public routes', async () => {
    const getCustomerExternalId = vi
      .fn()
      .mockResolvedValue('user_123')
    const flowglad = vi.fn().mockReturnValue({
      getBilling: vi.fn().mockResolvedValue({
        subscription: { id: 'sub_1' },
      }),
    })

    const handler = requestHandler({
      getCustomerExternalId,
      flowglad,
    })

    await handler(
      {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: { externalId: 'ext_123' },
      },
      {}
    )

    expect(getCustomerExternalId).toHaveBeenCalled()
    expect(flowglad).toHaveBeenCalledWith('user_123')
  })

  it('returns 404 for invalid paths', async () => {
    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => mockFlowgladServer,
    })

    const response = await handler(
      {
        path: ['invalid', 'path'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(response.status).toBe(404)
    expect((response.error as any).message).toContain(
      'is not a valid Flowglad API path'
    )
  })

  it('calls beforeRequest and afterRequest hooks', async () => {
    const beforeRequest = vi.fn()
    const afterRequest = vi.fn()
    const mockAdmin = {
      getDefaultPricingModel: async () => ({
        pricingModel: { id: 'pm_1' },
      }),
    } as unknown as FlowgladServerAdmin

    const handler = requestHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => mockFlowgladServer,
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

  it('calls onError when an error occurs', async () => {
    const onError = vi.fn()
    const handler = requestHandler({
      getCustomerExternalId: async () => {
        throw new Error('Auth failed')
      },
      flowglad: () => mockFlowgladServer,
      onError,
    })

    await handler(
      {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: { externalId: 'ext_123' },
      },
      {}
    )

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })
})
