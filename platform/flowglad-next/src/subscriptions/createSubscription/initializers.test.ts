import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupUsageMeter,
  setupPrice,
} from '@/../seedDatabase'
import { insertSubscriptionAndItems } from './initializers'
import {
  IntervalUnit,
  SubscriptionStatus,
  PriceType,
  CurrencyCode,
} from '@/types'
import { Price } from '@/db/schema/prices'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Customer } from '@/db/schema/customers'
import { Catalog } from '@/db/schema/pricingModels'

describe('insertSubscriptionAndItems', () => {
  let organization: Organization.Record
  let product: Product.Record
  let defaultPrice: Price.Record
  let customer: Customer.Record
  let catalog: Catalog.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    defaultPrice = orgData.price
    catalog = orgData.catalog
    customer = await setupCustomer({
      organizationId: organization.id,
    })
  })

  describe('routing logic', () => {
    it('should throw an error if the price is not a subscription type', async () => {
      // setup:
      // - Create a price with type PriceType.SinglePayment.
      const singlePaymentPrice = await setupPrice({
        productId: product.id,
        type: PriceType.SinglePayment,
        name: 'Single Payment Price',
        unitPrice: 100,
        livemode: true,
        isDefault: false,
        setupFeeAmount: 0,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      // - Construct params for insertSubscriptionAndItems using this price.
      const params = {
        organization,
        customer,
        product,
        price: singlePaymentPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
      }
      // expects:
      // - The call to insertSubscriptionAndItems within an adminTransaction should be rejected.
      // - The error message should be "Price is not a subscription".
      await expect(
        adminTransaction(async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        })
      ).rejects.toThrow('Price is not a subscription')
    })

    it('should route to createNonRenewingSubscriptionAndItems when price.startsWithCreditTrial is true', async () => {
      // setup:
      // - Create a usage meter.
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Credit Trial Usage Meter',
        catalogId: catalog.id,
      })
      // - Create a price with type PriceType.Usage and startsWithCreditTrial = true, associated with the usage meter.
      const creditTrialPrice = await setupPrice({
        productId: product.id,
        type: PriceType.Subscription,
        name: 'Credit Trial Price',
        unitPrice: 0,
        livemode: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        isDefault: false,
        setupFeeAmount: 0,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
        startsWithCreditTrial: true,
      })
      // - Construct params for insertSubscriptionAndItems.
      const params = {
        organization,
        customer,
        product,
        price: creditTrialPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
      }
      // expects:
      // - The call to insertSubscriptionAndItems should succeed.
      const { subscription, subscriptionItems } =
        await adminTransaction(async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        })
      // - The returned subscription should have status 'credit_trial'.
      expect(subscription.status).toBe(SubscriptionStatus.CreditTrial)
      // - The returned subscription item should have type 'static'
      // as usage meters do not attach to the credit trial subscription items
      expect(subscriptionItems[0].type).toBe('static')
      expect(subscriptionItems[0].usageMeterId).toBeNull()
    })

    it('should route to createStandardSubscriptionAndItems when price is a standard subscription price', async () => {
      // setup:
      // - Create a standard subscription price (e.g., from setupOrg, ensure startsWithCreditTrial is false).
      const params = {
        organization,
        customer,
        product,
        price: defaultPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
      }
      // expects:
      // - The call to insertSubscriptionAndItems should succeed.
      const { subscription, subscriptionItems } =
        await adminTransaction(async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        })
      // - The returned subscription should have a status other than 'credit_trial' (e.g., 'incomplete', 'active').
      expect(subscription.status).not.toBe(
        SubscriptionStatus.CreditTrial
      )
      // - The returned subscription item should have type 'static'.
      expect(subscriptionItems[0].type).toBe('static')
    })

    it('should correctly calculate the billing period for a standard subscription with a trial', async () => {
      // setup:
      // - Create a standard subscription price.
      // - Construct params including a future trialEnd date.
      const trialEnd = new Date()
      trialEnd.setDate(trialEnd.getDate() + 14)
      const params = {
        organization,
        customer,
        product,
        price: defaultPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        trialEnd,
      }

      // expects:
      // - The call should succeed.
      const { subscription } = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        }
      )
      // - The created subscription should have status 'trialing'.
      expect(subscription.status).toBe(SubscriptionStatus.Trialing)
      // - The subscription's currentBillingPeriodEnd should be equal to the trialEnd date.
      expect(subscription.currentBillingPeriodEnd?.getTime()).toBe(
        trialEnd.getTime()
      )
    })
  })

  describe('createStandardSubscriptionAndItems (indirectly tested)', () => {
    it('should create an "active" subscription if autoStart is true and payment method is provided', async () => {
      // setup:
      // - Create a standard subscription price. (use default)
      // - Create a payment method for the customer.
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      // - Construct params with autoStart: true and the payment method, and no trialEnd.
      const params = {
        organization,
        customer,
        product,
        price: defaultPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        autoStart: true,
        defaultPaymentMethod: paymentMethod,
      }
      // expects:
      const { subscription } = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        }
      )
      // - The resulting subscription should have status 'active'.
      expect(subscription.status).toBe(SubscriptionStatus.Active)
      // - The subscription should have runBillingAtPeriodStart set to true (for subscription price type).
      expect(subscription.runBillingAtPeriodStart).toBe(true)
    })

    it('should create a "trialing" subscription if a trialEnd date is provided', async () => {
      // setup:
      // - Create a standard subscription price.
      // - Construct params with a future trialEnd date.
      const trialEnd = new Date()
      trialEnd.setDate(trialEnd.getDate() + 7)
      const params = {
        organization,
        customer,
        product,
        price: defaultPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        trialEnd,
      }
      // expects:
      const { subscription } = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        }
      )
      // - The resulting subscription should have status 'trialing'.
      expect(subscription.status).toBe(SubscriptionStatus.Trialing)
      // - The subscription's trialEnd field should match the provided date.
      expect(subscription.trialEnd?.getTime()).toBe(
        trialEnd.getTime()
      )
    })

    it('should create an "incomplete" subscription if autoStart is false and there is no trial', async () => {
      // setup:
      // - Create a standard subscription price.
      // - Construct params with autoStart: false (or undefined) and no payment method or trial.
      const params = {
        organization,
        customer,
        product,
        price: defaultPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        autoStart: false,
      }
      // expects:
      const { subscription } = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        }
      )
      // - The resulting subscription should have status 'incomplete'.
      expect(subscription.status).toBe(SubscriptionStatus.Incomplete)
    })

    it('should set runBillingAtPeriodStart to false for a standard subscription with a usage-based price', async () => {
      // setup:
      // - Create a usage meter.
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Standard Usage Meter',
        catalogId: catalog.id,
      })
      // - Create a price with type PriceType.Usage but ensure startsWithCreditTrial is false.
      const usagePrice = await setupPrice({
        productId: product.id,
        type: PriceType.Usage,
        name: 'Standard Usage Price',
        unitPrice: 10,
        livemode: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
        startsWithCreditTrial: false,
      })
      // - Construct params for a standard subscription creation.
      const params = {
        organization,
        customer,
        product,
        price: usagePrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
      }
      // expects:
      const { subscription } = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        }
      )
      // - The resulting subscription should have runBillingAtPeriodStart set to false.
      expect(subscription.runBillingAtPeriodStart).toBe(false)
    })

    it('should use a provided name for the subscription', async () => {
      // setup:
      // - Create a standard subscription price.
      // - Construct params with a specific `name` property.
      const subscriptionName = 'My Custom Subscription Name'
      const params = {
        organization,
        customer,
        product,
        price: defaultPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        name: subscriptionName,
      }
      // expects:
      const { subscription } = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        }
      )
      // - The resulting subscription's `name` should match the provided name.
      expect(subscription.name).toBe(subscriptionName)
    })

    it('should construct a default name from product and price if no name is provided', async () => {
      // setup:
      // - Ensure product and price have distinct names.
      // - Construct params without a `name` property.
      const params = {
        organization,
        customer,
        product,
        price: defaultPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
      }
      // expects:
      const { subscription } = await adminTransaction(
        async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        }
      )
      // - The resulting subscription's `name` should be a combination of the product and price names (e.g., "Product Name - Price Name").
      const expectedName = `${product.name}${
        defaultPrice.name ? ` - ${defaultPrice.name}` : ''
      }`
      expect(subscription.name).toBe(expectedName)
    })
  })

  describe('createNonRenewingSubscriptionAndItems (indirectly tested)', () => {
    it('should correctly create a credit trial subscription and items', async () => {
      // setup:
      // - Create a usage meter.
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Credit Trial Usage Meter 2',
        catalogId: catalog.id,
      })
      // - Create a price with type PriceType.Usage and startsWithCreditTrial = true.
      const creditTrialPrice = await setupPrice({
        productId: product.id,
        type: PriceType.Subscription,
        name: 'Credit Trial Price 2',
        unitPrice: 0,
        livemode: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        isDefault: false,
        currency: CurrencyCode.USD,
        startsWithCreditTrial: true,
      })
      // - Construct params for insertSubscriptionAndItems.
      const params = {
        organization,
        customer,
        product,
        price: creditTrialPrice,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
      }

      // expects:
      const { subscription, subscriptionItems } =
        await adminTransaction(async ({ transaction }) => {
          return insertSubscriptionAndItems(params, transaction)
        })

      // - The subscription status should be 'credit_trial'.
      expect(subscription.status).toBe(SubscriptionStatus.CreditTrial)
      // - The subscription should have null for billing period start/end dates and interval.
      expect(subscription.currentBillingPeriodStart).toBeNull()
      expect(subscription.currentBillingPeriodEnd).toBeNull()
      expect(subscription.interval).toBeNull()
      // - The subscription item should be of type 'static'
      // as usage meters do not attach to the credit trial subscription items
      expect(subscriptionItems[0].type).toBe('static')
      expect(subscriptionItems[0].usageMeterId).toBeNull()
    })
  })
})
