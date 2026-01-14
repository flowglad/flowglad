import {
  addDays,
  addYears,
  differenceInDays,
  endOfMonth,
  startOfMonth,
} from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { DbTransaction } from '@/db/types'
import {
  BillingPeriodStatus,
  IntervalUnit,
  PriceType,
  RevenueChartIntervalUnit,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import {
  calculateBillingPeriodItemsValue,
  calculateMRRByMonth,
  calculateOverlapPercentage,
  getBillingPeriodsForDateRange,
  normalizeToMonthlyValue,
} from './revenueCalculationHelpers'

// No need to mock the database methods anymore as we'll use real database calls

describe('normalizeToMonthlyValue', () => {
  it('should normalize monthly values based on interval count', () => {
    expect(normalizeToMonthlyValue(100, IntervalUnit.Month, 1)).toBe(
      100
    )
    expect(normalizeToMonthlyValue(100, IntervalUnit.Month, 2)).toBe(
      50
    )
    expect(normalizeToMonthlyValue(100, IntervalUnit.Month, 3)).toBe(
      33.333333333333336
    )
    expect(normalizeToMonthlyValue(100, IntervalUnit.Month, 6)).toBe(
      16.666666666666668
    )
    expect(normalizeToMonthlyValue(100, IntervalUnit.Month, 12)).toBe(
      8.333333333333334
    )
  })

  it('should normalize yearly values to monthly', () => {
    expect(normalizeToMonthlyValue(1200, IntervalUnit.Year, 1)).toBe(
      100
    )
    expect(normalizeToMonthlyValue(2400, IntervalUnit.Year, 2)).toBe(
      100
    )
    expect(normalizeToMonthlyValue(3600, IntervalUnit.Year, 3)).toBe(
      100
    )
    expect(normalizeToMonthlyValue(600, IntervalUnit.Year, 1)).toBe(
      50
    )
  })

  it('should normalize weekly values to monthly', () => {
    // 52 weeks in a year, so 100 * 52 / 12 = 433.33...
    expect(
      normalizeToMonthlyValue(100, IntervalUnit.Week, 1)
    ).toBeCloseTo(433.33, 1)
    expect(
      normalizeToMonthlyValue(100, IntervalUnit.Week, 2)
    ).toBeCloseTo(216.67, 1)
    expect(
      normalizeToMonthlyValue(100, IntervalUnit.Week, 4)
    ).toBeCloseTo(108.33, 1)
  })

  it('should normalize daily values to monthly', () => {
    // 365 days in a year, so 10 * 365 / 12 = 304.17...
    expect(
      normalizeToMonthlyValue(10, IntervalUnit.Day, 1)
    ).toBeCloseTo(304.17, 1)
    expect(
      normalizeToMonthlyValue(10, IntervalUnit.Day, 7)
    ).toBeCloseTo(43.45, 1)
    expect(
      normalizeToMonthlyValue(10, IntervalUnit.Day, 30)
    ).toBeCloseTo(10.14, 1)
    expect(
      normalizeToMonthlyValue(10, IntervalUnit.Day, 365)
    ).toBeCloseTo(0.83, 1)
  })

  it('should throw an error for invalid interval counts', () => {
    expect(() =>
      normalizeToMonthlyValue(100, IntervalUnit.Month, 0)
    ).toThrow()
    expect(() =>
      normalizeToMonthlyValue(100, IntervalUnit.Month, -1)
    ).toThrow()
  })

  it('should throw an error for unsupported interval types', () => {
    // @ts-expect-error - Testing invalid enum value
    expect(() => normalizeToMonthlyValue(100, 'quarter', 1)).toThrow()
  })

  it('should handle extremely large intervalCount values', () => {
    const largeIntervalCount = 1000
    expect(
      normalizeToMonthlyValue(
        1200,
        IntervalUnit.Month,
        largeIntervalCount
      )
    ).toBe(1200 / largeIntervalCount)
    expect(
      normalizeToMonthlyValue(
        1200,
        IntervalUnit.Year,
        largeIntervalCount
      )
    ).toBe(1200 / (12 * largeIntervalCount))
  })
})

describe('calculateOverlapPercentage', () => {
  const createBillingPeriod = (
    startDate: Date | number,
    endDate: Date | number
  ): BillingPeriod.Record => {
    return {
      id: 'test-id',
      subscriptionId: 'test-subscription-id',
      startDate: new Date(startDate).getTime(),
      endDate: new Date(endDate).getTime(),
      status: BillingPeriodStatus.Active,
      trialPeriod: false,
      proratedPeriod: false,
      livemode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByCommit: 'test',
      updatedByCommit: 'test',
      position: 0,
      pricingModelId: 'test-pricing-model-id',
    }
  }

  it('should return 1 when billing period is entirely within month', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period is from May 5 to May 25, 2023
    const billingPeriod = createBillingPeriod(
      new Date('2023-05-05T05:00:00.000Z'),
      new Date('2023-05-25T05:00:00.000Z')
    )

    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBe(1)
  })

  it('should return 0 when billing period has no overlap with month', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period is from April 1 to April 30, 2023
    const billingPeriod = createBillingPeriod(
      new Date('2023-04-01T05:00:00.000Z'),
      new Date('2023-04-30T05:00:00.000Z')
    )

    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBe(0)
  })

  it('should return 0 when billing period is completely after month', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period is from June 1 to June 30, 2023
    const billingPeriod = createBillingPeriod(
      new Date('2023-06-02T05:00:00.000Z'),
      new Date('2023-06-30T05:00:00.000Z')
    )

    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBe(0)
  })

  it('should return partial value when billing period partially overlaps with month', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period is from April 15 to May 15, 2023 (31 days total, 15 days in May)
    const billingPeriod = createBillingPeriod(
      new Date('2023-04-15T05:00:00.000Z'),
      new Date('2023-05-15T05:00:00.000Z')
    )

    // We expect close to 0.5 (half the billing period is in May)
    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBeCloseTo(0.48, 1)
  })

  it('should handle month fully contained within billing period', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period spans April 15 to June 15 (completely contains May)
    const billingPeriod = createBillingPeriod(
      new Date('2023-04-15T05:00:00.000Z'),
      new Date('2023-06-15T05:00:00.000Z')
    )

    // Only a portion of the billing period is within the month
    const totalDays =
      differenceInDays(
        billingPeriod.endDate,
        billingPeriod.startDate
      ) + 1
    const daysInMay = differenceInDays(monthEnd, monthStart) + 1
    const expectedOverlap = daysInMay / totalDays

    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBeCloseTo(expectedOverlap, 2)
  })

  it('should return 1 when billing period exactly matches month boundaries', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period is exactly May 1 to May 31, 2023
    const billingPeriod = createBillingPeriod(
      new Date('2023-05-01T05:00:00.000Z'),
      new Date('2023-05-31T05:00:00.000Z')
    )

    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBe(1)
  })

  it('should handle overlap at start of month', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period is from April 15 to May 10, 2023
    const billingPeriod = createBillingPeriod(
      new Date('2023-04-15T05:00:00.000Z'),
      new Date('2023-05-10T05:00:00.000Z')
    )

    // Total days in billing period: 26, days in May: 10
    // Expected overlap: 10/26 ≈ 0.385
    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBeCloseTo(0.385, 2)
  })

  it('should handle overlap at end of month', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period is from May 20 to June 10, 2023
    const billingPeriod = createBillingPeriod(
      new Date('2023-05-20T05:00:00.000Z'),
      new Date('2023-06-10T05:00:00.000Z')
    )

    // Total days in billing period: 22, days in May: 12
    // Expected overlap: 12/22 ≈ 0.545
    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBeCloseTo(0.545, 2)
  })

  it('should handle single day overlap at month boundary', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period is from April 29 to May 1, 2023 (3 days total, 1 day in May)
    const billingPeriod = createBillingPeriod(
      new Date('2023-04-29T05:00:00.000Z'),
      new Date('2023-05-01T05:00:00.000Z')
    )

    // Expected overlap: 1/3 = 0.333
    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBeCloseTo(0.333, 2)
  })

  it('should handle same start date as month end', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period starts on May 31 and ends on June 15
    const billingPeriod = createBillingPeriod(
      new Date('2023-05-31T05:00:00.000Z'),
      new Date('2023-06-15T05:00:00.000Z')
    )

    // Total days in billing period: 16, days in May: 1
    // Expected overlap: 1/16 = 0.0625
    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBeCloseTo(0.0625, 3)
  })

  it('should handle same end date as month start', () => {
    const month = new Date('2023-05-15T05:00:00.000Z')
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Billing period starts on April 15 and ends on May 1
    const billingPeriod = createBillingPeriod(
      new Date('2023-04-15T05:00:00.000Z'),
      new Date('2023-05-01T05:00:00.000Z')
    )

    // Total days in billing period: 17, days in May: 1
    // Expected overlap: 1/17 ≈ 0.0588
    expect(
      calculateOverlapPercentage(billingPeriod, monthStart, monthEnd)
    ).toBeCloseTo(0.0588, 3)
  })
})

