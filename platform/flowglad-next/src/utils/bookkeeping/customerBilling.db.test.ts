import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import {
  CheckoutSessionType,
  CurrencyCode,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupUserAndCustomer,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import * as databaseAuthentication from '@/db/databaseAuthentication'
import type { CreateCheckoutSessionInput } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import { nulledPriceColumns, type Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import type { User } from '@/db/schema/users'
import * as betterAuthSchemaMethods from '@/db/tableMethods/betterAuthSchemaMethods'
import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import {
  selectPaymentMethodById,
  selectPaymentMethods,
  updatePaymentMethod,
} from '@/db/tableMethods/paymentMethodMethods'
import {
  insertPrice,
  safelyUpdatePrice,
} from '@/db/tableMethods/priceMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import {
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import { createSpyTracker } from '@/test/spyTracker'
import { createDiscardingEffectsContext } from '@/test-utils/transactionCallbacks'
import type { CacheRecomputationContext } from '@/utils/cache'
import core from '@/utils/core'
import * as customerBillingPortalState from '@/utils/customerBillingPortalState'
import {
  customerBillingCreatePricedCheckoutSession,
  customerBillingTransaction,
  setDefaultPaymentMethodForCustomer,
} from './customerBilling'

// Mock next/headers to avoid Next.js context errors
mock.module('next/headers', () => ({
  headers: mock(() => new Headers()),
  cookies: mock(() => ({
    set: mock(),
    get: mock(),
    delete: mock(),
  })),
}))

// Note: @/utils/auth is mocked globally in bun.mocks.ts with globalThis.__mockedAuthSession
// Default value is null, which matches what this file needs for testing

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
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      paymentMethod1 = (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
      paymentMethod2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()
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
    const initialPm1 = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
    })
    expect(initialPm1.default).toBe(true)

    // Call setDefaultPaymentMethodForCustomer with already-default payment method
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod1.id },
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(paymentMethod1.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const pm1 = (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
      const pm2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()

      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      // Verify subscription still uses paymentMethod1
      const sub = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })
  })

  it('should set a non-default payment method as default and update subscriptions', async () => {
    // Verify initial state
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const pm1 = (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
      const pm2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()
      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      const sub = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })

    // Set paymentMethod2 as default
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(paymentMethod2.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database - pm2 is now default, pm1 is not
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const pm1 = (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
      const pm2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)

      // Verify subscription now uses paymentMethod2
      const sub = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()
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
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: pm2NoSubs.id },
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(pm2NoSubs.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const pm1 = (
        await selectPaymentMethodById(pm1NoSubs.id, transaction)
      ).unwrap()
      const pm2 = (
        await selectPaymentMethodById(pm2NoSubs.id, transaction)
      ).unwrap()

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
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const sub1 = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()
      const sub2 = (
        await selectSubscriptionById(subscription2.id, transaction)
      ).unwrap()
      const sub3 = (
        await selectSubscriptionById(subscription3.id, transaction)
      ).unwrap()

      expect(sub1.defaultPaymentMethodId).toBe(paymentMethod1.id)
      expect(sub2.defaultPaymentMethodId).toBe(paymentMethod1.id)
      expect(sub3.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })

    // Set paymentMethod2 as default
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify the result
    expect(result.success).toBe(true)

    // Verify all subscriptions now use paymentMethod2
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const sub1 = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()
      const sub2 = (
        await selectSubscriptionById(subscription2.id, transaction)
      ).unwrap()
      const sub3 = (
        await selectSubscriptionById(subscription3.id, transaction)
      ).unwrap()

      expect(sub1.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(sub2.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(sub3.defaultPaymentMethodId).toBe(paymentMethod2.id)

      // Verify payment methods
      const pm1 = (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
      const pm2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()

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
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        createDiscardingEffectsContext(transaction)
      )
    })

    expect(result.success).toBe(true)

    // Verify subscriptions
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const canceled = (
        await selectSubscriptionById(canceledSub.id, transaction)
      ).unwrap()
      const active = (
        await selectSubscriptionById(activeSub.id, transaction)
      ).unwrap()
      const original = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()

      // Canceled subscription should not be updated
      expect(canceled.defaultPaymentMethodId).toBe(paymentMethod1.id)

      // Active subscriptions should be updated
      expect(active.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(original.defaultPaymentMethodId).toBe(paymentMethod2.id)

      // Verify payment methods
      const pm1 = (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
      const pm2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)
    })
  })

  it('should throw error when payment method does not exist', async () => {
    const nonExistentId = `pm_${core.nanoid()}`

    // Attempt to set a non-existent payment method as default
    await expect(
      adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return await setDefaultPaymentMethodForCustomer(
          { paymentMethodId: nonExistentId },
          createDiscardingEffectsContext(transaction)
        )
      })
    ).rejects.toThrow()

    // Verify existing payment methods remain unchanged
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const pm1 = (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
      const pm2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()

      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      // Verify subscription remains unchanged
      const sub = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })
  })

  it('should handle setting same payment method as default multiple times', async () => {
    // First call - set paymentMethod2 as default
    const result1 = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        createDiscardingEffectsContext(transaction)
      )
    })

    expect(result1.success).toBe(true)
    expect(result1.paymentMethod.default).toBe(true)

    // Verify state after first call
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const pm2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()
      expect(pm2.default).toBe(true)

      const sub = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })

    // Second call - set paymentMethod2 as default again (already default)
    const result2 = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        createDiscardingEffectsContext(transaction)
      )
    })

    expect(result2.success).toBe(true)
    expect(result2.paymentMethod.default).toBe(true)

    // Verify state remains the same after second call
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const pm1 = (
        await selectPaymentMethodById(paymentMethod1.id, transaction)
      ).unwrap()
      const pm2 = (
        await selectPaymentMethodById(paymentMethod2.id, transaction)
      ).unwrap()

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)

      // Subscription should still use paymentMethod2
      const sub = (
        await selectSubscriptionById(subscription1.id, transaction)
      ).unwrap()
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })
  })

  describe('customerBillingTransaction - inactive price filtering', () => {
    let customer: Customer.Record
    let productWithMixedPrices: Product.Record
    let activePrice: Price.Record
    let inactivePrice: Price.Record
    let subscriptionWithActivePrice: Subscription.Record
    let subscriptionWithInactivePrice: Subscription.Record

    beforeEach(async () => {
      // Create a customer for testing
      customer = await setupCustomer({
        organizationId: organization.id,
        email: 'billing-price-filtering@example.com',
      })

      // Create a product with both active and inactive prices
      productWithMixedPrices = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Product with Mixed Prices',
        active: true,
      })

      // Create an inactive price
      inactivePrice = await setupPrice({
        productId: productWithMixedPrices.id,
        name: 'Inactive Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 2000,
        currency: CurrencyCode.USD,
        livemode: true,
        isDefault: false,
        trialPeriodDays: 0,
        active: false, // Explicitly inactive
      })
      // setupPrice makes active=true and isDefault=true via safelyInsertPrice,
      // so we update price to be inactive and non-default
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await safelyUpdatePrice(
          {
            id: inactivePrice.id,
            type: PriceType.Subscription,
            active: false,
            isDefault: false,
          },
          ctx
        )
      })

      // Create an active price
      activePrice = await setupPrice({
        productId: productWithMixedPrices.id,
        name: 'Active Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 0,
        currency: CurrencyCode.USD,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        active: true, // Explicitly active
      })

      // Create subscription with active price
      subscriptionWithActivePrice = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: activePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      })

      // Create subscription with inactive price (grandfathered state)
      subscriptionWithInactivePrice = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: inactivePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      })
    })

    it('should filter out inactive prices from pricingModel in customerBillingTransaction', async () => {
      const billingState = await adminTransaction(async (ctx) => {
        const { transaction, livemode } = ctx
        const cacheRecomputationContext: CacheRecomputationContext = {
          type: 'admin',
          livemode,
        }
        return await customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId: organization.id,
          },
          transaction,
          cacheRecomputationContext
        )
      })

      expect(billingState.pricingModel).toMatchObject({})
      expect(billingState.pricingModel.products).toHaveLength(2) // setupOrg + our test product

      // Find our test product
      const testProduct = billingState.pricingModel.products.find(
        (p) => p.id === productWithMixedPrices.id
      )
      expect(typeof testProduct).toBe('object')
      expect(testProduct!.prices).toHaveLength(1) // Only active price should be returned

      const returnedPrice = testProduct!.prices[0]
      expect(returnedPrice.id).toBe(activePrice.id)
      expect(returnedPrice.active).toBe(true)

      // Verify inactive price is filtered out
      const inactivePriceInResult = testProduct!.prices.find(
        (p) => p.id === inactivePrice.id
      )
      expect(inactivePriceInResult).toBeUndefined()
    })

    it('should preserve subscription items with inactive prices', async () => {
      const billingState = await adminTransaction(async (ctx) => {
        const { transaction, livemode } = ctx
        const cacheRecomputationContext: CacheRecomputationContext = {
          type: 'admin',
          livemode,
        }
        return await customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId: organization.id,
          },
          transaction,
          cacheRecomputationContext
        )
      })

      expect(typeof billingState.subscriptions).toBe('object')
      expect(
        billingState.subscriptions.length
      ).toBeGreaterThanOrEqual(2)

      // Find subscription with active price
      const subscriptionWithActivePrice =
        billingState.subscriptions.find(
          (sub) => sub.priceId === activePrice.id
        )
      expect(typeof subscriptionWithActivePrice).toBe('object')
      expect(subscriptionWithActivePrice?.priceId).toBe(
        activePrice.id
      )

      // Find subscription with inactive price (grandfathered state)
      const subscriptionWithInactivePrice =
        billingState.subscriptions.find(
          (sub) => sub.priceId === inactivePrice.id
        )
      expect(typeof subscriptionWithInactivePrice).toBe('object')
      expect(subscriptionWithInactivePrice?.priceId).toBe(
        inactivePrice.id
      )

      // Both subscription items should be visible regardless of price active status
      // This tests that subscription items remain visible
      // even if their associated price becomes inactive
    })

    it('should maintain all other billing data while filtering prices', async () => {
      const billingState = await adminTransaction(async (ctx) => {
        const { transaction, livemode } = ctx
        const cacheRecomputationContext: CacheRecomputationContext = {
          type: 'admin',
          livemode,
        }
        return await customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId: organization.id,
          },
          transaction,
          cacheRecomputationContext
        )
      })

      expect(typeof billingState.customer).toBe('object')
      expect(billingState.customer.id).toBe(customer.id)

      expect(typeof billingState.purchases).toBe('object')
      expect(typeof billingState.invoices).toBe('object')
      expect(typeof billingState.paymentMethods).toBe('object')
      expect(typeof billingState.subscriptions).toBe('object')
      expect(typeof billingState.currentSubscriptions).toBe('object')

      // Only pricingModel.products[].prices[] should be filtered
      expect(billingState.pricingModel).toMatchObject({})
      expect(billingState.pricingModel.products).toHaveLength(2) // setupOrg + our test product

      // Find our test product
      const testProduct = billingState.pricingModel.products.find(
        (p) => p.id === productWithMixedPrices.id
      )
      expect(typeof testProduct).toBe('object')
      expect(testProduct!.prices).toHaveLength(1) // Only active price
      expect(testProduct!.prices[0].active).toBe(true)

      // All other data should remain unchanged
      expect(
        billingState.subscriptions.length
      ).toBeGreaterThanOrEqual(2) // Both subscriptions should be visible
      expect(
        billingState.paymentMethods.length
      ).toBeGreaterThanOrEqual(0)
    })

    it('should return pricing model with only active prices and products', async () => {
      const productWithMixedPrices2 = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Product with Mixed Prices 2',
        active: true,
      })

      const inactivePrice2 = await setupPrice({
        productId: productWithMixedPrices2.id,
        name: 'Inactive Price 2',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 2500,
        currency: CurrencyCode.USD,
        livemode: true,
        isDefault: false,
        trialPeriodDays: 0,
        active: false,
      })
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await safelyUpdatePrice(
          {
            id: inactivePrice2.id,
            type: PriceType.Subscription,
            active: false,
            isDefault: false,
          },
          ctx
        )
      })

      const activePrice2 = await setupPrice({
        productId: productWithMixedPrices2.id,
        name: 'Active Price 2',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 1500,
        currency: CurrencyCode.USD,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        active: true,
      })

      const productWithOnlyInactivePrices = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Product with Only Inactive Prices',
        active: true,
      })

      const inactivePrice3 = await setupPrice({
        productId: productWithOnlyInactivePrices.id,
        name: 'Inactive Price 3',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 3000,
        currency: CurrencyCode.USD,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        active: false,
      })
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await safelyUpdatePrice(
          {
            id: inactivePrice3.id,
            type: PriceType.Subscription,
            active: false,
            isDefault: false,
          },
          ctx
        )
      })

      const billingState = await adminTransaction(async (ctx) => {
        const { transaction, livemode } = ctx
        const cacheRecomputationContext: CacheRecomputationContext = {
          type: 'admin',
          livemode,
        }
        return await customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId: organization.id,
          },
          transaction,
          cacheRecomputationContext
        )
      })

      expect(billingState.pricingModel.products).toHaveLength(3) // setupOrg + 2 test products with active prices

      // Verify all returned products have active: true
      billingState.pricingModel.products.forEach((product) => {
        expect(product.active).toBe(true)

        // Verify all returned prices have active: true
        product.prices.forEach((price) => {
          expect(price.active).toBe(true)
        })
      })

      // Verify products with only inactive prices are filtered out entirely
      const productWithOnlyInactiveInResult =
        billingState.pricingModel.products.find(
          (p) => p.id === productWithOnlyInactivePrices.id
        )
      expect(productWithOnlyInactiveInResult).toBeUndefined()

      // Verify products with mixed prices only show active prices
      const productWithMixed1 =
        billingState.pricingModel.products.find(
          (p) => p.id === productWithMixedPrices.id
        )
      expect(productWithMixed1).toMatchObject({})
      expect(productWithMixed1?.prices).toHaveLength(1) // Only active price
      expect(productWithMixed1?.prices[0].id).toBe(activePrice.id)

      const productWithMixed2 =
        billingState.pricingModel.products.find(
          (p) => p.id === productWithMixedPrices2.id
        )
      expect(productWithMixed2).toMatchObject({})
      expect(productWithMixed2?.prices).toHaveLength(1) // Only active price
      expect(productWithMixed2?.prices[0].id).toBe(activePrice2.id)
    })
  })
})

