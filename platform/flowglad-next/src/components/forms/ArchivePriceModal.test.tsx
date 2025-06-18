import { expect, it, describe } from 'vitest'
import {
  editPriceSchema,
  nulledPriceColumns,
  Price,
} from '@/db/schema/prices'
import { PriceType, CurrencyCode, IntervalUnit } from '@/types'
import { priceToArchivePriceInput } from './ArchivePriceModal'

const coreParams = {
  id: 'price_1',
  productId: 'prod_1',
  livemode: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdByCommit: '1',
  updatedByCommit: '1',
  ...nulledPriceColumns,
} as const

describe('priceToEditPriceInput', () => {
  it('should correctly format an active subscription price for archival', () => {
    const price: Price.ClientSubscriptionRecord = {
      ...coreParams,
      active: true,
      type: PriceType.Subscription,
      name: 'Monthly Subscription',
      unitPrice: 1000,
      isDefault: true,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      trialPeriodDays: null,
      setupFeeAmount: null,
      usageMeterId: null,
      usageEventsPerUnit: null,
      overagePriceId: null,
      slug: 'test-price',
    }
    const result = priceToArchivePriceInput(price)
    expect(result).toEqual({
      id: 'price_1',
      price: {
        id: 'price_1',
        productId: 'prod_1',
        active: false,
        type: PriceType.Subscription,
      },
    })
    expect(editPriceSchema.safeParse(result).success).toBe(true)
  })

  it('should correctly format an inactive subscription price for unarchival', () => {
    const price: Price.ClientSubscriptionRecord = {
      ...coreParams,
      active: false,
      type: PriceType.Subscription,
      name: 'Monthly Subscription',
      unitPrice: 1000,
      isDefault: true,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Month,
      usageMeterId: null,
      intervalCount: 1,
      trialPeriodDays: null,
      setupFeeAmount: null,
      livemode: false,
      usageEventsPerUnit: null,
      overagePriceId: null,
      slug: 'test-price',
    }
    const result = priceToArchivePriceInput(price)
    expect(result).toEqual({
      id: 'price_1',
      price: {
        id: 'price_1',
        productId: 'prod_1',
        active: true,
        type: PriceType.Subscription,
      },
    })
    expect(editPriceSchema.safeParse(result).success).toBe(true)
  })

  it('should correctly format a single payment price for archival', () => {
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
      overagePriceId: null,
      slug: 'test-price',
    }
    const result = priceToArchivePriceInput(price)
    expect(result).toEqual({
      id: 'price_1',
      price: {
        id: 'price_1',
        productId: 'prod_1',
        active: false,
        type: PriceType.SinglePayment,
      },
    })
    expect(editPriceSchema.safeParse(result).success).toBe(true)
  })

  it('should correctly format a usage-based price for archival', () => {
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
      overagePriceId: null,
      usageMeterId: 'um_1',
      usageEventsPerUnit: 1,
      slug: 'test-price',
    }
    const result = priceToArchivePriceInput(price)
    expect(result).toEqual({
      id: 'price_1',
      price: {
        id: 'price_1',
        productId: 'prod_1',
        active: false,
        type: PriceType.Usage,
      },
    })
    const parseResult = editPriceSchema.safeParse(result)
    expect(parseResult.success).toBe(true)
  })
})