describe('calculateBillingPeriodItemsValue', () => {
  const createBillingPeriodItem = (
    quantity: number,
    unitPrice: number
  ): BillingPeriodItem.Record => {
    return {
      id: `item-${Math.random().toString(36).substring(7)}`,
      billingPeriodId: 'bp1',
      quantity,
      unitPrice,
      name: `Test Item ${Math.random().toString(36).substring(7)}`,
      discountRedemptionId: null,
      description: 'Test description',
      livemode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByCommit: 'test',
      updatedByCommit: 'test',
      type: SubscriptionItemType.Static,
      position: 0,
      pricingModelId: 'pricing_model_test',
    }
  }

  it('should calculate the total value of billing period items', () => {
    const items: BillingPeriodItem.Record[] = [
      createBillingPeriodItem(2, 100),
      createBillingPeriodItem(1, 50),
    ]

    // 2 * 100 + 1 * 50 = 250
    expect(calculateBillingPeriodItemsValue(items)).toBe(250)
  })

  it('should return 0 for empty array', () => {
    expect(calculateBillingPeriodItemsValue([])).toBe(0)
  })

  it('should handle single item with quantity and price', () => {
    const items: BillingPeriodItem.Record[] = [
      createBillingPeriodItem(3, 75),
    ]

    // 3 * 75 = 225
    expect(calculateBillingPeriodItemsValue(items)).toBe(225)
  })

  it('should handle multiple items with varying quantities/prices', () => {
    const items: BillingPeriodItem.Record[] = [
      createBillingPeriodItem(2, 100),
      createBillingPeriodItem(5, 20),
      createBillingPeriodItem(10, 5),
    ]

    // 2 * 100 + 5 * 20 + 10 * 5 = 200 + 100 + 50 = 350
    expect(calculateBillingPeriodItemsValue(items)).toBe(350)
  })

  it('should handle zero quantity item contributes nothing', () => {
    const items: BillingPeriodItem.Record[] = [
      createBillingPeriodItem(0, 100),
      createBillingPeriodItem(5, 20),
    ]

    // 0 * 100 + 5 * 20 = 0 + 100 = 100
    expect(calculateBillingPeriodItemsValue(items)).toBe(100)
  })

  it('should handle zero price item contributes nothing', () => {
    const items: BillingPeriodItem.Record[] = [
      createBillingPeriodItem(10, 0),
      createBillingPeriodItem(2, 50),
    ]

    // 10 * 0 + 2 * 50 = 0 + 100 = 100
    expect(calculateBillingPeriodItemsValue(items)).toBe(100)
  })
})

