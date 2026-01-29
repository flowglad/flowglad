import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  addMonths,
  endOfMonth,
  startOfMonth,
  subMonths,
} from 'date-fns'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  IntervalUnit,
  PriceType,
  RevenueChartIntervalUnit,
  SubscriptionStatus,
} from '@/types'
import {
  calculateActiveSubscribersByMonth,
  calculateSubscriberBreakdown,
  getCurrentActiveSubscribers,
} from './subscriberCalculationHelpers'

describe('calculateActiveSubscribersByMonth', () => {
  it('should return zero counts when there are no subscriptions', async () => {
    const { organization } = (await setupOrg()).unwrap()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(3)
    expect(result[0].count).toBe(0)
    expect(result[0].month.toISOString().split('T')[0]).toBe(
      '2023-01-01'
    )
    expect(result[1].count).toBe(0)
    expect(result[1].month.toISOString().split('T')[0]).toBe(
      '2023-02-01'
    )
    expect(result[2].count).toBe(0)
    expect(result[2].month.toISOString().split('T')[0]).toBe(
      '2023-03-01'
    )
  })

  it('should correctly count a single active subscription spanning the entire period', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that spans the entire period
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(3)
    expect(result[0].count).toBe(1)
    expect(result[0].month.toISOString().split('T')[0]).toBe(
      '2023-01-01'
    )
    expect(result[1].count).toBe(1)
    expect(result[1].month.toISOString().split('T')[0]).toBe(
      '2023-02-01'
    )
    expect(result[2].count).toBe(1)
    expect(result[2].month.toISOString().split('T')[0]).toBe(
      '2023-03-01'
    )
  })

  it('should correctly count multiple subscriptions starting and ending on different dates', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create three subscriptions with different lifecycles
    // Subscription 1: Active throughout
    const customer1 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm1 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer1.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    // Subscription 2: Starts in February
    const customer2 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm2 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer2.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    // Subscription 3: Canceled in February
    const customer3 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm3 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer3.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer3.id,
      defaultPaymentMethodId: pm3.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-10T05:00:00.000Z').getTime(),
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(3)
    expect(result[0].count).toBe(2) // Subscriptions 1 and 3
    expect(result[0].month.toISOString().split('T')[0]).toBe(
      '2023-01-01'
    )
    expect(result[1].count).toBe(3) // All three subscriptions
    expect(result[1].month.toISOString().split('T')[0]).toBe(
      '2023-02-01'
    )
    expect(result[2].count).toBe(2) // Subscriptions 1 and 2
    expect(result[2].month.toISOString().split('T')[0]).toBe(
      '2023-03-01'
    )
  })

  it('should return zero counts for an organization with no subscriptions', async () => {
    const { organization } = (await setupOrg()).unwrap()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(3)
    result.forEach((month) => {
      expect(month.count).toBe(0)
    })
  })

  it('should correctly count subscriptions that start before the period and end after it', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    const startDate = new Date('2023-02-01T05:00:00.000Z')
    const endDate = new Date('2023-02-28T05:00:00.000Z')

    // Create a subscription that starts before and ends after the period
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-01-15T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(1)
    expect(result[0].month.toISOString().split('T')[0]).toBe(
      '2023-02-01'
    )
  })

  it('should correctly count subscriptions that start during the period and remain active', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that starts in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(3)
    expect(result[0].count).toBe(0)
    expect(result[0].month.toISOString().split('T')[0]).toBe(
      '2023-01-01'
    )
    expect(result[1].count).toBe(1)
    expect(result[1].month.toISOString().split('T')[0]).toBe(
      '2023-02-01'
    )
    expect(result[2].count).toBe(1)
    expect(result[2].month.toISOString().split('T')[0]).toBe(
      '2023-03-01'
    )
  })

  it('should correctly count subscriptions that started before the period and ended during it', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that ends in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-15T05:00:00.000Z').getTime(),
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(3)
    expect(result[0].count).toBe(1)
    expect(result[0].month.toISOString().split('T')[0]).toBe(
      '2023-01-01'
    )
    expect(result[1].count).toBe(1)
    expect(result[1].month.toISOString().split('T')[0]).toBe(
      '2023-02-01'
    )
    expect(result[2].count).toBe(0)
    expect(result[2].month.toISOString().split('T')[0]).toBe(
      '2023-03-01'
    )
  })

  it('should handle edge cases like subscriptions starting/ending exactly on month boundaries', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Subscription starting on the first day of a month
    const customer1 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm1 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer1.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2023-02-01T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    // Subscription ending on the last day of a month
    const customer2 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm2 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer2.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2023-01-01T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-28T23:59:59.999Z').getTime(),
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(3)
    expect(result[0].count).toBe(1) // Only subscription 2
    expect(result[0].month.toISOString().split('T')[0]).toBe(
      '2023-01-01'
    )
    expect(result[1].count).toBe(2) // Both subscriptions
    expect(result[1].month.toISOString().split('T')[0]).toBe(
      '2023-02-01'
    )
    expect(result[2].count).toBe(1) // Only subscription 1
    expect(result[2].month.toISOString().split('T')[0]).toBe(
      '2023-03-01'
    )
  })
})

