/**
 * Integration tests for adjustment billing run scenarios.
 *
 * These tests require real Stripe API calls because stripe-mock doesn't preserve
 * payment intent metadata, which is required for processOutcomeForBillingRun.
 *
 * Run with: bun run test:integration src/subscriptions/adjustmentBillingRun.integration.test.ts
 */
import { afterEach, beforeEach, expect, it } from 'bun:test'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  IntervalUnit,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@db-core/enums'
import type { BillingPeriodItem } from '@db-core/schema/billingPeriodItems'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupSubscriptionItem,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import { safelyUpdatePaymentMethod } from '@/db/tableMethods/paymentMethodMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  cleanupStripeTestData,
  createTestPaymentMethod,
  createTestStripeCustomer,
  describeIfStripeKey,
} from '@/test/stripeIntegrationHelpers'
import { executeBillingRun } from './billingRunHelpers'

/**
 * Payment Failure Scenarios
 *
 * These tests verify that billing runs fail gracefully when:
 * 1. Card is declined
 * 2. Customer has no Stripe customer ID
 * 3. Payment method has no Stripe payment method ID
 *
 * Note: We use a SUCCESS card in beforeEach because `tok_chargeDeclined` fails
 * during payment method attachment. For card decline tests, we create a separate
 * declined card payment method in the test itself.
 */
describeIfStripeKey(
  'Adjustment Billing Run - Payment Failure Scenarios',
  () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let staticPrice: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let subscription: Subscription.Record
    let billingPeriod: BillingPeriod.Record
    let staticBillingPeriodItem: BillingPeriodItem.Record
    let subscriptionItem: SubscriptionItem.Record
    let stripeCustomerId: string | undefined

    beforeEach(async () => {
      const orgData = await setupOrg()
      organization = orgData.organization
      pricingModel = orgData.pricingModel
      product = orgData.product
      staticPrice = orgData.price

      // Create a real Stripe customer for integration testing
      const stripeCustomer = await createTestStripeCustomer({
        email: `adjustment-test-${Date.now()}@flowglad-test.com`,
        name: 'Adjustment Test Customer',
      })
      stripeCustomerId = stripeCustomer.id

      customer = await setupCustomer({
        organizationId: organization.id,
        stripeCustomerId: stripeCustomer.id,
      })

      // Create a payment method with a SUCCESS card for setup
      // Card decline tests will create a separate declined payment method
      const stripePaymentMethod = await createTestPaymentMethod({
        stripeCustomerId: stripeCustomer.id,
        livemode: false,
        tokenType: 'success',
      })

      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        stripePaymentMethodId: stripePaymentMethod.id,
      })

      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: staticPrice.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: staticPrice.id,
        name: staticPrice.name ?? 'Static Item Name',
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        type: SubscriptionItemType.Static,
        livemode: false,
      })

      billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
        livemode: false,
      })

      staticBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        name: staticPrice.name ?? 'Static Item Name',
        type: SubscriptionItemType.Static,
        description: 'Test Description',
        livemode: false,
      })
    })

    afterEach(async () => {
      // Clean up Stripe resources
      if (stripeCustomerId) {
        await cleanupStripeTestData({
          stripeCustomerId,
        })
      }

      if (organization) {
        await teardownOrg({ organizationId: organization.id })
      }
    })

    // NOTE: Card decline tests are in processBillingRunPaymentIntents.stripe.test.ts
    // because Stripe's test tokens (tok_chargeDeclined) fail during payment method
    // creation/attachment, not during charges. This makes it impossible to test
    // card decline scenarios with real Stripe API.

    it('should mark billing run as failed when customer has no Stripe customer ID', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
        livemode: false,
      })

      // Remove Stripe customer ID
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          {
            id: customer.id,
            stripeCustomerId: null,
          },
          transaction
        )
      })

      const newSubscriptionItems = [
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: staticPrice.id,
          name: staticPrice.name ?? 'New Static Item',
          quantity: 1,
          unitPrice: staticPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
        adjustmentDate: new Date(),
      })

      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            adjustmentBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
      expect(typeof updatedBillingRun.errorDetails).toBe('object')
    })

    it('should mark billing run as failed when payment method has no Stripe payment method ID', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
        livemode: false,
      })

      // Remove Stripe payment method ID
      await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          await safelyUpdatePaymentMethod(
            {
              id: paymentMethod.id,
              stripePaymentMethodId: null,
            },
            {
              transaction,
              cacheRecomputationContext,
              invalidateCache: invalidateCache!,
              emitEvent: emitEvent!,
              enqueueLedgerCommand: enqueueLedgerCommand!,
            }
          )
        }
      )

      const newSubscriptionItems = [
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: staticPrice.id,
          name: staticPrice.name ?? 'New Static Item',
          quantity: 1,
          unitPrice: staticPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
        adjustmentDate: new Date(),
      })

      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            adjustmentBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
      expect(typeof updatedBillingRun.errorDetails).toBe('object')
    })
  }
)

