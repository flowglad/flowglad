import { describe, expect, it } from 'vitest'
import {
  singlePaymentDummyPrice,
  subscriptionDummyPrice,
  usageDummyPrice,
} from '@/stubs/priceStubs'
import {
  isReservedPriceSlug,
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

describe('isReservedPriceSlug', () => {
  it('returns true for slugs ending with _no_charge, including various prefixes and the bare suffix', () => {
    expect(isReservedPriceSlug('api_requests_no_charge')).toBe(true)
    expect(isReservedPriceSlug('storage_gb_no_charge')).toBe(true)
    expect(isReservedPriceSlug('meter_no_charge')).toBe(true)
    expect(isReservedPriceSlug('_no_charge')).toBe(true)
  })

  it('returns false for slugs that do not end with _no_charge, including those that contain it in the middle, start with no_charge, or are empty', () => {
    expect(isReservedPriceSlug('api_requests')).toBe(false)
    expect(isReservedPriceSlug('no_charge_extra')).toBe(false)
    expect(isReservedPriceSlug('my_no_charge_price')).toBe(false)
    expect(isReservedPriceSlug('no_charge')).toBe(false)
    expect(isReservedPriceSlug('')).toBe(false)
  })

  it('is case-sensitive (only lowercase _no_charge suffix is reserved)', () => {
    expect(isReservedPriceSlug('meter_NO_CHARGE')).toBe(false)
    expect(isReservedPriceSlug('meter_No_Charge')).toBe(false)
    expect(isReservedPriceSlug('meter_no_charge')).toBe(true)
  })
})
