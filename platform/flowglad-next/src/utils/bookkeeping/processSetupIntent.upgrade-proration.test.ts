import { describe, it, expect, beforeEach } from 'vitest'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentMethodType,
  PurchaseStatus,
  SubscriptionStatus,
  IntervalUnit,
  PriceType,
  CurrencyCode,
  CancellationReason,
  FlowgladEventType,
} from '@/types'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { PricingModel } from '@/db/schema/pricingModels'
import { Purchase } from '@/db/schema/purchases'
import { core } from '@/utils/core'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupCheckoutSession,
  setupProduct,
  setupPrice,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  processSetupIntentSucceeded,
  CoreSripeSetupIntent,
} from '@/utils/bookkeeping/processSetupIntent'
import {
  selectSubscriptions,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { IntentMetadataType } from '@/utils/stripe'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'

// Helper function to create mock setup intent
const mockSucceededSetupIntent = ({
  checkoutSessionId,
  stripeCustomerId,
}: {
  checkoutSessionId: string
  stripeCustomerId: string
}): CoreSripeSetupIntent => ({
  status: 'succeeded',
  id: `seti_${core.nanoid()}`,
  customer: stripeCustomerId,
  payment_method: `pm_${core.nanoid()}`,
  metadata: {
    type: IntentMetadataType.CheckoutSession,
    checkoutSessionId,
  },
})

describe('Subscription Upgrade with Proration', () => {
  // Common test data
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let freeProduct: Product.Record
  let freePrice: Price.Record
  let paidProduct: Product.Record
  let paidPrice: Price.Record
  let freeSubscription: Subscription.Record
  let checkoutSession: CheckoutSession.Record
  let purchase: Purchase.Record

  beforeEach(async () => {
    // Set up organization
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    // Create customer
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
      email: `test_${core.nanoid()}@example.com`,
      livemode: true,
    })

    // Create payment method
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    // Create free product and price
    freeProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Free Plan',
      livemode: true,
    })

    freePrice = await setupPrice({
      productId: freeProduct.id,
      name: 'Free Price',
      type: PriceType.Subscription,
      unitPrice: 0,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      currency: CurrencyCode.USD,
    })

    // Create paid product and price
    paidProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Pro Plan',
      livemode: true,
    })

    paidPrice = await setupPrice({
      productId: paidProduct.id,
      name: 'Pro Price',
      type: PriceType.Subscription,
      unitPrice: 2900, // $29.00
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      currency: CurrencyCode.USD,
    })
  })

  describe('Default behavior (preserveBillingCycleAnchor = false)', () => {
    beforeEach(async () => {
      // Create free subscription with billing period mid-month
      const billingStart = new Date('2024-01-01')
      const billingEnd = new Date('2024-01-31')

      freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
        currentBillingPeriodStart: billingStart,
        currentBillingPeriodEnd: billingEnd,
        billingCycleAnchorDate: billingStart,
      })

      // Create checkout session without preserve flag (default)
      checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Open,
        livemode: true,
        priceId: paidPrice.id,
        quantity: 1,
        preserveBillingCycleAnchor: false, // Default behavior
      })

      // Create purchase
      purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        status: PurchaseStatus.Pending,
        livemode: true,
        priceId: paidPrice.id,
      })
    })

    it('should start new billing cycle from upgrade date', async () => {
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        await processSetupIntentSucceeded(setupIntent, transaction)
      })

      // Get the new subscription
      const subscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )

      const paidSubscription = subscriptions.find(
        (s) => s.status === SubscriptionStatus.Active && !s.isFreePlan
      )

      expect(paidSubscription).toBeDefined()
      // The billing cycle anchor should be the upgrade date (today)
      const today = new Date()
      expect(
        paidSubscription!.billingCycleAnchorDate?.toDateString()
      ).toBe(today.toDateString())
      // Should not match the old free subscription's anchor
      expect(
        paidSubscription!.billingCycleAnchorDate?.toDateString()
      ).not.toBe(
        freeSubscription.billingCycleAnchorDate?.toDateString()
      )
    })

    it('should charge full monthly price immediately', async () => {
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        await processSetupIntentSucceeded(setupIntent, transaction)
      })

      // Get billing period items
      const paidSubscription = await adminTransaction(
        async ({ transaction }) => {
          const subs = await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
          return subs.find(
            (s) =>
              s.status === SubscriptionStatus.Active && !s.isFreePlan
          )
        }
      )

      const billingPeriod = await adminTransaction(
        async ({ transaction }) => {
          return await selectCurrentBillingPeriodForSubscription(
            paidSubscription!.id,
            transaction
          )
        }
      )

      const billingPeriodItems = await adminTransaction(
        async ({ transaction }) => {
          return await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod!.id },
            transaction
          )
        }
      )

      // Should have full price, not prorated
      expect(billingPeriodItems).toHaveLength(1)
      expect(billingPeriodItems[0].unitPrice).toBe(
        paidPrice.unitPrice
      )
      expect(billingPeriodItems[0].name).not.toContain('Prorated')
    })

    it('should not create prorated billing items', async () => {
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        await processSetupIntentSucceeded(setupIntent, transaction)
      })

      const paidSubscription = await adminTransaction(
        async ({ transaction }) => {
          const subs = await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
          return subs.find(
            (s) =>
              s.status === SubscriptionStatus.Active && !s.isFreePlan
          )
        }
      )

      const billingPeriod = await adminTransaction(
        async ({ transaction }) => {
          return await selectCurrentBillingPeriodForSubscription(
            paidSubscription!.id,
            transaction
          )
        }
      )

      const billingPeriodItems = await adminTransaction(
        async ({ transaction }) => {
          return await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod!.id },
            transaction
          )
        }
      )

      // Verify no prorated items
      const proratedItems = billingPeriodItems.filter((item) =>
        item.name?.includes('Prorated')
      )
      expect(proratedItems).toHaveLength(0)
    })
  })

  describe('Preserved billing cycle (preserveBillingCycleAnchor = true)', () => {
    beforeEach(async () => {
      // Create free subscription with billing period in the future
      const today = new Date()
      const billingStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )
      const billingEnd = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0
      )

      freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
        currentBillingPeriodStart: billingStart,
        currentBillingPeriodEnd: billingEnd,
        billingCycleAnchorDate: billingStart,
      })

      // Create checkout session WITH preserve flag
      checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Open,
        livemode: true,
        priceId: paidPrice.id,
        quantity: 1,
        preserveBillingCycleAnchor: true, // Preserve billing cycle
      })

      // Create purchase
      purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        status: PurchaseStatus.Pending,
        livemode: true,
        priceId: paidPrice.id,
      })
    })

    it('should maintain original billing cycle anchor date', async () => {
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        await processSetupIntentSucceeded(setupIntent, transaction)
      })

      const paidSubscription = await adminTransaction(
        async ({ transaction }) => {
          const subs = await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
          return subs.find(
            (s) =>
              s.status === SubscriptionStatus.Active && !s.isFreePlan
          )
        }
      )

      // Should preserve the original anchor date
      expect(
        paidSubscription!.billingCycleAnchorDate?.toDateString()
      ).toBe(freeSubscription.billingCycleAnchorDate?.toDateString())
    })

    it('should preserve billing period end date', async () => {
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        await processSetupIntentSucceeded(setupIntent, transaction)
      })

      const paidSubscription = await adminTransaction(
        async ({ transaction }) => {
          const subs = await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
          return subs.find(
            (s) =>
              s.status === SubscriptionStatus.Active && !s.isFreePlan
          )
        }
      )

      // Should preserve the original period end date
      expect(
        paidSubscription!.currentBillingPeriodEnd?.toDateString()
      ).toBe(freeSubscription.currentBillingPeriodEnd?.toDateString())
    })

    it('should create prorated billing items when preserving billing cycle', async () => {
      // Use the free subscription set up in beforeEach
      const today = new Date()
      const endOfMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0
      )

      // Only run this test if we're not at the start or end of month
      if (
        today.getDate() === 1 ||
        today.getDate() === endOfMonth.getDate()
      ) {
        // Skip test if we're at month boundary
        return
      }

      checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Open,
        livemode: true,
        priceId: paidPrice.id,
        quantity: 1,
        preserveBillingCycleAnchor: true,
      })

      purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        status: PurchaseStatus.Pending,
        livemode: true,
        priceId: paidPrice.id,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        await processSetupIntentSucceeded(setupIntent, transaction)
      })

      const paidSubscription = await adminTransaction(
        async ({ transaction }) => {
          const subs = await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
          return subs.find(
            (s) =>
              s.status === SubscriptionStatus.Active && !s.isFreePlan
          )
        }
      )

      const billingPeriod = await adminTransaction(
        async ({ transaction }) => {
          return await selectCurrentBillingPeriodForSubscription(
            paidSubscription!.id,
            transaction
          )
        }
      )

      const billingPeriodItems = await adminTransaction(
        async ({ transaction }) => {
          return await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod!.id },
            transaction
          )
        }
      )

      // Should have prorated items
      expect(billingPeriodItems.length).toBeGreaterThan(0)
      const proratedItem = billingPeriodItems.find((item) =>
        item.name?.includes('Prorated')
      )
      expect(proratedItem).toBeDefined()

      // Prorated amount should be less than full price
      expect(proratedItem!.unitPrice).toBeLessThan(
        paidPrice.unitPrice
      )
      expect(proratedItem!.unitPrice).toBeGreaterThan(0)

      // Description should mention proration
      expect(proratedItem!.description).toContain('Prorated charge')
      expect(proratedItem!.description).toContain('%')
    })
  })

  describe('Edge cases', () => {
    it('should handle upgrade on billing period boundary', async () => {
      // Create subscription that ends today
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
        currentBillingPeriodStart: yesterday,
        currentBillingPeriodEnd: today,
        billingCycleAnchorDate: yesterday,
      })

      checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Open,
        livemode: true,
        priceId: paidPrice.id,
        quantity: 1,
        preserveBillingCycleAnchor: true,
      })

      purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        status: PurchaseStatus.Pending,
        livemode: true,
        priceId: paidPrice.id,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        await processSetupIntentSucceeded(setupIntent, transaction)
      })

      const paidSubscription = await adminTransaction(
        async ({ transaction }) => {
          const subs = await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
          return subs.find(
            (s) =>
              s.status === SubscriptionStatus.Active && !s.isFreePlan
          )
        }
      )

      const billingPeriod = await adminTransaction(
        async ({ transaction }) => {
          return await selectCurrentBillingPeriodForSubscription(
            paidSubscription!.id,
            transaction
          )
        }
      )

      const billingPeriodItems = await adminTransaction(
        async ({ transaction }) => {
          return await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod!.id },
            transaction
          )
        }
      )

      // Should charge full price when upgrade is at period boundary
      const proratedItems = billingPeriodItems.filter((item) =>
        item.name?.includes('Prorated')
      )
      expect(proratedItems).toHaveLength(0)
    })
  })
})
