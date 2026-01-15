import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'
import { getDefaultPricingModel } from './pricingHandlers'

const createMockAdmin = (
  overrides: Partial<FlowgladServerAdmin> = {}
): FlowgladServerAdmin => {
  return {
    getDefaultPricingModel: vi.fn(),
    ...overrides,
  } as unknown as FlowgladServerAdmin
}

describe('getDefaultPricingModel', () => {
  it('returns 200 with valid pricing model on success', async () => {
    const mockPricingModel = {
      id: 'pm_123',
      name: 'Default Pricing',
      isDefault: true,
    }
    const mockAdmin = createMockAdmin({
      getDefaultPricingModel: vi.fn().mockResolvedValue({
        pricingModel: mockPricingModel,
      }),
    })

    const result = await getDefaultPricingModel(
      { method: HTTPMethod.GET, data: {} },
      mockAdmin
    )

    expect(result.status).toBe(200)
    expect(result.data).toEqual(mockPricingModel)
    expect(result.error).toBeUndefined()
  })

  it('returns 405 for non-GET methods', async () => {
    const mockAdmin = createMockAdmin()

    const result = await getDefaultPricingModel(
      { method: HTTPMethod.POST, data: {} },
      mockAdmin
    )

    expect(result.status).toBe(405)
    expect(result.data).toEqual({})
    expect(result.error).toEqual({ message: 'Method not allowed' })
  })

  it('returns 500 when admin call throws', async () => {
    const mockAdmin = createMockAdmin({
      getDefaultPricingModel: vi
        .fn()
        .mockRejectedValue(new Error('API error')),
    })

    const result = await getDefaultPricingModel(
      { method: HTTPMethod.GET, data: {} },
      mockAdmin
    )

    expect(result.status).toBe(500)
    expect(result.data).toEqual({})
    expect(result.error).toEqual({ message: 'API error' })
  })

  it('returns generic error message for non-Error throws', async () => {
    const mockAdmin = createMockAdmin({
      getDefaultPricingModel: vi
        .fn()
        .mockRejectedValue('string error'),
    })

    const result = await getDefaultPricingModel(
      { method: HTTPMethod.GET, data: {} },
      mockAdmin
    )

    expect(result.status).toBe(500)
    expect(result.data).toEqual({})
    expect(result.error).toEqual({
      message: 'Failed to fetch pricing model',
    })
  })

  it('calls admin.getDefaultPricingModel', async () => {
    const getDefaultPricingModelMock = vi.fn().mockResolvedValue({
      pricingModel: { id: 'pm_123' },
    })
    const mockAdmin = createMockAdmin({
      getDefaultPricingModel: getDefaultPricingModelMock,
    })

    await getDefaultPricingModel(
      { method: HTTPMethod.GET, data: {} },
      mockAdmin
    )

    expect(getDefaultPricingModelMock).toHaveBeenCalledTimes(1)
  })
})