describe('getBillingPeriodsForDateRange', () => {
  it('should return empty array if no billing periods found', async () => {
    const { organization } = await setupOrg()

    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return getBillingPeriodsForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result).toEqual([])
  })

  it('should correctly map and return billing periods with associated items and subscription data', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    // Create a subscription
    const subscription = await adminTransaction(
      async ({ transaction }) => {
        return setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          interval: IntervalUnit.Month,
          intervalCount: 1,
          status: SubscriptionStatus.Active,
        })
      }
    )

    // Create a billing period
    const billingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date('2023-06-01T05:00:00.000Z'),
          endDate: new Date('2023-06-30T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 2,
        unitPrice: 100,
        name: 'Test Item 1',
      })

      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 50,
        name: 'Test Item 2',
      })
    })

    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return getBillingPeriodsForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result.length).toBe(1)
    expect(result[0].billingPeriod.id).toBe(billingPeriod.id)
    expect(result[0].subscription.id).toBe(subscription.id)
    expect(result[0].billingPeriodItems.length).toBe(2)

    // Verify the total value is correct (2 * 100 + 1 * 50 = 250)
    const totalValue = calculateBillingPeriodItemsValue(
      result[0].billingPeriodItems
    )
    expect(totalValue).toBe(250)
  })
})

