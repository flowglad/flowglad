import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { DbTransaction } from '@/db/types'
import { selectBillingPeriodsWithItemsAndSubscriptionForDateRange } from './billingPeriodItemMethods'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupBillingPeriod,
  setupBillingPeriodItems,
} from '../../../seedDatabase'
import {
  IntervalUnit,
  SubscriptionStatus,
  BillingPeriodStatus,
} from '@/types'
import { addDays, addMonths, subMonths } from 'date-fns'

describe('selectBillingPeriodsWithItemsAndSubscriptionForDateRange', () => {
  it('should return empty array if no billing periods found', async () => {
    const { organization } = await setupOrg()

    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result).toEqual([])
  })

  it('should correctly retrieve billing periods that overlap with the date range', async () => {
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

    // Create a billing period that overlaps with our test date range
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
      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 2,
        unitPrice: 100,
        name: 'Test Item 1',
      })

      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 50,
        name: 'Test Item 2',
      })
    })

    // Test date range that overlaps with the billing period
    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
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

    // Verify the items are correctly associated
    expect(result[0].billingPeriodItems[0].name).toBe('Test Item 1')
    expect(result[0].billingPeriodItems[0].quantity).toBe(2)
    expect(result[0].billingPeriodItems[0].unitPrice).toBe(100)

    expect(result[0].billingPeriodItems[1].name).toBe('Test Item 2')
    expect(result[0].billingPeriodItems[1].quantity).toBe(1)
    expect(result[0].billingPeriodItems[1].unitPrice).toBe(50)
  })

  it('should not return billing periods that do not overlap with the date range', async () => {
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

    // Create a billing period that does NOT overlap with our test date range
    const billingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date('2023-07-01T05:00:00.000Z'),
          endDate: new Date('2023-07-31T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item',
      })
    })

    // Test date range that does NOT overlap with the billing period
    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result).toEqual([])
  })

  it('should handle billing periods that partially overlap with the date range', async () => {
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

    // Create a billing period that partially overlaps with our test date range
    const billingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date('2023-05-15T05:00:00.000Z'),
          endDate: new Date('2023-06-15T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item',
      })
    })

    // Test date range that partially overlaps with the billing period
    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result.length).toBe(1)
    expect(result[0].billingPeriod.id).toBe(billingPeriod.id)
    expect(result[0].subscription.id).toBe(subscription.id)
    expect(result[0].billingPeriodItems.length).toBe(1)
  })

  it('should handle billing periods that completely contain the date range', async () => {
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

    // Create a billing period that completely contains our test date range
    const billingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date('2023-05-01T05:00:00.000Z'),
          endDate: new Date('2023-07-31T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item',
      })
    })

    // Test date range that is completely contained within the billing period
    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result.length).toBe(1)
    expect(result[0].billingPeriod.id).toBe(billingPeriod.id)
    expect(result[0].subscription.id).toBe(subscription.id)
    expect(result[0].billingPeriodItems.length).toBe(1)
  })

  it('should handle multiple billing periods that overlap with the date range', async () => {
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

    // Create multiple billing periods that overlap with our test date range
    const billingPeriod1 = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date('2023-05-15T05:00:00.000Z'),
          endDate: new Date('2023-06-15T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    const billingPeriod2 = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date('2023-06-15T05:00:00.000Z'),
          endDate: new Date('2023-07-15T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod1.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item 1',
      })

      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod2.id,
        quantity: 2,
        unitPrice: 50,
        name: 'Test Item 2',
      })
    })

    // Test date range that overlaps with both billing periods
    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result.length).toBe(2)
    // Verify the second billing period
    expect(result[0].billingPeriod.id).toBe(billingPeriod2.id)
    expect(result[0].subscription.id).toBe(subscription.id)
    expect(result[0].billingPeriodItems.length).toBe(1)
    expect(result[0].billingPeriodItems[0].name).toBe('Test Item 2')

    // Verify the first billing period
    expect(result[1].billingPeriod.id).toBe(billingPeriod1.id)
    expect(result[1].subscription.id).toBe(subscription.id)
    expect(result[1].billingPeriodItems.length).toBe(1)
    expect(result[1].billingPeriodItems[0].name).toBe('Test Item 1')
  })

  it('should handle billing periods with multiple items', async () => {
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

    // Create multiple billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item 1',
      })

      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 2,
        unitPrice: 50,
        name: 'Test Item 2',
      })

      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 3,
        unitPrice: 25,
        name: 'Test Item 3',
      })
    })

    // Test date range
    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result.length).toBe(1)
    expect(result[0].billingPeriod.id).toBe(billingPeriod.id)
    expect(result[0].subscription.id).toBe(subscription.id)
    expect(result[0].billingPeriodItems.length).toBe(3)

    // Verify all items are correctly associated
    expect(result[0].billingPeriodItems[0].name).toBe('Test Item 1')
    expect(result[0].billingPeriodItems[0].quantity).toBe(1)
    expect(result[0].billingPeriodItems[0].unitPrice).toBe(100)

    expect(result[0].billingPeriodItems[1].name).toBe('Test Item 2')
    expect(result[0].billingPeriodItems[1].quantity).toBe(2)
    expect(result[0].billingPeriodItems[1].unitPrice).toBe(50)

    expect(result[0].billingPeriodItems[2].name).toBe('Test Item 3')
    expect(result[0].billingPeriodItems[2].quantity).toBe(3)
    expect(result[0].billingPeriodItems[2].unitPrice).toBe(25)
  })

  it('should handle billing periods with different subscription intervals', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    // Create a monthly subscription
    const monthlySubscription = await adminTransaction(
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

    // Create a yearly subscription
    const yearlySubscription = await adminTransaction(
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

    // Create billing periods for both subscriptions
    const monthlyBillingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: monthlySubscription.id,
          startDate: new Date('2023-06-01T05:00:00.000Z'),
          endDate: new Date('2023-06-30T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    const yearlyBillingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: yearlySubscription.id,
          startDate: new Date('2023-01-01T05:00:00.000Z'),
          endDate: new Date('2023-12-31T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItems({
        billingPeriodId: monthlyBillingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Monthly Item',
      })

      await setupBillingPeriodItems({
        billingPeriodId: yearlyBillingPeriod.id,
        quantity: 1,
        unitPrice: 1200,
        name: 'Yearly Item',
      })
    })

    // Test date range
    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    expect(result.length).toBe(2)

    // Verify the monthly billing period
    expect(result[0].billingPeriod.id).toBe(monthlyBillingPeriod.id)
    expect(result[0].subscription.id).toBe(monthlySubscription.id)
    expect(result[0].billingPeriodItems.length).toBe(1)
    expect(result[0].billingPeriodItems[0].name).toBe('Monthly Item')

    // Verify the yearly billing period
    expect(result[1].billingPeriod.id).toBe(yearlyBillingPeriod.id)
    expect(result[1].subscription.id).toBe(yearlySubscription.id)
    expect(result[1].billingPeriodItems.length).toBe(1)
    expect(result[1].billingPeriodItems[0].name).toBe('Yearly Item')
  })

  it('should handle billing periods with different statuses', async () => {
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

    // Create billing periods with different statuses
    const activeBillingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date('2023-06-01T05:00:00.000Z'),
          endDate: new Date('2023-06-30T05:00:00.000Z'),
          status: BillingPeriodStatus.Active,
        })
      }
    )

    const canceledBillingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date('2023-06-15T05:00:00.000Z'),
          endDate: new Date('2023-07-15T05:00:00.000Z'),
          status: BillingPeriodStatus.Canceled,
        })
      }
    )

    // Create billing period items
    await adminTransaction(async ({ transaction }) => {
      await setupBillingPeriodItems({
        billingPeriodId: activeBillingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Active Item',
      })

      await setupBillingPeriodItems({
        billingPeriodId: canceledBillingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Canceled Item',
      })
    })

    // Test date range
    const startDate = new Date('2023-06-01T05:00:00.000Z')
    const endDate = new Date('2023-06-30T05:00:00.000Z')

    const result = await adminTransaction(async ({ transaction }) => {
      return selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
        organization.id,
        startDate,
        endDate,
        transaction
      )
    })

    // Both billing periods should be returned regardless of status
    expect(result.length).toBe(2)
    // Verify the active billing period
    expect(result[1].billingPeriod.id).toBe(activeBillingPeriod.id)
    expect(result[1].billingPeriod.status).toBe(
      BillingPeriodStatus.Active
    )
    expect(result[1].billingPeriodItems[0].name).toBe('Active Item')

    // Verify the canceled billing period
    expect(result[0].billingPeriod.id).toBe(canceledBillingPeriod.id)
    expect(result[0].billingPeriod.status).toBe(
      BillingPeriodStatus.Canceled
    )
    expect(result[0].billingPeriodItems[0].name).toBe('Canceled Item')
  })
})
