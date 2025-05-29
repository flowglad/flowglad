import { describe, expect, it } from 'vitest'
import {
  singlePaymentDummyPrice,
  subscriptionDummyPrice,
  usageDummyPrice,
} from '@/stubs/priceStubs'
import {
  Price,
  pricesSelectSchema,
  singlePaymentPriceDefaultColumns,
  subscriptionPriceDefaultColumns,
  usagePriceDefaultColumns,
} from './prices'

const testStartingPriceToDestinationPrice = (
  startingPrice: Price.Record,
  defaultColumns: Record<string, any>,
  selectSchema: Zod.ZodType
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
})