describe('calculateMRRByMonth', () => {
  it('should generate array of months between startDate and endDate', async () => {
    const { organization } = await setupOrg()

    const startDate = new Date('2023-01-15T05:00:00.000Z')
    const endDate = new Date('2023-03-15T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months: Jan, Feb, Mar 2023
    expect(result.length).toBe(3)
    expect(result[0].month).toEqual(
      startOfMonth(new Date('2023-01-01T05:00:00.000Z'))
    )
    expect(result[1].month).toEqual(
      startOfMonth(new Date('2023-02-01T05:00:00.000Z'))
    )
    expect(result[2].month).toEqual(
      startOfMonth(new Date('2023-03-01T05:00:00.000Z'))
    )
  })

  it('should return zero MRR when no billing periods exist', async () => {
    const { organization } = await setupOrg()

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    expect(result.length).toBe(1)
    expect(result[0].amount).toBe(0)
  })

  it('should correctly calculate MRR for a single monthly subscription fully within one month', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create a subscription
    const subscription = await adminTransaction(
      async ({ transaction }) => {
        return setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          interval: IntervalUnit.Month,
          intervalCount: 1,
          status: SubscriptionStatus.Active,
        })
      }
    )

    // Create a billing period
    const billingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate,
          endDate,
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item',
      })
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    expect(result.length).toBe(1)
    expect(result[0].amount).toBe(100) // $100 MRR for the month
  })

  it('should correctly calculate MRR for a yearly subscription spanning multiple months', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription with yearly interval
    const subscription = await adminTransaction(
      async ({ transaction }) => {
        return setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          interval: IntervalUnit.Year,
          intervalCount: 1,
          status: SubscriptionStatus.Active,
        })
      }
    )

    // Create a billing period
    const billingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate,
          endDate: addYears(startDate, 1),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 1200,
        name: 'Test Item',
      })
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 3 months of data
    expect(result.length).toBe(3)

    // Each month should have $100 MRR ($1200/12)
    result.forEach((month) => {
      expect(month.amount).toBe(100)
    })
  })

  it('should correctly handle prorated subscription spanning two months', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-15T05:00:00.000Z') // Mid-January
    const endDate = new Date('2023-02-15T05:00:00.000Z') // Mid-February

    // Create a subscription
    const subscription = await adminTransaction(
      async ({ transaction }) => {
        return setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          interval: IntervalUnit.Month,
          intervalCount: 1,
          status: SubscriptionStatus.Active,
        })
      }
    )

    // Create a billing period
    const billingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate,
          endDate,
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item',
      })
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate: new Date('2023-01-01T05:00:00.000Z'),
          endDate: new Date('2023-02-28T05:00:00.000Z'),
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    // Should have 2 months of data
    expect(result.length).toBe(2)

    // The amounts should be prorated based on the days in each month
    // Jan: ~17 days / 32 total days ≈ 0.53 * $100 = $53
    // Feb: ~15 days / 32 total days ≈ 0.47 * $100 = $47
    expect(result[0].amount).toBeGreaterThan(45)
    expect(result[0].amount).toBeLessThan(55)

    expect(result[1].amount).toBeGreaterThan(40)
    expect(result[1].amount).toBeLessThan(50)

    // The total should still be $100
    expect(result[0].amount + result[1].amount).toBeCloseTo(100, 1)
  })

  it('should handle multiple subscriptions with different intervals', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')
    // Create a monthly subscription
    const monthlySubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    // Create a billing period for monthly subscription
    const monthlyBillingPeriod = await setupBillingPeriod({
      subscriptionId: monthlySubscription.id,
      startDate,
      endDate,
      status: BillingPeriodStatus.Active,
    })

    // Create billing period items for monthly subscription
    await setupBillingPeriodItem({
      billingPeriodId: monthlyBillingPeriod.id,
      quantity: 1,
      unitPrice: 100,
      name: 'Monthly Item',
    })

    // Create a yearly subscription
    const yearlySubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Year,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    // Create a billing period for yearly subscription
    const yearlyBillingPeriod = await setupBillingPeriod({
      subscriptionId: yearlySubscription.id,
      startDate,
      endDate: addYears(startDate, 1),
      status: BillingPeriodStatus.Active,
    })

    // Create billing period items for yearly subscription
    await setupBillingPeriodItem({
      billingPeriodId: yearlyBillingPeriod.id,
      quantity: 1,
      unitPrice: 1200,
      name: 'Yearly Item',
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    expect(result.length).toBe(1)
    // $100 from monthly + $100 from yearly ($1200/12) = $200 MRR
    expect(result[0].amount).toBe(200)
  })

  const setupSubscriptionsAndBillingPeriods = async (
    organization: { id: string },
    price: { id: string },
    customer: { id: string },
    paymentMethod: { id: string },
    startDate: Date,
    endDate: Date,
    transaction: DbTransaction
  ) => {
    // Create monthly subscription and billing period
    const monthlySubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    const monthlyBillingPeriod = await setupBillingPeriod({
      subscriptionId: monthlySubscription.id,
      startDate,
      endDate: endDate,
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: monthlyBillingPeriod.id,
      quantity: 1,
      unitPrice: 100,
      name: 'Monthly Item',
    })

    // Create yearly subscription and billing period
    const yearlySubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Year,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    const yearlyBillingPeriod = await setupBillingPeriod({
      subscriptionId: yearlySubscription.id,
      startDate,
      endDate: addYears(startDate, 1),
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: yearlyBillingPeriod.id,
      quantity: 1,
      unitPrice: 1200,
      name: 'Yearly Item',
    })

    // Create weekly subscription and billing period
    const weeklySubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Week,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    const weeklyBillingPeriod = await setupBillingPeriod({
      subscriptionId: weeklySubscription.id,
      startDate,
      endDate: addDays(startDate, 7),
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: weeklyBillingPeriod.id,
      quantity: 1,
      unitPrice: 25,
      name: 'Weekly Item',
    })

    // Create daily subscription and billing period
    const dailySubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Day,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    const dailyBillingPeriod = await setupBillingPeriod({
      subscriptionId: dailySubscription.id,
      startDate,
      endDate: addDays(startDate, 1),
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: dailyBillingPeriod.id,
      quantity: 1,
      unitPrice: 1,
      name: 'Daily Item',
    })
    return {
      monthlySubscription,
      monthlyBillingPeriod,
      yearlySubscription,
      yearlyBillingPeriod,
      weeklySubscription,
      weeklyBillingPeriod,
      dailySubscription,
      dailyBillingPeriod,
    }
  }

  it('should handle mixed interval types (month/year/week/day)', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      await setupSubscriptionsAndBillingPeriods(
        organization,
        price,
        customer,
        paymentMethod,
        startDate,
        endDate,
        transaction
      )
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    expect(result.length).toBe(1)
    // Expected MRR:
    // $100 (monthly) + $100 (yearly) + ~$108.33 (weekly) + ~$30.42 (daily) ≈ $338.75
    expect(result[0].amount).toBeCloseTo(338.75, 1)
  })
})