describe('calculateSubscriberBreakdown', () => {
  it('should handle no subscriber changes between months', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that is active in both months
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(0)
  })

  it('should handle only new subscribers in the current month', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that started in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(1)
  })

  it('should handle only churned subscribers in the current month', async () => {
    const { organization, product, price } = (
      await setupOrg()
    ).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that was active in January but canceled in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-15T05:00:00.000Z').getTime(),
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(-1)
  })

  it('should handle both new and churned subscribers', async () => {
    const { organization, product, price } = (
      await setupOrg()
    ).unwrap()
    const customer1 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm1 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer1.id,
      })
    ).unwrap()
    const customer2 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm2 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer2.id,
      })
    ).unwrap()

    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that started in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    // Create a subscription that was active in January but canceled in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-15T05:00:00.000Z').getTime(),
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(0)
  })

  it('should handle equal numbers of new and churned subscribers (zero net change)', async () => {
    const { organization, product, price } = (
      await setupOrg()
    ).unwrap()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create two new subscriptions that started in February
    for (let i = 1; i <= 2; i++) {
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        startDate: new Date(
          `2023-02-${10 + i * 5}T05:00:00.000Z`
        ).getTime(),
        canceledAt: null,
      })
    }

    // Create two subscriptions that were active in January but canceled in February
    for (let i = 1; i <= 2; i++) {
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
        canceledAt: new Date(
          `2023-02-${10 + i * 5}T05:00:00.000Z`
        ).getTime(),
      })
    }

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(2)
    expect(result.churned).toBe(2)
    expect(result.netChange).toBe(0)
  })

  it('should handle more new than churned subscribers (positive net change)', async () => {
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')
    const { organization, product, price } = (
      await setupOrg()
    ).unwrap()

    // Create three subscriptions that started in February
    const startDates = ['2023-02-10', '2023-02-20', '2023-02-25']
    for (const startDate of startDates) {
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        startDate: new Date(`${startDate}T05:00:00.000Z`).getTime(),
        canceledAt: null,
      })
    }

    // Create one subscription that was active in January but canceled in February
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-15T05:00:00.000Z').getTime(),
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(3)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(2)
  })

  it('should handle more churned than new subscribers (negative net change)', async () => {
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    const { organization, product, price } = (
      await setupOrg()
    ).unwrap()

    // Create one subscription that started in February
    const newCustomer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const newPm = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: newCustomer.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: newCustomer.id,
      defaultPaymentMethodId: newPm.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    // Create three subscriptions that were active in January but canceled in February
    const cancelDates = ['2023-02-10', '2023-02-20', '2023-02-25']
    for (const cancelDate of cancelDates) {
      const customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()
      const paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
        canceledAt: new Date(`${cancelDate}T05:00:00.000Z`).getTime(),
      })
    }

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(3)
    expect(result.netChange).toBe(-2)
  })

  it('should handle months that have no active subscriptions', async () => {
    const { organization } = (await setupOrg()).unwrap()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(0)
  })

  it('should handle edge cases where subscribers churn on the first/last day of the month', async () => {
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    const { organization, product, price } = (
      await setupOrg()
    ).unwrap()

    // Create a subscription that churned on the first day of February
    const customer1 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm1 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer1.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-01T05:00:00.000Z').getTime(),
    })

    // Create a subscription that churned on the last day of February
    const customer2 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm2 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer2.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2022-12-15T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-28T05:00:00.000Z').getTime(),
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateSubscriberBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(2)
    expect(result.netChange).toBe(-2)
  })
})

describe('getCurrentActiveSubscribers', () => {
  it('should return the current number of active subscribers', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    // Create an active subscription
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-01-01T05:00:00.000Z').getTime(),
      canceledAt: null,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getCurrentActiveSubscribers(
            {
              organizationId: organization.id,
              currentDate: new Date('2023-02-15T05:00:00.000Z'),
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toBe(1)
  })

  it('should return 0 when there are no active subscribers', async () => {
    const { organization } = (await setupOrg()).unwrap()

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getCurrentActiveSubscribers(
            {
              organizationId: organization.id,
              currentDate: new Date('2023-02-15T05:00:00.000Z'),
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toBe(0)
  })

  it('should count subscriptions canceled during the month as active for that month', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    // Create a subscription canceled during February - it should still count for February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-01-01T05:00:00.000Z').getTime(),
      canceledAt: new Date('2023-02-10T05:00:00.000Z').getTime(),
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getCurrentActiveSubscribers(
            {
              organizationId: organization.id,
              currentDate: new Date('2023-02-15T05:00:00.000Z'),
            },
            transaction
          )
        )
      })
    ).unwrap()

    // Subscription was active during February, so it should be counted
    expect(result).toBe(1)
  })
})