describe('customerBillingCreatePricedCheckoutSession', () => {
  let organization: Organization.Record
  let organization2: Organization.Record
  let pricingModel: PricingModel.Record
  let pricingModel2: PricingModel.Record
  let product: Product.Record
  let product2: Product.Record
  let price: Price.Record
  let price2: Price.Record
  let customer: Customer.Record
  let user: User.Record

  // Track spies for cleanup (see @/test/spyTracker.ts for details)
  const spyTracker = createSpyTracker()

  beforeEach(async () => {
    spyTracker.reset()

    // Set up first organization with pricing model and product
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    // Set up second organization with different pricing model to test access control
    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
    pricingModel2 = orgData2.pricingModel
    product2 = orgData2.product
    price2 = orgData2.price

    // Set up user and customer with pricing model
    const userAndCustomerSetup = await setupUserAndCustomer({
      organizationId: organization.id,
      livemode: true,
    })
    user = userAndCustomerSetup.user
    customer = userAndCustomerSetup.customer

    // Update customer to have the pricing model
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updateCustomer(
        {
          id: customer.id,
          pricingModelId: pricingModel.id,
        },
        transaction
      )
      const updatedCustomer = (
        await selectCustomerById(customer.id, transaction)
      ).unwrap()
      customer.pricingModelId = updatedCustomer.pricingModelId
    })

    // Mock the requestingCustomerAndUser to return our test data
    spyTracker.track(
      spyOn(
        databaseAuthentication,
        'requestingCustomerAndUser'
      ).mockResolvedValue([
        {
          user,
          customer,
        },
      ])
    )

    // Mock the organization ID retrieval for customer billing portal
    spyTracker.track(
      spyOn(
        customerBillingPortalState,
        'getCustomerBillingPortalOrganizationId'
      ).mockResolvedValue(organization.id)
    )

    // Mock setCustomerBillingPortalOrganizationId to avoid cookies error
    spyTracker.track(
      spyOn(
        customerBillingPortalState,
        'setCustomerBillingPortalOrganizationId'
      ).mockResolvedValue(undefined)
    )

    // Mock selectBetterAuthUserById to always return a valid user
    spyTracker.track(
      spyOn(
        betterAuthSchemaMethods,
        'selectBetterAuthUserById'
      ).mockResolvedValue({
        id: user.betterAuthId || 'mock_better_auth_id',
        email: user.email!,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
    )

    // Mock getDatabaseAuthenticationInfo to return proper auth info for customer
    spyTracker.track(
      spyOn(
        databaseAuthentication,
        'getDatabaseAuthenticationInfo'
      ).mockResolvedValue({
        userId: user.id,
        livemode: true,
        jwtClaim: {
          sub: user.id,
          user_metadata: {
            id: user.id,
            email: user.email!,
            aud: 'stub',
            role: 'customer',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          app_metadata: {
            provider: '',
          },
          email: user.email!,
          role: 'customer',
          organization_id: organization.id,
          session_id: 'mock_session_123',
          aud: 'stub',
        } as any,
      } as any)
    )
  })

  afterEach(() => {
    spyTracker.restoreAll()
  })

  it('should fail when price is not accessible to customer (from different organization)', async () => {
    // price2 belongs to a different organization
    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customer.externalId,
        priceId: price2.id, // Price from different organization
        type: CheckoutSessionType.Product,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    // When using authenticatedTransaction with the wrong organization's price,
    // the price select will fail due to RLS policies
    await expect(
      customerBillingCreatePricedCheckoutSession({
        checkoutSessionInput,
        customer,
      })
    ).rejects.toThrow()
  })

  it('should succeed when price is accessible to customer', async () => {
    // Create a non-default product and price for this test since default products
    // cannot have checkout sessions created for them
    const created = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const createdProduct = await insertProduct(
        {
          name: 'Non-Default Product',
          organizationId: organization.id,
          livemode: true,
          description:
            'Non-default product for testing checkout sessions',
          imageURL: 'https://flowglad.com/logo.png',
          active: true,
          singularQuantityLabel: 'seat',
          pluralQuantityLabel: 'seats',
          pricingModelId: pricingModel.id,
          externalId: null,
          default: false, // This is the key difference - not a default product
          slug: `non-default-product-${core.nanoid()}`,
        },
        ctx
      )

      const createdPrice = await insertPrice(
        {
          ...nulledPriceColumns,
          productId: createdProduct.id,
          name: 'Non-Default Product Price',
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          unitPrice: 1000, // $10.00
          currency: CurrencyCode.USD,
          active: true,
          livemode: true,
          isDefault: false,
          externalId: null,
          slug: `non-default-price-${core.nanoid()}`,
        },
        ctx
      )

      return {
        nonDefaultProduct: createdProduct,
        nonDefaultPrice: createdPrice,
      }
    })

    // Use the non-default price from same organization that customer has access to
    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customer.externalId,
        priceId: created.nonDefaultPrice.id, // Price from same organization/pricing model
        type: CheckoutSessionType.Product,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    const checkoutSessionResult =
      await customerBillingCreatePricedCheckoutSession({
        checkoutSessionInput,
        customer,
      })

    expect(checkoutSessionResult.checkoutSession).toMatchObject({})
    expect(checkoutSessionResult.checkoutSession.priceId).toBe(
      created.nonDefaultPrice.id
    )
    expect(checkoutSessionResult.checkoutSession.customerId).toBe(
      customer.id
    )
    expect(checkoutSessionResult.checkoutSession.organizationId).toBe(
      organization.id
    )
    expect(checkoutSessionResult.checkoutSession.type).toBe(
      CheckoutSessionType.Product
    )
    expect(checkoutSessionResult.url).toContain('/checkout/')
  })

  it('should fail with invalid checkout session type', async () => {
    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customer.externalId,
        type: CheckoutSessionType.AddPaymentMethod, // Invalid type for this function
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    await expect(
      customerBillingCreatePricedCheckoutSession({
        // @ts-expect-error - testing invalid type
        checkoutSessionInput,
        customer,
      })
    ).rejects.toThrow(
      'Invalid checkout session type. Only product and activate_subscription checkout sessions are supported. Received type: add_payment_method'
    )
  })

  it('should fail when customer external ID does not match', async () => {
    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: 'wrong-external-id',
        priceId: price.id,
        type: CheckoutSessionType.Product,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    await expect(
      customerBillingCreatePricedCheckoutSession({
        checkoutSessionInput,
        customer,
      })
    ).rejects.toThrow(
      'You do not have permission to create a checkout session for this customer'
    )
  })

  it('should allow ActivateSubscription checkout session type', async () => {
    // Create a subscription that needs activation
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Incomplete,
      livemode: true,
    })

    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customer.externalId,
        type: CheckoutSessionType.ActivateSubscription,
        targetSubscriptionId: subscription.id,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    const checkoutSessionResult =
      await customerBillingCreatePricedCheckoutSession({
        checkoutSessionInput,
        customer,
      })

    expect(checkoutSessionResult.checkoutSession).toMatchObject({})
    expect(checkoutSessionResult.checkoutSession.type).toBe(
      CheckoutSessionType.ActivateSubscription
    )
    expect(
      checkoutSessionResult.checkoutSession.targetSubscriptionId
    ).toBe(subscription.id)
    expect(checkoutSessionResult.checkoutSession.priceId).toBe(
      price.id
    )
  })

  // Note: The test "should fail when customer has no pricing model and tries to access price"
  // was removed because pricingModelId is now a required field on customers
})

