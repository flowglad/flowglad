import { describe, expect, it } from 'bun:test'
import {
  singlePaymentDummyPrice,
  subscriptionDummyPrice,
  usageDummyPrice,
} from '@/stubs/priceStubs'
import {
  type Price,
  pricesSelectSchema,
  singlePaymentPriceDefaultColumns,
  subscriptionPriceDefaultColumns,
  usagePriceDefaultColumns,
} from './prices'

const testStartingPriceToDestinationPrice = (
  startingPrice: Price.Record,
  defaultColumns: Record<string, any>,
  selectSchema: typeof pricesSelectSchema
) => {
  const transformedToDestinationPrice = {
    ...startingPrice,
    ...defaultColumns,
  }
  const parsed = selectSchema.safeParse(transformedToDestinationPrice)
  expect(parsed.success).toBe(true)
  expect(parsed.data).toEqual(transformedToDestinationPrice)
}

describe('Price Defaults', () => {
  it('should transform subscription -> usage', () => {
    const transformedToUsagePrice = {
      ...subscriptionDummyPrice,
      ...usagePriceDefaultColumns,
    }
    testStartingPriceToDestinationPrice(
      transformedToUsagePrice,
      usagePriceDefaultColumns,
      pricesSelectSchema
    )
  })
  it('should transform subscription -> single payment', () => {
    const transformedToSinglePaymentPrice = {
      ...subscriptionDummyPrice,
      ...singlePaymentPriceDefaultColumns,
      intervalCount: null,
      intervalUnit: null,
      trialPeriodDays: null,
      usageEventsPerUnit: null,
      usageMeterId: null,
    }
    testStartingPriceToDestinationPrice(
      transformedToSinglePaymentPrice,
      singlePaymentPriceDefaultColumns,
      pricesSelectSchema
    )
  })
  it('should transform usage -> subscription', () => {
    const transformedToSubscriptionPrice = {
      ...usageDummyPrice,
      ...subscriptionPriceDefaultColumns,
    }
    testStartingPriceToDestinationPrice(
      transformedToSubscriptionPrice,
      subscriptionPriceDefaultColumns,
      pricesSelectSchema
    )
  })
  it('should transform usage -> single payment', () => {
    const transformedToSinglePaymentPrice = {
      ...usageDummyPrice,
      ...singlePaymentPriceDefaultColumns,
      usageEventsPerUnit: null,
      intervalCount: null,
      intervalUnit: null,
      usageMeterId: null,
    }
    testStartingPriceToDestinationPrice(
      transformedToSinglePaymentPrice,
      singlePaymentPriceDefaultColumns,
      pricesSelectSchema
    )
  })
  it('should transform single payment -> subscription', () => {
    const transformedToSubscriptionPrice = {
      ...singlePaymentDummyPrice,
      ...subscriptionPriceDefaultColumns,
    }
    testStartingPriceToDestinationPrice(
      transformedToSubscriptionPrice,
      subscriptionPriceDefaultColumns,
      pricesSelectSchema
    )
  })
  it('should transform single payment -> usage', () => {
    const transformedToUsagePrice = {
      ...singlePaymentDummyPrice,
      ...usagePriceDefaultColumns,
    }
    testStartingPriceToDestinationPrice(
      transformedToUsagePrice,
      usagePriceDefaultColumns,
      pricesSelectSchema
    )
  })
  it('allow subscriptions to have no overage / usage fields', () => {
    const transformedToUsagePrice = {
      ...subscriptionDummyPrice,
      usageEventsPerUnit: undefined,
    }
    testStartingPriceToDestinationPrice(
      // @ts-expect-error - we want to test the case where the fields are undefined
      transformedToUsagePrice,
      usagePriceDefaultColumns,
      pricesSelectSchema
    )
  })
})
