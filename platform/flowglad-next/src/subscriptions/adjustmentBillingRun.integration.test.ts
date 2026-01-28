/**
 * Integration tests for adjustment billing run payment failure scenarios.
 *
 * These tests require real Stripe API calls with declining test cards
 * to verify behavior when payments fail during subscription adjustments.
 *
 * Run with: bun run test:integration src/subscriptions/adjustmentBillingRun.integration.test.ts
 */
import { afterEach, beforeEach, expect, it } from 'bun:test'
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
import {
  BillingPeriodStatus,
  BillingRunStatus,
  IntervalUnit,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
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
        } as SubscriptionItem.Record,
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
          newSubscriptionItems as SubscriptionItem.Record[],
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