describe('calculateActiveSubscribersByMonth with productId filter', () => {
  it('should return count of all active subscribers when productId is null', async () => {
    const { organization, price } = (await setupOrg()).unwrap()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create 2 subscriptions
    const customer1 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm1 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer1.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })

    const customer2 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm2 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer2.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
              productId: undefined, // No filter
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(2)
  })

  it('should return count of subscribers with that product when productId is specified', async () => {
    const {
      organization,
      product: productA,
      price: priceA,
      pricingModel,
    } = (await setupOrg()).unwrap()

    // Create a second product with its own price
    const productB = (
      await setupProduct({
        organizationId: organization.id,
        name: 'Product B',
        pricingModelId: pricingModel.id,
      })
    ).unwrap()
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

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create 2 subscriptions for Product A
    const customerA1 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pmA1 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerA1.id,
      })
    ).unwrap()
    const subscriptionA1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customerA1.id,
      defaultPaymentMethodId: pmA1.id,
      priceId: priceA.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })
    await setupSubscriptionItem({
      subscriptionId: subscriptionA1.id,
      name: 'Product A Item',
      quantity: 1,
      unitPrice: 100,
      priceId: priceA.id,
    })

    const customerA2 = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pmA2 = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerA2.id,
      })
    ).unwrap()
    const subscriptionA2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customerA2.id,
      defaultPaymentMethodId: pmA2.id,
      priceId: priceA.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })
    await setupSubscriptionItem({
      subscriptionId: subscriptionA2.id,
      name: 'Product A Item',
      quantity: 1,
      unitPrice: 100,
      priceId: priceA.id,
    })

    // Create 1 subscription for Product B
    const customerB = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pmB = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerB.id,
      })
    ).unwrap()
    const subscriptionB = await setupSubscription({
      organizationId: organization.id,
      customerId: customerB.id,
      defaultPaymentMethodId: pmB.id,
      priceId: priceB.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })
    await setupSubscriptionItem({
      subscriptionId: subscriptionB.id,
      name: 'Product B Item',
      quantity: 1,
      unitPrice: 200,
      priceId: priceB.id,
    })

    // Query for Product A only
    const resultA = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
              productId: productA.id,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(resultA).toHaveLength(1)
    expect(resultA[0].count).toBe(2)

    // Query for Product B only
    const resultB = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
              productId: productB.id,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(resultB).toHaveLength(1)
    expect(resultB[0].count).toBe(1)

    // Query for all products (no filter)
    const resultAll = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(resultAll).toHaveLength(1)
    expect(resultAll[0].count).toBe(3) // 2 + 1
  })

  it('should return zero when no subscriptions have that product', async () => {
    const { organization, price, pricingModel } = (
      await setupOrg()
    ).unwrap()

    // Create a second product with no subscriptions
    const productB = (
      await setupProduct({
        organizationId: organization.id,
        name: 'Product B - No Subscriptions',
        pricingModelId: pricingModel.id,
      })
    ).unwrap()

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create subscription for Product A only
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: pm.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })

    // Query for Product B (which has no subscriptions)
    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
              productId: productB.id,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(0)
  })

  it('should count subscription once even if it has multiple items of same product', async () => {
    const { organization, product, price } = (
      await setupOrg()
    ).unwrap()

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create subscription with multiple subscription items for the same product
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: pm.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })

    // Add a second subscription item for the same product
    await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Additional Item',
      quantity: 1,
      unitPrice: 50,
      priceId: price.id,
    })

    // Query for this product
    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
              productId: product.id,
            },
            transaction
          )
        )
      })
    ).unwrap()

    // Should count the subscription only once, not twice
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(1)
  })

  it('should include subscription if any item matches product (multi-product subscription)', async () => {
    const {
      organization,
      product: productA,
      price: priceA,
      pricingModel,
    } = (await setupOrg()).unwrap()

    // Create a second product
    const productB = (
      await setupProduct({
        organizationId: organization.id,
        name: 'Product B',
        pricingModelId: pricingModel.id,
      })
    ).unwrap()
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

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-01-31T05:00:00.000Z')

    // Create subscription initially with Product A
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const pm = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: pm.id,
      priceId: priceA.id,
      startDate: new Date('2022-12-01T05:00:00.000Z').getTime(),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })

    // Add subscription item for Product A
    await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Product A Item',
      quantity: 1,
      unitPrice: 100,
      priceId: priceA.id,
    })

    // Add Product B to the same subscription (multi-product)
    await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Product B Item',
      quantity: 1,
      unitPrice: 200,
      priceId: priceB.id,
    })

    // Query for Product A - should find the subscription
    const resultA = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
              productId: productA.id,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(resultA).toHaveLength(1)
    expect(resultA[0].count).toBe(1)

    // Query for Product B - should also find the same subscription
    const resultB = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
              productId: productB.id,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(resultB).toHaveLength(1)
    expect(resultB[0].count).toBe(1)

    // Query for all products - should count the subscription only once
    const resultAll = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await calculateActiveSubscribersByMonth(
            organization.id,
            {
              startDate,
              endDate,
              granularity: RevenueChartIntervalUnit.Month,
            },
            transaction
          )
        )
      })
    ).unwrap()

    expect(resultAll).toHaveLength(1)
    expect(resultAll[0].count).toBe(1) // Still just 1 subscription
  })
})