describeIfStripeKey(
  'Adjustment Billing Run - Successful Payment Scenarios',
  () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let staticPrice: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let subscription: Subscription.Record
    let billingPeriod: BillingPeriod.Record
    let staticBillingPeriodItem: BillingPeriodItem.Record
    let usageMeter: UsageMeter.Record
    let subscriptionItem: SubscriptionItem.Record
    let stripeCustomerId: string | undefined

    beforeEach(async () => {
      const orgData = await setupOrg()
      organization = orgData.organization
      pricingModel = orgData.pricingModel
      product = orgData.product
      staticPrice = orgData.price

      // Create a real Stripe customer for integration testing
      const stripeCustomer = await createTestStripeCustomer({
        email: `adjustment-success-test-${Date.now()}@flowglad-test.com`,
        name: 'Adjustment Success Test Customer',
      })
      stripeCustomerId = stripeCustomer.id

      customer = await setupCustomer({
        organizationId: organization.id,
        stripeCustomerId: stripeCustomer.id,
      })

      // Create a payment method with a SUCCESS card
      const stripePaymentMethod = await createTestPaymentMethod({
        stripeCustomerId: stripeCustomer.id,
        livemode: false,
        tokenType: 'success',
      })

      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        stripePaymentMethodId: stripePaymentMethod.id,
      })

      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: staticPrice.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
        livemode: false,
      })

      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: staticPrice.id,
        name: staticPrice.name ?? 'Static Item Name',
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        type: SubscriptionItemType.Static,
        livemode: false,
      })

      billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
        livemode: false,
      })

      staticBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        name: staticPrice.name ?? 'Static Item Name',
        type: SubscriptionItemType.Static,
        description: 'Test Description',
        livemode: false,
      })
    })

    afterEach(async () => {
      // Clean up Stripe resources
      if (stripeCustomerId) {
        await cleanupStripeTestData({
          stripeCustomerId,
        })
      }

      if (organization) {
        await teardownOrg({ organizationId: organization.id })
      }
    })

    it('should complete billing run and update subscription items on successful payment', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
        livemode: false,
      })

      const higherPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice * 2,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newSubscriptionItems = [
        {
          subscriptionId: subscription.id,
          priceId: higherPrice.id,
          name: higherPrice.name ?? 'Premium Plan',
          quantity: 1,
          unitPrice: higherPrice.unitPrice,
          type: SubscriptionItemType.Static,
          livemode: subscription.livemode,
          addedDate: Date.now() + 1000,
        } as SubscriptionItem.Insert,
      ]

      const adjustmentDate = new Date()

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems:
          newSubscriptionItems as SubscriptionItem.Insert[],
        adjustmentDate,
      })

      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            adjustmentBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )

      // Verify subscription items were updated
      const itemsAfter = await adminTransaction(({ transaction }) =>
        selectCurrentlyActiveSubscriptionItems(
          { subscriptionId: subscription.id },
          new Date(),
          transaction
        )
      )
      const newItemExists = itemsAfter.some(
        (item) => item.priceId === higherPrice.id && !item.expiredAt
      )
      expect(newItemExists).toBe(true)
    })

    it('should succeed when billing run has zero amount due', async () => {
      // Set up billing period with zero-priced item
      const zeroPrice = await setupPrice({
        productId: product.id,
        name: 'Free Plan',
        type: PriceType.Subscription,
        unitPrice: 0,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const zeroBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 0,
        name: zeroPrice.name ?? 'Free Item',
        type: SubscriptionItemType.Static,
        description: 'Zero price item',
        livemode: false,
      })

      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
        livemode: false,
      })

      const newSubscriptionItems = [
        {
          subscriptionId: subscription.id,
          priceId: zeroPrice.id,
          name: zeroPrice.name ?? 'Free Plan',
          quantity: 1,
          unitPrice: 0,
          type: SubscriptionItemType.Static,
          livemode: subscription.livemode,
          addedDate: Date.now() + 1000,
        } as SubscriptionItem.Insert,
      ]

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems:
          newSubscriptionItems as SubscriptionItem.Insert[],
        adjustmentDate: new Date(),
      })

      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            adjustmentBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )
      // Zero amount billing runs should succeed without charging
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })

    it('should handle adjustment with multiple new subscription items', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
        livemode: false,
      })

      const addonPrice1 = await setupPrice({
        productId: product.id,
        name: 'Addon 1',
        type: PriceType.Subscription,
        unitPrice: 500,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const addonPrice2 = await setupPrice({
        productId: product.id,
        name: 'Addon 2',
        type: PriceType.Subscription,
        unitPrice: 700,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newSubscriptionItems = [
        {
          subscriptionId: subscription.id,
          priceId: addonPrice1.id,
          name: addonPrice1.name ?? 'Addon 1',
          quantity: 1,
          unitPrice: addonPrice1.unitPrice,
          type: SubscriptionItemType.Static,
          livemode: subscription.livemode,
          addedDate: Date.now() + 1000,
        } as SubscriptionItem.Insert,
        {
          subscriptionId: subscription.id,
          priceId: addonPrice2.id,
          name: addonPrice2.name ?? 'Addon 2',
          quantity: 1,
          unitPrice: addonPrice2.unitPrice,
          type: SubscriptionItemType.Static,
          livemode: subscription.livemode,
          addedDate: Date.now() + 1000,
        } as SubscriptionItem.Insert,
      ]

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems:
          newSubscriptionItems as SubscriptionItem.Insert[],
        adjustmentDate: new Date(),
      })

      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            adjustmentBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )

      // Verify both new items exist
      const itemsAfter = await adminTransaction(({ transaction }) =>
        selectCurrentlyActiveSubscriptionItems(
          { subscriptionId: subscription.id },
          new Date(),
          transaction
        )
      )
      const addon1Exists = itemsAfter.some(
        (item) => item.priceId === addonPrice1.id && !item.expiredAt
      )
      const addon2Exists = itemsAfter.some(
        (item) => item.priceId === addonPrice2.id && !item.expiredAt
      )
      expect(addon1Exists).toBe(true)
      expect(addon2Exists).toBe(true)
    })

    it('should create invoice and payment records on successful billing run', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
        livemode: false,
      })

      const newPrice = await setupPrice({
        productId: product.id,
        name: 'New Plan',
        type: PriceType.Subscription,
        unitPrice: 2000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newSubscriptionItems = [
        {
          subscriptionId: subscription.id,
          priceId: newPrice.id,
          name: newPrice.name ?? 'New Plan',
          quantity: 1,
          unitPrice: newPrice.unitPrice,
          type: SubscriptionItemType.Static,
          livemode: subscription.livemode,
          addedDate: Date.now() + 1000,
        } as SubscriptionItem.Insert,
      ]

      const result = await executeBillingRun(
        adjustmentBillingRun.id,
        {
          newSubscriptionItems:
            newSubscriptionItems as SubscriptionItem.Insert[],
          adjustmentDate: new Date(),
        }
      )

      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            adjustmentBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )

      // Verify invoice was created
      expect(typeof result?.invoice?.id).toBe('string')
      expect(typeof result?.invoice?.status).toBe('string')

      // Verify payment was created
      expect(typeof result?.payment?.id).toBe('string')
    })

    it('should not run billing when billing run is not in Scheduled status', async () => {
      const completedBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Succeeded, // Not Scheduled
        isAdjustment: true,
        livemode: false,
      })

      const newSubscriptionItems = [
        {
          subscriptionId: subscription.id,
          priceId: staticPrice.id,
          name: staticPrice.name ?? 'Item',
          quantity: 1,
          unitPrice: staticPrice.unitPrice,
          type: SubscriptionItemType.Static,
          livemode: subscription.livemode,
          addedDate: Date.now() + 1000,
        } as SubscriptionItem.Insert,
      ]

      const result = await executeBillingRun(completedBillingRun.id, {
        newSubscriptionItems:
          newSubscriptionItems as SubscriptionItem.Insert[],
        adjustmentDate: new Date(),
      })

      // Should return undefined/early exit without processing
      expect(result).toBeUndefined()

      // Status should remain unchanged
      const unchangedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            completedBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )
      expect(unchangedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })
  }
)