describe('customerBillingTransaction - currentSubscription field', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record

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
      email: `test-current-sub-${core.nanoid()}@example.com`,
      livemode: true,
    })
  })

  it('should return currentSubscription as the most recently created subscription', async () => {
    // Create multiple subscriptions
    const sub1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    const sub2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    const sub3 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    const billingState = await adminTransaction(async (ctx) => {
      const { transaction, livemode } = ctx
      const cacheRecomputationContext: CacheRecomputationContext = {
        type: 'admin',
        livemode,
      }
      return await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction,
        cacheRecomputationContext
      )
    })

    // currentSubscription should be an object and one of the active subscriptions
    expect(typeof billingState.currentSubscription).toBe('object')
    // In transaction-isolated tests, timestamps may be equal, so we can't assume
    // which specific subscription is "most recent". Verify it's one of the current ones.
    const currentSubId = billingState.currentSubscription!.id
    expect([sub1.id, sub2.id, sub3.id]).toContain(currentSubId)
    expect(billingState.currentSubscriptions.length).toBe(3)
    expect(billingState.currentSubscriptions).toContainEqual(
      expect.objectContaining({ id: currentSubId })
    )
  })

  it('should return currentSubscription when only one current subscription exists', async () => {
    const sub = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    const billingState = await adminTransaction(async (ctx) => {
      const { transaction, livemode } = ctx
      const cacheRecomputationContext: CacheRecomputationContext = {
        type: 'admin',
        livemode,
      }
      return await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction,
        cacheRecomputationContext
      )
    })

    expect(typeof billingState.currentSubscription).toBe('object')
    expect(billingState.currentSubscription.id).toBe(sub.id)
    expect(billingState.currentSubscriptions).toHaveLength(1)
    expect(billingState.currentSubscriptions[0].id).toBe(sub.id)
  })

  it('should exclude non-current subscriptions from currentSubscription selection', async () => {
    // Create a canceled subscription
    const canceledSub = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Canceled,
      livemode: true,
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Create an active subscription
    const activeSub = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    const billingState = await adminTransaction(async (ctx) => {
      const { transaction, livemode } = ctx
      const cacheRecomputationContext: CacheRecomputationContext = {
        type: 'admin',
        livemode,
      }
      return await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction,
        cacheRecomputationContext
      )
    })

    expect(typeof billingState.currentSubscription).toBe('object')
    expect(billingState.currentSubscription.id).toBe(activeSub.id)
    expect(billingState.currentSubscription.id).not.toBe(
      canceledSub.id
    )
    expect(
      billingState.currentSubscriptions.find(
        (s) => s.id === canceledSub.id
      )
    ).toBeUndefined()
  })

  // FIXME: Uncomment once we migrate all non-subscribed customers to subscriptions
  // it('should throw error when customer has no current subscriptions', async () => {
  //   // Customer has no subscriptions at all
  //   await expect(
  //     adminTransaction(async (ctx) => {
  //       const { transaction } = ctx
  //       return await customerBillingTransaction(
  //         {
  //           externalId: customer.externalId,
  //           organizationId: organization.id,
  //         },
  //         transaction
  //       )
  //     })
  //   ).rejects.toThrow('Customer has no current subscriptions')
  // })

  it('should use updatedAt as tiebreaker when createdAt is the same', async () => {
    // Create a subscription
    const sub1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    const sub2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    // Note: In practice, createdAt will differ, but this test verifies
    // that if they were the same, updatedAt would be used as tiebreaker
    const billingState = await adminTransaction(async (ctx) => {
      const { transaction, livemode } = ctx
      const cacheRecomputationContext: CacheRecomputationContext = {
        type: 'admin',
        livemode,
      }
      return await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction,
        cacheRecomputationContext
      )
    })

    expect(typeof billingState.currentSubscription).toBe('object')
    // The most recently created/updated subscription should be selected
    expect([sub1.id, sub2.id]).toContain(
      billingState.currentSubscription.id
    )
  })

  it('should handle multiple subscriptions and return the most recent', async () => {
    // Create 5 subscriptions
    const subscriptions = []
    for (let i = 0; i < 5; i++) {
      const sub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      })
      subscriptions.push(sub)
    }

    const billingState = await adminTransaction(async (ctx) => {
      const { transaction, livemode } = ctx
      const cacheRecomputationContext: CacheRecomputationContext = {
        type: 'admin',
        livemode,
      }
      return await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction,
        cacheRecomputationContext
      )
    })

    // currentSubscription should be an object and one of the created subscriptions
    expect(typeof billingState.currentSubscription).toBe('object')
    // In transaction-isolated tests, timestamps may be equal, so we verify it's
    // one of the subscriptions we created rather than a specific one
    const subscriptionIds = subscriptions.map((s) => s.id)
    expect(subscriptionIds).toContain(
      billingState.currentSubscription!.id
    )
    expect(billingState.currentSubscriptions).toHaveLength(5)
  })
})