describe('Edge Cases and Error Handling', () => {
  it('should handle leap day (February 29) in billing periods', () => {
    // Create a billing period that includes a leap day
    const leapYearBillingPeriod: BillingPeriod.Record = {
      id: 'leap-bp',
      subscriptionId: 'sub-1',
      startDate: new Date('2024-02-01T05:00:00.000Z').getTime(),
      endDate: new Date('2024-02-29T05:00:00.000Z').getTime(),
      status: BillingPeriodStatus.Active,
      trialPeriod: false,
      proratedPeriod: false,
      livemode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByCommit: 'test',
      updatedByCommit: 'test',
      position: 0,
      pricingModelId: 'test-pricing-model-id',
    }

    const feb2024 = new Date('2024-02-15T05:00:00.000Z')
    const feb2024Start = startOfMonth(feb2024)
    const feb2024End = endOfMonth(feb2024)

    // Billing period fully contained in the month
    expect(
      calculateOverlapPercentage(
        leapYearBillingPeriod,
        feb2024Start,
        feb2024End
      )
    ).toBe(1)

    // Now create a billing period from Jan 15 to Feb 15
    const spanningLeapMonthBillingPeriod: BillingPeriod.Record = {
      id: 'spanning-leap-bp',
      subscriptionId: 'sub-1',
      startDate: new Date('2024-01-15T05:00:00.000Z').getTime(),
      endDate: new Date('2024-02-15T05:00:00.000Z').getTime(),
      status: BillingPeriodStatus.Active,
      trialPeriod: false,
      proratedPeriod: false,
      livemode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByCommit: 'test',
      updatedByCommit: 'test',
      position: 0,
      pricingModelId: 'test-pricing-model-id',
    }

    // Calculate overlap with February
    const overlapPercentage = calculateOverlapPercentage(
      spanningLeapMonthBillingPeriod,
      feb2024Start,
      feb2024End
    )

    // Expected overlap: 15 days in Feb / 32 total days ≈ 0.47
    expect(overlapPercentage).toBeCloseTo(0.47, 2)
  })

  it('should handle extremely large intervalCount values in normalization', () => {
    // Monthly interval with extremely large count
    expect(
      normalizeToMonthlyValue(1200, IntervalUnit.Month, 1000)
    ).toBe(1.2)

    // Yearly interval with extremely large count
    expect(
      normalizeToMonthlyValue(1200, IntervalUnit.Year, 100)
    ).toBe(1)
  })

  it('should handle billing periods spanning multiple years', () => {
    const multiYearBillingPeriod: BillingPeriod.Record = {
      id: 'multi-year-bp',
      subscriptionId: 'sub-1',
      startDate: new Date('2023-01-01T05:00:00.000Z').getTime(),
      endDate: new Date('2025-12-31T05:00:00.000Z').getTime(),
      status: BillingPeriodStatus.Active,
      trialPeriod: false,
      proratedPeriod: false,
      livemode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByCommit: 'test',
      updatedByCommit: 'test',
      position: 0,
      pricingModelId: 'test-pricing-model-id',
    }

    // Calculate overlap with January 2024
    const jan2024 = new Date('2024-01-15T05:00:00.000Z')
    const jan2024Start = startOfMonth(jan2024)
    const jan2024End = endOfMonth(jan2024)

    const overlapPercentage = calculateOverlapPercentage(
      multiYearBillingPeriod,
      jan2024Start,
      jan2024End
    )

    // Expected overlap: 31 days in Jan 2024 / (3 years * 365 days) ≈ 0.0283
    expect(overlapPercentage).toBeCloseTo(0.0283, 3)
  })
})

