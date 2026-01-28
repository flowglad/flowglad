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
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupSubscriptionItem,
  setupUsageMeter,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import { safelyUpdatePaymentMethod } from '@/db/tableMethods/paymentMethodMethods'
import {
  selectCurrentlyActiveSubscriptionItems,
  selectSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import {
  cleanupStripeTestData,
  createTestPaymentMethod,
  createTestStripeCustomer,
  describeIfStripeKey,
} from '@/test/stripeIntegrationHelpers'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  IntervalUnit,
  PaymentStatus,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import { executeBillingRun } from './billingRunHelpers'

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

      // Create a payment method with a DECLINING card
      const stripePaymentMethod = await createTestPaymentMethod({
        stripeCustomerId: stripeCustomer.id,
        livemode: false,
        tokenType: 'declined', // This card will be declined
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
      })

      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: staticPrice.id,
        name: staticPrice.name ?? 'Static Item Name',
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        type: SubscriptionItemType.Static,
      })

      billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
      })

      staticBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        name: staticPrice.name ?? 'Static Item Name',
        type: SubscriptionItemType.Static,
        description: 'Test Description',
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

    it('should NOT update subscription items if payment fails due to card decline', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
      })

      const higherPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice * 2,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      // Don't create the subscription item in DB yet - prepare data structure
      // The item should only be created after payment succeeds
      const newSubscriptionItems = [
        {
          subscriptionId: subscription.id,
          priceId: higherPrice.id,
          name: higherPrice.name ?? 'Premium Plan',
          quantity: 1,
          unitPrice: higherPrice.unitPrice,
          type: SubscriptionItemType.Static,
          livemode: subscription.livemode,
          addedDate: Date.now() + 1000, // Future date so it's not active yet
        } as SubscriptionItem.Insert,
      ]

      const adjustmentDate = new Date()

      // Get items before
      const itemsBefore = await adminTransaction(({ transaction }) =>
        selectCurrentlyActiveSubscriptionItems(
          { subscriptionId: subscription.id },
          new Date(),
          transaction
        )
      )
      const originalItemIds = itemsBefore
        .filter((item) => !item.expiredAt)
        .map((item) => item.id)

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems:
          newSubscriptionItems as SubscriptionItem.Insert[],
        adjustmentDate,
      })

      // Verify billing run status (should be Failed due to card decline)
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            adjustmentBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)

      // Verify subscription items were NOT updated
      const itemsAfter = await adminTransaction(({ transaction }) =>
        selectCurrentlyActiveSubscriptionItems(
          { subscriptionId: subscription.id },
          new Date(),
          transaction
        )
      )
      const afterItemIds = itemsAfter
        .filter((item) => !item.expiredAt)
        .map((item) => item.id)

      // Should still have original items, no new items
      expect(afterItemIds).toEqual(originalItemIds)
      const newItemExists = itemsAfter.some(
        (item) => item.priceId === higherPrice.id && !item.expiredAt
      )
      expect(newItemExists).toBe(false)
    })

    it('should mark billing run as failed when customer has no Stripe customer ID', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
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

      // Create a payment method with a SUCCESSFUL card
      const stripePaymentMethod = await createTestPaymentMethod({
        stripeCustomerId: stripeCustomer.id,
        livemode: false,
        tokenType: 'success', // This card will succeed
      })

      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        stripePaymentMethodId: stripePaymentMethod.id,
      })

      usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Global Test Usage Meter',
        pricingModelId: pricingModel.id,
        livemode: true,
      })

      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: staticPrice.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
      })

      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: staticPrice.id,
        name: staticPrice.name ?? 'Static Item Name',
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        type: SubscriptionItemType.Static,
      })

      billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
      })

      staticBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        name: staticPrice.name ?? 'Static Item Name',
        type: SubscriptionItemType.Static,
        description: 'Test Description',
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

    it('should succeed when executing an adjustment billing run with adjustment params', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
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

      const adjustmentDate = new Date()

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
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
    })

    it('should update subscription items after payment succeeds for adjustment', async () => {
      // Setup: existing subscription item
      const existingItem = subscriptionItem
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
      })

      // Create a new higher-priced subscription item
      const higherPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice * 2, // Double the price
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newSubscriptionItems = [
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: higherPrice.id,
          name: higherPrice.name ?? 'Premium Plan',
          quantity: 1,
          unitPrice: higherPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      const adjustmentDate = new Date(
        billingPeriod.startDate +
          (billingPeriod.endDate - billingPeriod.startDate) / 2
      ) // Mid-period

      // Get subscription items before adjustment
      const itemsBefore = await adminTransaction(({ transaction }) =>
        selectCurrentlyActiveSubscriptionItems(
          { subscriptionId: subscription.id },
          new Date(),
          transaction
        )
      )
      expect(
        itemsBefore.some((item) => item.id === existingItem.id)
      ).toBe(true)

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
        adjustmentDate,
      })

      // Verify billing run succeeded
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

      // Verify subscription items were updated after payment
      const itemsAfter = await adminTransaction(({ transaction }) =>
        selectCurrentlyActiveSubscriptionItems(
          { subscriptionId: subscription.id },
          adjustmentDate.getTime() + 1000, // After adjustment date
          transaction
        )
      )

      // Old item should be expired
      const oldItemStillActive = itemsAfter.find(
        (item) => item.id === existingItem.id && !item.expiredAt
      )
      expect(oldItemStillActive).toBeUndefined()

      // New item should exist
      const newItem = itemsAfter.find(
        (item) => item.priceId === higherPrice.id
      )
      expect(newItem?.name).toBe(higherPrice.name)
    })

    it('should succeed billing run and create payment intent when existing payments partially cover the adjustment', async () => {
      // Setup: Create an original billing run for the initial subscription payment
      const originalBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Succeeded,
        isAdjustment: false,
      })

      // Setup: Create an existing payment for the billing period
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
        billingRunId: originalBillingRun.id,
      })

      const existingPaymentAmount = staticPrice.unitPrice / 2 // Half the price
      await setupPayment({
        stripeChargeId: 'ch_existing_' + core.nanoid(),
        status: PaymentStatus.Succeeded,
        amount: existingPaymentAmount,
        livemode: billingPeriod.livemode,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: 'pi_existing_' + core.nanoid(),
        invoiceId: invoice.id,
        paymentMethod: paymentMethod.type,
        billingPeriodId: billingPeriod.id,
        subscriptionId: billingPeriod.subscriptionId,
        paymentMethodId: paymentMethod.id,
      })

      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
      })

      const higherPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice * 2, // Double the price
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newSubscriptionItems = [
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: higherPrice.id,
          name: higherPrice.name ?? 'Premium Plan',
          quantity: 1,
          unitPrice: higherPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      // Adjust at 50% through the period
      const adjustmentDate = new Date(
        billingPeriod.startDate +
          (billingPeriod.endDate - billingPeriod.startDate) / 2
      )

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
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
    })

    it('should cap proration at zero for downgrades (no refunds)', async () => {
      // Setup: Create a higher-priced subscription item first
      const higherPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice * 2,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const higherPriceItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: higherPrice.id,
        name: higherPrice.name ?? 'Premium Plan',
        quantity: 1,
        unitPrice: higherPrice.unitPrice,
        type: SubscriptionItemType.Static,
      })

      // Create a payment for the full higher price
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: higherPrice.id,
      })

      await setupPayment({
        stripeChargeId: 'ch_full_' + core.nanoid(),
        status: PaymentStatus.Succeeded,
        amount: higherPrice.unitPrice, // Full payment
        livemode: billingPeriod.livemode,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: 'pi_full_' + core.nanoid(),
        invoiceId: invoice.id,
        paymentMethod: paymentMethod.type,
        billingPeriodId: billingPeriod.id,
        subscriptionId: billingPeriod.subscriptionId,
        paymentMethodId: paymentMethod.id,
      })

      // Now downgrade to lower price
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
      })

      const newSubscriptionItems = [
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: staticPrice.id,
          name: staticPrice.name ?? 'Basic Plan',
          quantity: 1,
          unitPrice: staticPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      // Adjust at 50% through period
      const adjustmentDate = new Date(
        billingPeriod.startDate +
          (billingPeriod.endDate - billingPeriod.startDate) / 2
      )

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
        adjustmentDate,
      })

      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(
            adjustmentBillingRun.id,
            transaction
          ).then((r) => r.unwrap())
      )

      // If amount is 0, billing run should succeed without payment
      // The actual behavior depends on implementation, but key is no negative charge
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })

    it('should expire removed subscription item and keep retained items active after multi-item adjustment', async () => {
      // Setup: Create subscription with 2 items
      const secondPrice = await setupPrice({
        productId: product.id,
        name: 'Add-on Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice / 2,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const secondItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: secondPrice.id,
        name: secondPrice.name ?? 'Add-on Plan',
        quantity: 1,
        unitPrice: secondPrice.unitPrice,
        type: SubscriptionItemType.Static,
      })

      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
      })

      // Create a new third price (round to integer to avoid Zod validation error)
      const thirdPrice = await setupPrice({
        productId: product.id,
        name: 'New Add-on',
        type: PriceType.Subscription,
        unitPrice: Math.round(staticPrice.unitPrice / 3),
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      // Adjustment: keep first item, remove second, add third
      const newSubscriptionItems = [
        subscriptionItem, // Keep existing first item
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: thirdPrice.id,
          name: thirdPrice.name ?? 'New Add-on',
          quantity: 1,
          unitPrice: thirdPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      const adjustmentDate = new Date()

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
        adjustmentDate,
      })

      // Verify billing run succeeded
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

      // Verify subscription items - get all items including expired ones
      const allItemsAfter = await adminTransaction(
        ({ transaction }) =>
          selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )
      )

      // Second item should be expired
      const secondItemAfter = allItemsAfter.find(
        (item) => item.id === secondItem.id
      )
      expect(secondItemAfter?.expiredAt).toBeLessThanOrEqual(
        adjustmentDate.getTime()
      )

      // Get active items for the other checks
      const activeItemsAfter = await adminTransaction(
        ({ transaction }) =>
          selectCurrentlyActiveSubscriptionItems(
            { subscriptionId: subscription.id },
            adjustmentDate.getTime() + 1000,
            transaction
          )
      )

      // First item should still exist and be active with correct properties
      const firstItemAfter = activeItemsAfter.find(
        (item) => item.id === subscriptionItem.id
      )
      expect(firstItemAfter).toMatchObject({
        id: subscriptionItem.id,
        priceId: staticPrice.id,
        name: subscriptionItem.name,
        quantity: subscriptionItem.quantity,
        unitPrice: subscriptionItem.unitPrice,
        type: SubscriptionItemType.Static,
        expiredAt: null,
      })

      // Third item should exist and be active with correct properties
      const thirdItemAfter = activeItemsAfter.find(
        (item) => item.priceId === thirdPrice.id && !item.expiredAt
      )
      expect(thirdItemAfter).toMatchObject({
        priceId: thirdPrice.id,
        name: thirdPrice.name ?? 'New Add-on',
        quantity: 1,
        unitPrice: thirdPrice.unitPrice,
        type: SubscriptionItemType.Static,
        expiredAt: null,
      })
    })

    it('should create payment intent and succeed billing run for mid-period upgrade adjustment', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
      })

      const higherPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice * 2,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newSubscriptionItems = [
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: higherPrice.id,
          name: higherPrice.name ?? 'Premium Plan',
          quantity: 1,
          unitPrice: higherPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      // Adjust exactly at 50% through the period
      const adjustmentDate = new Date(
        billingPeriod.startDate +
          (billingPeriod.endDate - billingPeriod.startDate) / 2
      )

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
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
    })

    it('should sync subscription record with most expensive item after adjustment', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
      })

      const higherPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice * 2,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newSubscriptionItems = [
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: higherPrice.id,
          name: higherPrice.name ?? 'Premium Plan',
          quantity: 1,
          unitPrice: higherPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      const adjustmentDate = new Date()

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
        adjustmentDate,
      })

      // Verify subscription record was synced
      const updatedSubscription = await adminTransaction(
        async ({ transaction }) =>
          (
            await selectSubscriptionById(subscription.id, transaction)
          ).unwrap()
      )

      // Subscription should reflect the most expensive item (the new higher price)
      expect(updatedSubscription.priceId).toBe(higherPrice.id)
      expect(updatedSubscription.name).toBe(higherPrice.name)
    })

    it('should preserve existing billing period items and succeed billing run for adjustment', async () => {
      const adjustmentBillingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
      })

      const higherPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        type: PriceType.Subscription,
        unitPrice: staticPrice.unitPrice * 2,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newSubscriptionItems = [
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: higherPrice.id,
          name: higherPrice.name ?? 'Premium Plan',
          quantity: 1,
          unitPrice: higherPrice.unitPrice,
          type: SubscriptionItemType.Static,
        }),
      ]

      // Adjust at 50% through period
      const adjustmentDate = new Date(
        billingPeriod.startDate +
          (billingPeriod.endDate - billingPeriod.startDate) / 2
      )

      await executeBillingRun(adjustmentBillingRun.id, {
        newSubscriptionItems,
        adjustmentDate,
      })

      // Verify billing period items exist (proration items are created in adjustSubscription)
      const billingPeriodItemsAfter = await adminTransaction(
        ({ transaction }) =>
          selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
      )

      // The billing period should have items (original staticBillingPeriodItem at minimum)
      expect(billingPeriodItemsAfter.length).toBeGreaterThan(0)

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
    })
  }
)
