import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it } from 'vitest'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'
import { getDefaultPricingModel } from './pricingHandlers'

describe('getDefaultPricingModel handler', () => {
  it('returns status 200 with pricingModel containing id, name, and prices array when admin.getDefaultPricingModel() resolves successfully', async () => {
    const mockAdmin = {
      getDefaultPricingModel: async () => ({
        pricingModel: {
          id: 'pm_123',
          name: 'Pro Plan',
          prices: [{ id: 'price_1', unitAmount: 1000 }],
        },
      }),
    } as unknown as FlowgladServerAdmin

    const result = await getDefaultPricingModel(
      { method: HTTPMethod.GET, data: {} },
      mockAdmin
    )

    expect(result.status).toBe(200)
    expect((result.data as any).pricingModel.id).toBe('pm_123')
    expect((result.data as any).pricingModel.name).toBe('Pro Plan')
    expect((result.data as any).pricingModel.prices).toHaveLength(1)
    expect(result.error).toBeUndefined()
  })

  it('returns status 500 with error.message containing original error text when admin.getDefaultPricingModel() throws an Error', async () => {
    const mockAdmin = {
      getDefaultPricingModel: async () => {
        throw new Error('Database connection failed')
      },
    } as unknown as FlowgladServerAdmin

    const result = await getDefaultPricingModel(
      { method: HTTPMethod.GET, data: {} },
      mockAdmin
    )

    expect(result.status).toBe(500)
    expect(result.data).toEqual({})
    expect(result.error?.message).toBe('Database connection failed')
  })

  it('returns status 500 with generic error message when admin.getDefaultPricingModel() throws non-Error value', async () => {
    const mockAdmin = {
      getDefaultPricingModel: async () => {
        throw 'string error'
      },
    } as unknown as FlowgladServerAdmin

    const result = await getDefaultPricingModel(
      { method: HTTPMethod.GET, data: {} },
      mockAdmin
    )

    expect(result.status).toBe(500)
    expect(result.error?.message).toBe(
      'Failed to fetch default pricing model'
    )
  })

  it('returns status 405 when method is not GET', async () => {
    const mockAdmin = {
      getDefaultPricingModel: async () => ({
        pricingModel: { id: 'pm_123' },
      }),
    } as unknown as FlowgladServerAdmin

    // Type assertion needed because we're testing invalid method handling
    const result = await getDefaultPricingModel(
      { method: HTTPMethod.POST as HTTPMethod.GET, data: {} },
      mockAdmin
    )

    expect(result.status).toBe(405)
    expect(result.error?.message).toBe('Method not allowed')
  })
})