describe('calculateMRRByMonth with productId filter', () => {
  it('should return MRR for all products when productId is null', async () => {
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create a subscription with billing period
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    const billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate,
      endDate,
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: 100,
      name: 'Test Item',
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
          productId: undefined, // No filter
        },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100)
  })

  it('should return MRR only for the specified product when productId is provided', async () => {
    const {
      organization,
      product: productA,
      price: priceA,
      pricingModel,
    } = await setupOrg()

    // Create a second product with its own price
    const productB = await setupProduct({
      organizationId: organization.id,
      name: 'Product B',
      pricingModelId: pricingModel.id,
    })
    const priceB = await setupPrice({
      productId: productB.id,
      name: 'Product B Price',
      unitPrice: 200,
      livemode: true,
      isDefault: true,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create subscription for Product A ($100/month)
    const subscriptionA = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: priceA.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    // Create subscription item to link subscription to product via price
    await setupSubscriptionItem({
      subscriptionId: subscriptionA.id,
      name: 'Product A Subscription Item',
      quantity: 1,
      unitPrice: 100,
      priceId: priceA.id,
    })

    const billingPeriodA = await setupBillingPeriod({
      subscriptionId: subscriptionA.id,
      startDate,
      endDate,
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: billingPeriodA.id,
      quantity: 1,
      unitPrice: 100,
      name: 'Product A Item',
    })

    // Create subscription for Product B ($200/month)
    const subscriptionB = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: priceB.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    // Create subscription item to link subscription to product via price
    await setupSubscriptionItem({
      subscriptionId: subscriptionB.id,
      name: 'Product B Subscription Item',
      quantity: 1,
      unitPrice: 200,
      priceId: priceB.id,
    })

    const billingPeriodB = await setupBillingPeriod({
      subscriptionId: subscriptionB.id,
      startDate,
      endDate,
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: billingPeriodB.id,
      quantity: 1,
      unitPrice: 200,
      name: 'Product B Item',
    })

    // Query for Product A only
    const resultA = await adminTransaction(
      async ({ transaction }) => {
        return calculateMRRByMonth(
          organization.id,
          {
            startDate,
            endDate,
            granularity: RevenueChartIntervalUnit.Month,
            productId: productA.id,
          },
          transaction
        )
      }
    )

    expect(resultA).toHaveLength(1)
    expect(resultA[0].amount).toBe(100)

    // Query for Product B only
    const resultB = await adminTransaction(
      async ({ transaction }) => {
        return calculateMRRByMonth(
          organization.id,
          {
            startDate,
            endDate,
            granularity: RevenueChartIntervalUnit.Month,
            productId: productB.id,
          },
          transaction
        )
      }
    )

    expect(resultB).toHaveLength(1)
    expect(resultB[0].amount).toBe(200)

    // Query for all products (no filter)
    const resultAll = await adminTransaction(
      async ({ transaction }) => {
        return calculateMRRByMonth(
          organization.id,
          {
            startDate,
            endDate,
            granularity: RevenueChartIntervalUnit.Month,
          },
          transaction
        )
      }
    )

    expect(resultAll).toHaveLength(1)
    expect(resultAll[0].amount).toBe(300) // $100 + $200
  })

  it('should return zero MRR when product has no billing periods', async () => {
    const {
      organization,
      product: productA,
      price: priceA,
      pricingModel,
    } = await setupOrg()

    // Create a second product with no subscriptions
    const productB = await setupProduct({
      organizationId: organization.id,
      name: 'Product B - No Subscriptions',
      pricingModelId: pricingModel.id,
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create subscription for Product A only
    const subscriptionA = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: priceA.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    const billingPeriodA = await setupBillingPeriod({
      subscriptionId: subscriptionA.id,
      startDate,
      endDate,
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: billingPeriodA.id,
      quantity: 1,
      unitPrice: 100,
      name: 'Product A Item',
    })

    // Query for Product B (which has no subscriptions)
    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
          productId: productB.id,
        },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(0)
  })

  it('should return zero MRR when productId does not exist', async () => {
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create a subscription with billing period
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    const billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate,
      endDate,
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: 100,
      name: 'Test Item',
    })

    // Query with non-existent productId
    const result = await adminTransaction(async ({ transaction }) => {
      return calculateMRRByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
          productId: 'non_existent_product_id',
        },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(0)
  })
})
