/**
 * Integration tests for billing run resource claims payment failure scenarios.
 *
 * These tests require real Stripe API calls with declining test cards
 * to verify resource claims are preserved when payments fail.
 *
 * Run with: bun run test:integration src/subscriptions/billingRunResourceClaims.integration.test.ts
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
  setupResource,
  setupResourceClaim,
  setupResourceFeature,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Resource } from '@/db/schema/resources'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { selectActiveResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { getResourceUsage } from '@/resources/resourceClaimHelpers'
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
  'Billing Run Resource Claims - Payment Failure Scenarios',
  () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let price: Price.Record
    let upgradedPrice: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let subscription: Subscription.Record
    let subscriptionItem: SubscriptionItem.Record
    let billingPeriod: BillingPeriod.Record
    let billingRun: BillingRun.Record
    let resource: Resource.Record
    let resourceFeature: Feature.ResourceRecord
    let subscriptionItemFeature: SubscriptionItemFeature.ResourceRecord
    let stripeCustomerId: string | undefined

    beforeEach(async () => {
      // Setup organization and pricing model
      const orgData = await setupOrg()
      organization = orgData.organization
      pricingModel = orgData.pricingModel
      product = orgData.product
      price = orgData.price

      // Create a higher-priced tier for upgrades
      upgradedPrice = await setupPrice({
        productId: product.id,
        name: 'Premium Plan',
        unitPrice: 2000, // Higher price for upgrade
        livemode: true,
        isDefault: false,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      // Setup resource
      resource = await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'seats',
        name: 'Seats',
      })

      // Setup resource feature with 5 capacity
      resourceFeature = await setupResourceFeature({
        organizationId: organization.id,
        name: 'Seats Feature',
        resourceId: resource.id,
        livemode: true,
        pricingModelId: pricingModel.id,
        amount: 5,
      })

      // Create a real Stripe customer for integration testing
      const stripeCustomer = await createTestStripeCustomer({
        email: `resource-claims-test-${Date.now()}@flowglad-test.com`,
        name: 'Resource Claims Test Customer',
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

      // Setup subscription with active billing period
      const now = Date.now()
      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
        currentBillingPeriodStart: now - 15 * 24 * 60 * 60 * 1000, // 15 days ago
        currentBillingPeriodEnd: now + 15 * 24 * 60 * 60 * 1000, // 15 days from now
      })

      // Setup subscription item
      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: price.name ?? 'Basic Plan',
        quantity: 1,
        unitPrice: price.unitPrice,
        type: SubscriptionItemType.Static,
      })

      // Setup resource subscription item feature
      subscriptionItemFeature =
        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: resourceFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 5,
        })

      // Setup billing period
      billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
      })

      // Setup billing period item
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: price.unitPrice,
        name: price.name ?? 'Basic Plan',
        type: SubscriptionItemType.Static,
        description: 'Monthly subscription',
      })

      // Setup adjustment billing run
      billingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        isAdjustment: true,
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

    it('does not modify claims when billing run fails due to payment decline', async () => {
      // Setup: Create 3 active claims
      for (let i = 0; i < 3; i++) {
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: `preserved-user-${i}`,
        })
      }

      // Capture initial state
      const initialSubscriptionItems = await adminTransaction(
        async ({ transaction }) => {
          return selectCurrentlyActiveSubscriptionItems(
            { subscriptionId: subscription.id },
            new Date(),
            transaction
          )
        }
      )

      const newSubscriptionItems: SubscriptionItem.Insert[] = [
        {
          subscriptionId: subscription.id,
          priceId: upgradedPrice.id,
          name: upgradedPrice.name ?? 'Premium Plan',
          quantity: 1,
          unitPrice: upgradedPrice.unitPrice,
          type: SubscriptionItemType.Static,
          livemode: true,
          metadata: null,
          externalId: null,
          addedDate: Date.now(),
        },
      ]

      // Execute billing run - payment will fail due to declining card
      await executeBillingRun(billingRun.id, {
        newSubscriptionItems,
        adjustmentDate: new Date(),
      })

      // Assert: Billing run should be marked as failed
      const updatedBillingRun = await adminTransaction(
        async ({ transaction }) => {
          return selectBillingRunById(
            billingRun.id,
            transaction
          ).then((r) => r.unwrap())
        }
      )
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)

      // Assert: Subscription items NOT adjusted (processOutcomeForBillingRun early exits for failed adjustment)
      const subscriptionItemsAfterFailure = await adminTransaction(
        async ({ transaction }) => {
          return selectCurrentlyActiveSubscriptionItems(
            { subscriptionId: subscription.id },
            new Date(),
            transaction
          )
        }
      )
      expect(subscriptionItemsAfterFailure.length).toBe(
        initialSubscriptionItems.length
      )
      expect(subscriptionItemsAfterFailure[0].id).toBe(
        initialSubscriptionItems[0].id
      )

      // Assert: All 3 claims still accessible
      const claimsAfterFailure = await adminTransaction(
        async ({ transaction }) => {
          return selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
        }
      )
      expect(claimsAfterFailure.length).toBe(3)
      expect(
        claimsAfterFailure.map((c) => c.externalId).sort()
      ).toEqual([
        'preserved-user-0',
        'preserved-user-1',
        'preserved-user-2',
      ])

      // Assert: Capacity unchanged (still from old features)
      const usage = await adminTransaction(
        async ({ transaction }) => {
          return getResourceUsage(
            subscription.id,
            resource.id,
            transaction
          )
        }
      )
      expect(usage.capacity).toBe(5) // Original capacity
      expect(usage.claimed).toBe(3)
      expect(usage.available).toBe(2)
    })
  }
)
