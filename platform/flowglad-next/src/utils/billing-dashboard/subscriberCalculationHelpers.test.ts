import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  IntervalUnit,
  SubscriptionStatus,
  RevenueChartIntervalUnit,
} from '@/types'

import {
  calculateActiveSubscribersByMonth,
  calculateSubscriberBreakdown,
  getCurrentActiveSubscribers,
} from './subscriberCalculationHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupProduct,
  setupPrice,
} from '@/../seedDatabase'
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from 'date-fns'

describe('calculateActiveSubscribersByMonth', () => {
  it('should return zero counts when there are no subscriptions', async () => {
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

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
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that spans the entire period
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: null,
      status: SubscriptionStatus.Active,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

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
    const { organization, price } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create three subscriptions with different lifecycles
    // Subscription 1: Active throughout
    const customer1 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm1 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer1.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: null,
    })

    // Subscription 2: Starts in February
    const customer2 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer2.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
    })

    // Subscription 3: Canceled in February
    const customer3 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm3 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer3.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer3.id,
      defaultPaymentMethodId: pm3.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-02-10T05:00:00.000Z'),
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

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
    const { organization } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    expect(result).toHaveLength(3)
    result.forEach((month) => {
      expect(month.count).toBe(0)
    })
  })

  it('should correctly count subscriptions that start before the period and end after it', async () => {
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-02-01T05:00:00.000Z')
    const endDate = new Date('2023-02-28T05:00:00.000Z')

    // Create a subscription that starts before and ends after the period
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-01-15T05:00:00.000Z'),
      canceledAt: null,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(1)
    expect(result[0].month.toISOString().split('T')[0]).toBe(
      '2023-02-01'
    )
  })

  it('should correctly count subscriptions that start during the period and remain active', async () => {
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that starts in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

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
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Create a subscription that ends in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-02-15T05:00:00.000Z'),
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

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
    const { organization, price } = await setupOrg()
    const startDate = new Date('2023-01-01T05:00:00.000Z')
    const endDate = new Date('2023-03-31T05:00:00.000Z')

    // Subscription starting on the first day of a month
    const customer1 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm1 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer1.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2023-02-01T05:00:00.000Z'),
      canceledAt: null,
    })

    // Subscription ending on the last day of a month
    const customer2 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer2.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2023-01-01T05:00:00.000Z'),
      canceledAt: new Date('2023-02-28T23:59:59.999Z'),
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateActiveSubscribersByMonth(
        organization.id,
        {
          startDate,
          endDate,
          granularity: RevenueChartIntervalUnit.Month,
        },
        transaction
      )
    })

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
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that is active in both months
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: null,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(0)
  })

  it('should handle only new subscribers in the current month', async () => {
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that started in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(1)
  })

  it('should handle only churned subscribers in the current month', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that was active in January but canceled in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-02-15T05:00:00.000Z'),
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(-1)
  })

  it('should handle both new and churned subscribers', async () => {
    const { organization, product, price } = await setupOrg()
    const customer1 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm1 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer1.id,
    })
    const customer2 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer2.id,
    })

    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create a subscription that started in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
    })

    // Create a subscription that was active in January but canceled in February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-02-15T05:00:00.000Z'),
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(0)
  })

  it('should handle equal numbers of new and churned subscribers (zero net change)', async () => {
    const { organization, product, price } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    // Create two new subscriptions that started in February
    for (let i = 1; i <= 2; i++) {
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        startDate: new Date(`2023-02-${10 + i * 5}T05:00:00.000Z`),
        canceledAt: null,
      })
    }

    // Create two subscriptions that were active in January but canceled in February
    for (let i = 1; i <= 2; i++) {
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date(`2023-02-${10 + i * 5}T05:00:00.000Z`),
      })
    }

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(2)
    expect(result.churned).toBe(2)
    expect(result.netChange).toBe(0)
  })

  it('should handle more new than churned subscribers (positive net change)', async () => {
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')
    const { organization, product, price } = await setupOrg()

    // Create three subscriptions that started in February
    const startDates = ['2023-02-10', '2023-02-20', '2023-02-25']
    for (const startDate of startDates) {
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        startDate: new Date(`${startDate}T05:00:00.000Z`),
        canceledAt: null,
      })
    }

    // Create one subscription that was active in January but canceled in February
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-02-15T05:00:00.000Z'),
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(3)
    expect(result.churned).toBe(1)
    expect(result.netChange).toBe(2)
  })

  it('should handle more churned than new subscribers (negative net change)', async () => {
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    const { organization, product, price } = await setupOrg()

    // Create one subscription that started in February
    const newCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const newPm = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: newCustomer.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: newCustomer.id,
      defaultPaymentMethodId: newPm.id,
      priceId: price.id,
      startDate: new Date('2023-02-15T05:00:00.000Z'),
      canceledAt: null,
    })

    // Create three subscriptions that were active in January but canceled in February
    const cancelDates = ['2023-02-10', '2023-02-20', '2023-02-25']
    for (const cancelDate of cancelDates) {
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        defaultPaymentMethodId: paymentMethod.id,
        priceId: price.id,
        startDate: new Date('2022-12-01T05:00:00.000Z'),
        canceledAt: new Date(`${cancelDate}T05:00:00.000Z`),
      })
    }

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(1)
    expect(result.churned).toBe(3)
    expect(result.netChange).toBe(-2)
  })

  it('should handle months that have no active subscriptions', async () => {
    const { organization } = await setupOrg()
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(0)
    expect(result.netChange).toBe(0)
  })

  it('should handle edge cases where subscribers churn on the first/last day of the month', async () => {
    const currentMonth = new Date('2023-02-01T05:00:00.000Z')
    const previousMonth = new Date('2023-01-01T05:00:00.000Z')

    const { organization, product, price } = await setupOrg()

    // Create a subscription that churned on the first day of February
    const customer1 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm1 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer1.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      defaultPaymentMethodId: pm1.id,
      priceId: price.id,
      startDate: new Date('2022-12-01T05:00:00.000Z'),
      canceledAt: new Date('2023-02-01T05:00:00.000Z'),
    })

    // Create a subscription that churned on the last day of February
    const customer2 = await setupCustomer({
      organizationId: organization.id,
    })
    const pm2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer2.id,
    })
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      defaultPaymentMethodId: pm2.id,
      priceId: price.id,
      startDate: new Date('2022-12-15T05:00:00.000Z'),
      canceledAt: new Date('2023-02-28T05:00:00.000Z'),
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return calculateSubscriberBreakdown(
        organization.id,
        currentMonth,
        previousMonth,
        transaction
      )
    })

    expect(result.newSubscribers).toBe(0)
    expect(result.churned).toBe(2)
    expect(result.netChange).toBe(-2)
  })
})

