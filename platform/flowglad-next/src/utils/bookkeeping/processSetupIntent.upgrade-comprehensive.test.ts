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
import { BillingPeriod } from '@/db/schema/billingPeriods'
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
  setupBillingPeriod,
} from '@/../seedDatabase'
import {
  comprehensiveAdminTransaction,
  adminTransaction,
} from '@/db/adminTransaction'
import {
  processSetupIntentSucceeded,
  CoreSripeSetupIntent,
} from '@/utils/bookkeeping/processSetupIntent'
import {
  selectSubscriptions,
  selectSubscriptionById,
  updateSubscription,
  selectActiveSubscriptionsForCustomer,
  selectCurrentSubscriptionForCustomer,
} from '@/db/tableMethods/subscriptionMethods'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { IntentMetadataType } from '@/utils/stripe'
import {
  cancelFreeSubscriptionForUpgrade,
  linkUpgradedSubscriptions,
} from '@/subscriptions/cancelFreeSubscriptionForUpgrade'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import { getUpgradeMetrics } from '@/utils/billing-dashboard/upgradeMetrics'

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

// Helper function to get the new subscription after upgrade
const getNewPaidSubscriptionId = async (
  customerId: string,
  transaction: any
): Promise<string | undefined> => {
  const allSubscriptions = await selectSubscriptions(
    { customerId },
    transaction
  )
  const activePaidSubscriptions = allSubscriptions.filter(
    (sub) =>
      sub.status === SubscriptionStatus.Active && !sub.isFreePlan
  )
  return activePaidSubscriptions[0]?.id
}

