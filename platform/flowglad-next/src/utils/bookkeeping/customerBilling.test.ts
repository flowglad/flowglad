import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
} from '../../../seedDatabase'
import { setDefaultPaymentMethodForCustomer } from './customerBilling'
import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { PricingModel } from '@/db/schema/pricingModels'
import { PaymentMethodType, SubscriptionStatus } from '@/types'
import core from '@/utils/core'
import {
  selectPaymentMethodById,
  selectPaymentMethods,
  updatePaymentMethod,
} from '@/db/tableMethods/paymentMethodMethods'
import {
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'

describe('setDefaultPaymentMethodForCustomer', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod1: PaymentMethod.Record
  let paymentMethod2: PaymentMethod.Record
  let subscription1: Subscription.Record

  beforeEach(async () => {
    // Set up organization with pricing model and product
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    // Set up customer
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test-customer-${core.nanoid()}@example.com`,
      livemode: true,
    })

    // Set up first payment method (will be default initially)
    paymentMethod1 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
      livemode: true,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
    })

    // Set up second payment method - setupPaymentMethod always creates as default, so we need to fix this
    paymentMethod2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
      livemode: true,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
    })

    // Fix the default settings - paymentMethod1 should be default, paymentMethod2 should not
    await adminTransaction(async ({ transaction }) => {
      await updatePaymentMethod(
        {
          id: paymentMethod1.id,
          default: true,
        },
        transaction
      )
      await updatePaymentMethod(
        {
          id: paymentMethod2.id,
          default: false,
        },
        transaction
      )
    })

    // Refresh the payment method records to get updated values
    await adminTransaction(async ({ transaction }) => {
      paymentMethod1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      paymentMethod2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )
    })

    // Set up a subscription using the first payment method
    subscription1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod1.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })
  })

  it('should handle payment method that is already default', async () => {
    // Verify initial state - paymentMethod1 is already default
    const initialPm1 = await adminTransaction(
      async ({ transaction }) => {
        return await selectPaymentMethodById(
          paymentMethod1.id,
          transaction
        )
      }
    )
    expect(initialPm1.default).toBe(true)

    // Call setDefaultPaymentMethodForCustomer with already-default payment method
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod1.id },
        transaction
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(paymentMethod1.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      // Verify subscription still uses paymentMethod1
      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })
  })

  it('should set a non-default payment method as default and update subscriptions', async () => {
    // Verify initial state
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )
      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })

    // Set paymentMethod2 as default
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        transaction
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(paymentMethod2.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database - pm2 is now default, pm1 is not
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)

      // Verify subscription now uses paymentMethod2
      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })
  })

  it('should handle customer with no subscriptions', async () => {
    // Create a new customer with no subscriptions
    const customerNoSubs = await setupCustomer({
      organizationId: organization.id,
      email: `no-subs-${core.nanoid()}@example.com`,
      livemode: true,
    })

    // Create two payment methods for this customer
    const pm1NoSubs = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customerNoSubs.id,
      type: PaymentMethodType.Card,
      default: true,
      livemode: true,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
    })

    const pm2NoSubs = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customerNoSubs.id,
      type: PaymentMethodType.Card,
      default: false,
      livemode: true,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
    })

    // Set the second payment method as default
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: pm2NoSubs.id },
        transaction
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(pm2NoSubs.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        pm1NoSubs.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        pm2NoSubs.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)

      // Verify no subscriptions exist for this customer
      const subs = await selectSubscriptions(
        { customerId: customerNoSubs.id },
        transaction
      )
      expect(subs.length).toBe(0)
    })
  })

  it('should update multiple subscriptions to new default payment method', async () => {
    // Create additional subscriptions
    const subscription2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod1.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    const subscription3 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod2.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    // Verify initial state
    await adminTransaction(async ({ transaction }) => {
      const sub1 = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      const sub2 = await selectSubscriptionById(
        subscription2.id,
        transaction
      )
      const sub3 = await selectSubscriptionById(
        subscription3.id,
        transaction
      )

      expect(sub1.defaultPaymentMethodId).toBe(paymentMethod1.id)
      expect(sub2.defaultPaymentMethodId).toBe(paymentMethod1.id)
      expect(sub3.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })

    // Set paymentMethod2 as default
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        transaction
      )
    })

    // Verify the result
    expect(result.success).toBe(true)

    // Verify all subscriptions now use paymentMethod2
    await adminTransaction(async ({ transaction }) => {
      const sub1 = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      const sub2 = await selectSubscriptionById(
        subscription2.id,
        transaction
      )
      const sub3 = await selectSubscriptionById(
        subscription3.id,
        transaction
      )

      expect(sub1.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(sub2.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(sub3.defaultPaymentMethodId).toBe(paymentMethod2.id)

      // Verify payment methods
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)
    })
  })

  it('should only update active subscriptions when setting default', async () => {
    // Create a canceled subscription
    const canceledSub = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod1.id,
      status: SubscriptionStatus.Canceled,
      livemode: true,
    })

    // Create an active subscription
    const activeSub = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod1.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    // Set paymentMethod2 as default
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        transaction
      )
    })

    expect(result.success).toBe(true)

    // Verify subscriptions
    await adminTransaction(async ({ transaction }) => {
      const canceled = await selectSubscriptionById(
        canceledSub.id,
        transaction
      )
      const active = await selectSubscriptionById(
        activeSub.id,
        transaction
      )
      const original = await selectSubscriptionById(
        subscription1.id,
        transaction
      )

      // Canceled subscription should not be updated
      expect(canceled.defaultPaymentMethodId).toBe(paymentMethod1.id)

      // Active subscriptions should be updated
      expect(active.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(original.defaultPaymentMethodId).toBe(paymentMethod2.id)

      // Verify payment methods
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)
    })
  })

  it('should throw error when payment method does not exist', async () => {
    const nonExistentId = `pm_${core.nanoid()}`

    // Attempt to set a non-existent payment method as default
    await expect(
      adminTransaction(async ({ transaction }) => {
        return await setDefaultPaymentMethodForCustomer(
          { paymentMethodId: nonExistentId },
          transaction
        )
      })
    ).rejects.toThrow()

    // Verify existing payment methods remain unchanged
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      // Verify subscription remains unchanged
      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })
  })

  it('should handle setting same payment method as default multiple times', async () => {
    // First call - set paymentMethod2 as default
    const result1 = await adminTransaction(
      async ({ transaction }) => {
        return await setDefaultPaymentMethodForCustomer(
          { paymentMethodId: paymentMethod2.id },
          transaction
        )
      }
    )

    expect(result1.success).toBe(true)
    expect(result1.paymentMethod.default).toBe(true)

    // Verify state after first call
    await adminTransaction(async ({ transaction }) => {
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )
      expect(pm2.default).toBe(true)

      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })

    // Second call - set paymentMethod2 as default again (already default)
    const result2 = await adminTransaction(
      async ({ transaction }) => {
        return await setDefaultPaymentMethodForCustomer(
          { paymentMethodId: paymentMethod2.id },
          transaction
        )
      }
    )

    expect(result2.success).toBe(true)
    expect(result2.paymentMethod.default).toBe(true)

    // Verify state remains the same after second call
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)

      // Subscription should still use paymentMethod2
      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })
  })
})