describe('getCurrentActiveSubscribers', () => {
  it('should return the current number of active subscribers', async () => {
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    // Create an active subscription
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-01-01T05:00:00.000Z'),
      canceledAt: null,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return getCurrentActiveSubscribers(
        {
          organizationId: organization.id,
          currentDate: new Date('2023-02-15T05:00:00.000Z'),
        },
        transaction
      )
    })

    expect(result).toBe(1)
  })

  it('should return 0 when there are no active subscribers', async () => {
    const { organization } = await setupOrg()

    const result = await adminTransaction(async ({ transaction }) => {
      return getCurrentActiveSubscribers(
        {
          organizationId: organization.id,
          currentDate: new Date('2023-02-15T05:00:00.000Z'),
        },
        transaction
      )
    })

    expect(result).toBe(0)
  })

  it('should count subscriptions canceled during the month as active for that month', async () => {
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    // Create a subscription canceled during February - it should still count for February
    await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      defaultPaymentMethodId: paymentMethod.id,
      priceId: price.id,
      startDate: new Date('2023-01-01T05:00:00.000Z'),
      canceledAt: new Date('2023-02-10T05:00:00.000Z'),
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return getCurrentActiveSubscribers(
        {
          organizationId: organization.id,
          currentDate: new Date('2023-02-15T05:00:00.000Z'),
        },
        transaction
      )
    })

    // Subscription was active during February, so it should be counted
    expect(result).toBe(1)
  })
})