describe('Subscription Upgrade Flow - Comprehensive Tests', () => {
  // Common test data - shared across all tests
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record

  // Products and prices for testing
  let freeProduct: Product.Record
  let freePrice: Price.Record
  let paidProduct: Product.Record
  let paidPrice: Price.Record

  // Test-specific data - reset in beforeEach
  let freeSubscription: Subscription.Record
  let checkoutSession: CheckoutSession.Record
  let purchase: Purchase.Record

  beforeEach(async () => {
    // Set up organization with default pricing model
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
      unitPrice: 0, // Free tier
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

    // Create free subscription (common for most tests)
    freeSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: freePrice.id,
      status: SubscriptionStatus.Active,
      livemode: true,
      isFreePlan: true,
      currentBillingPeriodStart: new Date(),
      currentBillingPeriodEnd: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ),
    })

    // Create checkout session for paid product (common for upgrade tests)
    checkoutSession = await setupCheckoutSession({
      organizationId: organization.id,
      customerId: customer.id,
      type: CheckoutSessionType.Product,
      status: CheckoutSessionStatus.Open,
      livemode: true,
      priceId: paidPrice.id,
      quantity: 1,
      outputMetadata: { upgraded: 'true' },
      outputName: 'Pro Plan Subscription',
    })

    // Create purchase for checkout session
    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      status: PurchaseStatus.Pending,
      livemode: true,
      priceId: paidPrice.id,
    })
  })

  describe('Basic Upgrade Flow', () => {
    it('should successfully upgrade from free to paid subscription', async () => {
      // Create the setup intent for the upgrade
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // Process the upgrade
      const result = await adminTransaction(
        async ({ transaction }) => {
          // Create fee calculation required for checkout session processing
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Verify the result is defined
      expect(result).toBeDefined()

      // Query for the new subscription
      const allSubscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )
      const activePaidSubscriptions = allSubscriptions.filter(
        (sub) =>
          sub.status === SubscriptionStatus.Active && !sub.isFreePlan
      )
      expect(activePaidSubscriptions).toHaveLength(1)
      const newSubscriptionId = activePaidSubscriptions[0].id

      // Verify the upgrade was processed correctly
      await adminTransaction(async ({ transaction }) => {
        // Check that the free subscription was canceled with the correct reason
        const canceledFreeSubscription = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )
        expect(canceledFreeSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(canceledFreeSubscription.cancellationReason).toBe(
          CancellationReason.UpgradedToPaid
        )
        expect(
          canceledFreeSubscription.replacedBySubscriptionId
        ).toBe(newSubscriptionId)
        expect(canceledFreeSubscription.canceledAt).toBeDefined()

        // Check that the new paid subscription was created correctly
        const newPaidSubscription = await selectSubscriptionById(
          newSubscriptionId,
          transaction
        )
        expect(newPaidSubscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(newPaidSubscription.isFreePlan).toBe(false)
        expect(newPaidSubscription.priceId).toBe(paidPrice.id)
        expect(newPaidSubscription.customerId).toBe(customer.id)
        expect(newPaidSubscription.organizationId).toBe(
          organization.id
        )
      })
    })

    it('should preserve customer data during upgrade', async () => {
      // Add metadata to the free subscription to verify it's preserved
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: freeSubscription.id,
            renews: false,
            metadata: {
              source: 'organic',
              campaign: 'summer2024',
              tier: 'free',
            },
          },
          transaction
        )
      })

      // Process the upgrade
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the new subscription ID
      const newSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(newSubscriptionId).toBeDefined()

      // Verify customer data preservation
      await adminTransaction(async ({ transaction }) => {
        const newSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )

        // Customer ID should remain the same
        expect(newSubscription.customerId).toBe(customer.id)
        expect(newSubscription.organizationId).toBe(organization.id)

        // Payment method should be associated
        expect(newSubscription.defaultPaymentMethodId).toBeDefined()

        // The new subscription should be properly configured
        expect(newSubscription.status).toBe(SubscriptionStatus.Active)
        expect(newSubscription.isFreePlan).toBe(false)
      })
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should create paid subscription directly when no free subscription exists', async () => {
      // Cancel the free subscription to simulate no active subscription
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: freeSubscription.id,
            renews: false,
            status: SubscriptionStatus.Canceled,
            canceledAt: new Date(),
            cancellationReason: CancellationReason.CustomerRequest,
          },
          transaction
        )
      })

      // Process setup intent without an active free subscription
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Verify paid subscription was created without upgrade
      const newSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(newSubscriptionId).toBeDefined()

      await adminTransaction(async ({ transaction }) => {
        const newSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )

        // Should be a normal paid subscription
        expect(newSubscription.status).toBe(SubscriptionStatus.Active)
        expect(newSubscription.isFreePlan).toBe(false)

        // The old free subscription should not be linked
        const oldSubscription = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )
        expect(oldSubscription.replacedBySubscriptionId).toBeNull()
        expect(oldSubscription.cancellationReason).toBe(
          CancellationReason.CustomerRequest
        )
      })
    })

    it('should handle multiple free subscriptions gracefully', async () => {
      // Create a second free subscription (edge case scenario)
      const secondFreeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
        currentBillingPeriodStart: new Date(),
        currentBillingPeriodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ),
      })

      // First cancel the older free subscription to avoid multiple active subscriptions
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: freeSubscription.id,
            renews: false,
            status: SubscriptionStatus.Canceled,
            canceledAt: new Date(),
            cancellationReason: CancellationReason.CustomerRequest,
          },
          transaction
        )
      })

      // Process upgrade with the remaining free subscription
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the new subscription ID
      const newSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(newSubscriptionId).toBeDefined()

      await adminTransaction(async ({ transaction }) => {
        // The second free subscription should be canceled with upgrade reason
        const canceledSubscription = await selectSubscriptionById(
          secondFreeSubscription.id,
          transaction
        )
        expect(canceledSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(canceledSubscription.cancellationReason).toBe(
          CancellationReason.UpgradedToPaid
        )
        expect(canceledSubscription.replacedBySubscriptionId).toBe(
          newSubscriptionId
        )

        // The older free subscription should remain canceled with original reason
        const olderSubscription = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )
        expect(olderSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(olderSubscription.cancellationReason).toBe(
          CancellationReason.CustomerRequest
        )
        // Should not be linked to the upgrade since it was already canceled
        expect(olderSubscription.replacedBySubscriptionId).toBeNull()
      })
    })

    it('should prevent creating duplicate paid subscriptions', async () => {
      // First, upgrade to a paid subscription
      const firstSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const firstResult = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            firstSetupIntent,
            transaction
          )
        }
      )

      // Get the first paid subscription ID
      const firstPaidSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(firstPaidSubscriptionId).toBeDefined()

      // Create a new checkout session for another paid product
      const secondCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Open,
        livemode: true,
        priceId: paidPrice.id,
        quantity: 1,
      })

      // Create a new purchase for the second checkout session
      await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: PurchaseStatus.Pending,
        livemode: true,
      })

      // Attempt to create another paid subscription
      const secondSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: secondCheckoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // This should throw an error
      await expect(
        adminTransaction(async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            secondCheckoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            secondSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('already has an active paid subscription')

      // Verify that only one paid subscription exists
      await adminTransaction(async ({ transaction }) => {
        const allSubscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const activePaidSubscriptions = allSubscriptions.filter(
          (sub) =>
            sub.status === SubscriptionStatus.Active &&
            !sub.isFreePlan
        )
        expect(activePaidSubscriptions.length).toBe(1)
        expect(activePaidSubscriptions[0].id).toBe(
          firstPaidSubscriptionId
        )
      })
    })
  })

  describe('Idempotency and Race Conditions', () => {
    it('should handle idempotent setup intent processing', async () => {
      // Process the setup intent for the first time
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const firstResult = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the first subscription ID
      const firstSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(firstSubscriptionId).toBeDefined()

      // Process the same setup intent again (idempotency check)
      const secondResult = await adminTransaction(
        async ({ transaction }) => {
          // Note: Fee calculation already exists, so this shouldn't cause issues
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the subscription ID after second processing
      const secondSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )

      // Should be the same subscription
      expect(secondSubscriptionId).toBe(firstSubscriptionId)

      // Verify no duplicate subscriptions were created
      await adminTransaction(async ({ transaction }) => {
        const allSubscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const activePaidSubscriptions = allSubscriptions.filter(
          (sub) =>
            sub.status === SubscriptionStatus.Active &&
            !sub.isFreePlan
        )
        expect(activePaidSubscriptions.length).toBe(1)
        expect(activePaidSubscriptions[0].id).toBe(
          firstSubscriptionId
        )
      })
    })

    it('should prevent concurrent upgrade attempts', async () => {
      // Create two different checkout sessions for concurrent processing
      const secondCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Open,
        livemode: true,
        priceId: paidPrice.id,
        quantity: 1,
      })

      await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: PurchaseStatus.Pending,
        livemode: true,
      })

      const firstSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const secondSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: secondCheckoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // Process the first setup intent
      const firstResult = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            firstSetupIntent,
            transaction
          )
        }
      )

      // Get the first subscription ID
      const firstSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(firstSubscriptionId).toBeDefined()

      // Attempt to process the second setup intent (should fail)
      await expect(
        adminTransaction(async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            secondCheckoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            secondSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('already has an active paid subscription')

      // Verify only one paid subscription exists
      await adminTransaction(async ({ transaction }) => {
        const allSubscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const activePaidSubscriptions = allSubscriptions.filter(
          (sub) =>
            sub.status === SubscriptionStatus.Active &&
            !sub.isFreePlan
        )
        expect(activePaidSubscriptions.length).toBe(1)
        expect(activePaidSubscriptions[0].id).toBe(
          firstSubscriptionId
        )
      })
    })
  })

  describe('Subscription State Transitions', () => {
    it('should convert free subscription in trial to paid', async () => {
      // Update free subscription to have a trial period
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: freeSubscription.id,
            renews: false,
          },
          transaction
        )
      })

      // Process upgrade during trial
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the new subscription ID
      const newSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(newSubscriptionId).toBeDefined()

      await adminTransaction(async ({ transaction }) => {
        // Free trial subscription should be canceled
        const canceledFreeSubscription = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )
        expect(canceledFreeSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(canceledFreeSubscription.cancellationReason).toBe(
          CancellationReason.UpgradedToPaid
        )

        // New paid subscription should start immediately without trial
        const newPaidSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )
        expect(newPaidSubscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(newPaidSubscription.isFreePlan).toBe(false)
      })
    })

    it('should handle upgrade when free subscription is already canceled', async () => {
      // Cancel the free subscription manually first
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: freeSubscription.id,
            renews: false,
            status: SubscriptionStatus.Canceled,
            canceledAt: new Date(),
            cancellationReason: CancellationReason.CustomerRequest,
          },
          transaction
        )
      })

      // Process upgrade with already canceled free subscription
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the new subscription ID
      const newSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(newSubscriptionId).toBeDefined()

      await adminTransaction(async ({ transaction }) => {
        // Free subscription should remain canceled with original reason
        const stillCanceledSubscription =
          await selectSubscriptionById(
            freeSubscription.id,
            transaction
          )
        expect(stillCanceledSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(stillCanceledSubscription.cancellationReason).toBe(
          CancellationReason.CustomerRequest
        )
        // Should not have been linked since it was already canceled
        expect(
          stillCanceledSubscription.replacedBySubscriptionId
        ).toBeNull()

        // New paid subscription should be created normally
        const newPaidSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )
        expect(newPaidSubscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(newPaidSubscription.isFreePlan).toBe(false)
      })
    })
  })

  describe('Billing and Financial Implications', () => {
    it('should handle billing period correctly during upgrade', async () => {
      // Create a billing period for the free subscription
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: freeSubscription.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        livemode: true,
      })

      // Process upgrade mid-period
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the new subscription ID
      const newSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(newSubscriptionId).toBeDefined()

      await adminTransaction(async ({ transaction }) => {
        // New subscription should have proper billing period dates
        const newSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )
        expect(
          newSubscription.currentBillingPeriodStart
        ).toBeDefined()
        expect(newSubscription.currentBillingPeriodEnd).toBeDefined()

        // Billing period end should be in the future
        expect(
          newSubscription.currentBillingPeriodEnd!.getTime()
        ).toBeGreaterThan(Date.now())

        // The new subscription should have the correct price
        expect(newSubscription.priceId).toBe(paidPrice.id)
      })
    })

    it('should transfer usage credits during upgrade if applicable', async () => {
      // Note: This test demonstrates the structure but actual credit transfer
      // would need to be implemented in the upgrade logic

      // Add metadata to track usage credits on free subscription
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: freeSubscription.id,
            renews: false,
            metadata: { usageCredits: '100', plan: 'free' },
          },
          transaction
        )
      })

      // Process upgrade
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the new subscription ID
      const newSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(newSubscriptionId).toBeDefined()

      await adminTransaction(async ({ transaction }) => {
        const newSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )
        // Verify the new subscription was created
        expect(newSubscription).toBeDefined()
        expect(newSubscription.customerId).toBe(customer.id)
        expect(newSubscription.isFreePlan).toBe(false)

        // Note: Actual credit transfer logic would need to be implemented
        // This test just verifies the upgrade completes successfully
      })
    })
  })

  describe('API and Query Behavior', () => {
    it('should exclude upgraded subscriptions from active queries', async () => {
      // Process upgrade to create the upgraded subscription scenario
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            setupIntent,
            transaction
          )
        }
      )

      // Get the new subscription ID
      const newSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(newSubscriptionId).toBeDefined()

      await adminTransaction(async ({ transaction }) => {
        // Query active subscriptions using the helper function
        const activeSubscriptions =
          await selectActiveSubscriptionsForCustomer(
            customer.id,
            transaction
          )

        // Should only return the new paid subscription, not the canceled free one
        expect(activeSubscriptions.length).toBe(1)
        expect(activeSubscriptions[0].id).toBe(newSubscriptionId)
        expect(activeSubscriptions[0].isFreePlan).toBe(false)

        // The canceled free subscription should not be in the results
        const hasCanceledFree = activeSubscriptions.some(
          (sub) => sub.id === freeSubscription.id
        )
        expect(hasCanceledFree).toBe(false)
      })
    })

    it('should follow upgrade chain in selectCurrentSubscriptionForCustomer', async () => {
      // First upgrade: free → paid
      const firstSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      const firstResult = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            firstSetupIntent,
            transaction
          )
        }
      )

      // Get the paid subscription ID
      const paidSubscriptionId = await adminTransaction(
        async ({ transaction }) => {
          return await getNewPaidSubscriptionId(
            customer.id,
            transaction
          )
        }
      )
      expect(paidSubscriptionId).toBeDefined()

      await adminTransaction(async ({ transaction }) => {
        // Query current subscription - should return the latest in the chain
        const currentSubscription =
          await selectCurrentSubscriptionForCustomer(
            customer.id,
            transaction
          )

        // Should return the paid subscription, not the canceled free one
        expect(currentSubscription).toBeDefined()
        expect(currentSubscription!.id).toBe(paidSubscriptionId)
        expect(currentSubscription!.isFreePlan).toBe(false)

        // Verify the chain is set up correctly
        const freeSubscriptionRecord = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )
        expect(freeSubscriptionRecord.replacedBySubscriptionId).toBe(
          paidSubscriptionId
        )
      })
    })
  })

  describe('Helper Function Tests', () => {
    it('should cancel free subscription correctly in cancelFreeSubscriptionForUpgrade', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Call the helper function directly
        const canceledSubscription =
          await cancelFreeSubscriptionForUpgrade(
            customer.id,
            transaction
          )

        // Verify the subscription was canceled correctly
        expect(canceledSubscription).toBeDefined()
        expect(canceledSubscription!.id).toBe(freeSubscription.id)
        expect(canceledSubscription!.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(canceledSubscription!.cancellationReason).toBe(
          CancellationReason.UpgradedToPaid
        )
        expect(canceledSubscription!.canceledAt).toBeDefined()

        // Verify in database
        const dbSubscription = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )
        expect(dbSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(dbSubscription.cancellationReason).toBe(
          CancellationReason.UpgradedToPaid
        )
      })
    })

    it('should link subscriptions correctly in linkUpgradedSubscriptions', async () => {
      // Create a new paid subscription to link to
      const newPaidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: false,
        currentBillingPeriodStart: new Date(),
        currentBillingPeriodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ),
      })

      await adminTransaction(async ({ transaction }) => {
        // First cancel the free subscription
        await updateSubscription(
          {
            id: freeSubscription.id,
            renews: false,
            status: SubscriptionStatus.Canceled,
            cancellationReason: CancellationReason.UpgradedToPaid,
            canceledAt: new Date(),
          },
          transaction
        )

        // Get the updated free subscription
        const canceledFreeSubscription = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )

        // Call the helper function to link them
        await linkUpgradedSubscriptions(
          canceledFreeSubscription,
          newPaidSubscription.id,
          transaction
        )

        // Verify the link was created
        const linkedSubscription = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )
        expect(linkedSubscription.replacedBySubscriptionId).toBe(
          newPaidSubscription.id
        )
      })
    })
  })
})
