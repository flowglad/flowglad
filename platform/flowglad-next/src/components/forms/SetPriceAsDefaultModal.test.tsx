import { expect, it, describe } from 'vitest'
import { editPriceSchema, Price } from '@/db/schema/prices'
import { PriceType, CurrencyCode, IntervalUnit } from '@/types'
import { priceToSetPriceAsDefaultInput } from './SetPriceAsDefaultModal'

const coreParams = {
  id: 'price_1',
  productId: 'prod_1',
  livemode: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdByCommit: '1',
  updatedByCommit: '1',
} as const

describe('priceToSetPriceAsDefaultInput', () => {
  it('should correctly format a subscription price to be set as default', () => {
    const price: Price.ClientSubscriptionRecord = {
      ...coreParams,
      active: true,
      type: PriceType.Subscription,
      name: 'Monthly Subscription',
      unitPrice: 1000,
      isDefault: false,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      trialPeriodDays: null,
      setupFeeAmount: null,
      usageMeterId: null,
      usageEventsPerUnit: null,
    }
    const result = priceToSetPriceAsDefaultInput(price)
    expect(result).toEqual({
      id: 'price_1',
      price: {
        id: 'price_1',
        productId: 'prod_1',
        isDefault: true,
        type: PriceType.Subscription,
      },
    })
    expect(editPriceSchema.safeParse(result).success).toBe(true)
  })

  it('should correctly format a single payment price to be set as default', () => {
    const price: Price.ClientSinglePaymentRecord = {
      ...coreParams,
      active: true,
      type: PriceType.SinglePayment,
      name: 'One-time purchase',
      unitPrice: 5000,
      isDefault: false,
      currency: CurrencyCode.USD,
      usageMeterId: null,
      intervalUnit: null,
      intervalCount: null,
      trialPeriodDays: null,
      setupFeeAmount: null,
      usageEventsPerUnit: null,
    }
    const result = priceToSetPriceAsDefaultInput(price)
    expect(result).toEqual({
      id: 'price_1',
      price: {
        id: 'price_1',
        productId: 'prod_1',
        isDefault: true,
        type: PriceType.SinglePayment,
      },
    })
    expect(editPriceSchema.safeParse(result).success).toBe(true)
  })

  it('should correctly format a usage-based price to be set as default', () => {
    const price: Price.ClientUsageRecord = {
      ...coreParams,
      active: true,
      type: PriceType.Usage,
      name: 'Per-unit price',
      unitPrice: 100,
      isDefault: false,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      trialPeriodDays: null,
      setupFeeAmount: null,
      usageMeterId: 'um_1',
      usageEventsPerUnit: 1,
    }
    const result = priceToSetPriceAsDefaultInput(price)
    expect(result).toEqual({
      id: 'price_1',
      price: {
        id: 'price_1',
        productId: 'prod_1',
        isDefault: true,
        type: PriceType.Usage,
      },
    })
    const parseResult = editPriceSchema.safeParse(result)
    expect(parseResult.success).toBe(true)
  })
})
