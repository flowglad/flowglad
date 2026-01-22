import { beforeEach, describe, expect, it } from 'bun:test'
import { addDays, addMonths, subMonths } from 'date-fns'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { DbTransaction } from '@/db/types'
import {
  BillingPeriodStatus,
  CurrencyCode,
  IntervalUnit,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import type { BillingPeriod } from '../schema/billingPeriods'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { SubscriptionItem } from '../schema/subscriptionItems'
import type { Subscription } from '../schema/subscriptions'
import {
  bulkInsertBillingPeriodItems,
  insertBillingPeriodItem,
  selectBillingPeriodsWithItemsAndSubscriptionForDateRange,
} from './billingPeriodItemMethods'

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

    // Sort items by name to ensure deterministic ordering for assertions
    const sortedItems = [...result[0].billingPeriodItems].sort(
      (a, b) => a.name.localeCompare(b.name)
    )

    // Verify the items are correctly associated
    expect(sortedItems[0].name).toBe('Test Item 1')
    expect(sortedItems[0].quantity).toBe(2)
    expect(sortedItems[0].unitPrice).toBe(100)

    expect(sortedItems[1].name).toBe('Test Item 2')
    expect(sortedItems[1].quantity).toBe(1)
    expect(sortedItems[1].unitPrice).toBe(50)
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
      await setupBillingPeriodItem({
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
      await setupBillingPeriodItem({
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
      await setupBillingPeriodItem({
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
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod1.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item 1',
      })

      await setupBillingPeriodItem({
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
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Test Item 1',
      })

      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 2,
        unitPrice: 50,
        name: 'Test Item 2',
      })

      await setupBillingPeriodItem({
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

    // Sort items by name to ensure deterministic ordering for assertions
    const sortedItems = [...result[0].billingPeriodItems].sort(
      (a, b) => a.name.localeCompare(b.name)
    )

    // Verify all items are correctly associated
    expect(sortedItems[0].name).toBe('Test Item 1')
    expect(sortedItems[0].quantity).toBe(1)
    expect(sortedItems[0].unitPrice).toBe(100)

    expect(sortedItems[1].name).toBe('Test Item 2')
    expect(sortedItems[1].quantity).toBe(2)
    expect(sortedItems[1].unitPrice).toBe(50)

    expect(sortedItems[2].name).toBe('Test Item 3')
    expect(sortedItems[2].quantity).toBe(3)
    expect(sortedItems[2].unitPrice).toBe(25)
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
      await setupBillingPeriodItem({
        billingPeriodId: monthlyBillingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Monthly Item',
      })

      await setupBillingPeriodItem({
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
      await setupBillingPeriodItem({
        billingPeriodId: activeBillingPeriod.id,
        quantity: 1,
        unitPrice: 100,
        name: 'Active Item',
      })

      await setupBillingPeriodItem({
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

// Tests for pricingModelId derivation functionality added in Wave 4
describe('pricingModelId derivation', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let billingPeriod: BillingPeriod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price for pricingModelId',
      unitPrice: 1000,
      type: PriceType.Subscription,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test-pricing-model@test.com',
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Subscription Item',
      quantity: 1,
      unitPrice: 1000,
      priceId: price.id,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: Date.now(),
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
    })
  })

  describe('insertBillingPeriodItem', () => {
    it('should derive pricingModelId from billing period', async () => {
      await adminTransaction(async ({ transaction }) => {
        const billingPeriodItem = await insertBillingPeriodItem(
          {
            billingPeriodId: billingPeriod.id,
            quantity: 1,
            unitPrice: 1000,
            name: 'Test Billing Period Item',
            description: 'Test description',
            type: SubscriptionItemType.Static,
            livemode: true,
          },
          transaction
        )

        expect(billingPeriodItem.pricingModelId).toBe(
          billingPeriod.pricingModelId
        )
        expect(billingPeriodItem.pricingModelId).toBe(pricingModel.id)
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const billingPeriodItem = await insertBillingPeriodItem(
          {
            billingPeriodId: billingPeriod.id,
            quantity: 1,
            unitPrice: 1000,
            name: 'Test Billing Period Item',
            description: 'Test description',
            type: SubscriptionItemType.Static,
            livemode: true,
            pricingModelId: pricingModel.id,
          },
          transaction
        )

        expect(billingPeriodItem.pricingModelId).toBe(pricingModel.id)
      })
    })

    it('should throw error when billing period does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentBillingPeriodId = `bp_${core.nanoid()}`

        await expect(
          insertBillingPeriodItem(
            {
              billingPeriodId: nonExistentBillingPeriodId,
              quantity: 1,
              unitPrice: 1000,
              name: 'Test Billing Period Item',
              description: 'Test description',
              type: SubscriptionItemType.Static,
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })

  describe('bulkInsertBillingPeriodItems', () => {
    it('should derive pricingModelId for each item in bulk insert', async () => {
      await adminTransaction(async ({ transaction }) => {
        const billingPeriodItems = await bulkInsertBillingPeriodItems(
          [
            {
              billingPeriodId: billingPeriod.id,
              quantity: 1,
              unitPrice: 1000,
              name: 'Test Item 1',
              description: 'Test description 1',
              type: SubscriptionItemType.Static,
              livemode: true,
            },
            {
              billingPeriodId: billingPeriod.id,
              quantity: 2,
              unitPrice: 2000,
              name: 'Test Item 2',
              description: 'Test description 2',
              type: SubscriptionItemType.Static,
              livemode: true,
            },
          ],
          transaction
        )

        expect(billingPeriodItems).toHaveLength(2)
        for (const item of billingPeriodItems) {
          expect(item.pricingModelId).toBe(
            billingPeriod.pricingModelId
          )
          expect(item.pricingModelId).toBe(pricingModel.id)
        }
      })
    })

    it('should throw error when one billing period does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentBillingPeriodId = `bp_${core.nanoid()}`

        await expect(
          bulkInsertBillingPeriodItems(
            [
              {
                billingPeriodId: billingPeriod.id,
                quantity: 1,
                unitPrice: 1000,
                name: 'Test Item 1',
                description: 'Test description 1',
                type: SubscriptionItemType.Static,
                livemode: true,
              },
              {
                billingPeriodId: nonExistentBillingPeriodId,
                quantity: 2,
                unitPrice: 2000,
                name: 'Test Item 2',
                description: 'Test description 2',
                type: SubscriptionItemType.Static,
                livemode: true,
              },
            ],
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })
})
