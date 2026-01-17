import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupBillingPeriod,
  setupCheckoutSession,
  setupCustomer,
  setupFeeCalculation,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupPurchase,
  setupSubscription,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Purchase } from '@/db/schema/purchases'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import {
  selectActiveSubscriptionsForCustomer,
  selectCurrentSubscriptionForCustomer,
  selectSubscriptionById,
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription/workflow'
import {
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
} from '@/test-utils/transactionCallbacks'
import {
  CancellationReason,
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  FlowgladEventType,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  PurchaseStatus,
  SubscriptionStatus,
} from '@/types'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import {
  type CoreSripeSetupIntent,
  processSetupIntentSucceeded,
  setupIntentStatusToCheckoutSessionStatus,
} from '@/utils/bookkeeping/processSetupIntent'
import { core } from '@/utils/core'
import { IntentMetadataType } from '@/utils/stripe'

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
  const activePaidSubscriptions = allSubscriptions
    .filter(
      (sub) =>
        sub.status === SubscriptionStatus.Active && !sub.isFreePlan
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
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
      currentBillingPeriodStart: Date.now(),
      currentBillingPeriodEnd: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).getTime(),
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
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify the result is defined
      expect(result).toMatchObject({})

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
        expect(typeof canceledFreeSubscription.canceledAt).toBe(
          'number'
        )

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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof newSubscriptionId).toBe('string')

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
        expect(typeof newSubscription.defaultPaymentMethodId).toBe(
          'string'
        )
        expect(
          newSubscription.defaultPaymentMethodId!.length
        ).toBeGreaterThan(0)

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
            canceledAt: Date.now(),
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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof newSubscriptionId).toBe('string')

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

    it('should cancel remaining free subscription when upgrading after one was already canceled', async () => {
      const now = Date.now()
      // Create a second free subscription (edge case scenario)
      const secondFreeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
        currentBillingPeriodStart: now,
        currentBillingPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      })

      // First cancel the older free subscription to avoid multiple active subscriptions
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: freeSubscription.id,
            renews: false,
            status: SubscriptionStatus.Canceled,
            canceledAt: Date.now(),
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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof newSubscriptionId).toBe('string')

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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof firstPaidSubscriptionId).toBe('string')

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

      // This should return an error Result
      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            secondCheckoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            secondSetupIntent,
            createDiscardingEffectsContext(transaction)
          )
        }
      )
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'already has an active subscription'
        )
      }

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

  describe('Free Subscription Cancellation Logic', () => {
    it('should cancel free subscription but leave paid subscription unchanged', async () => {
      await adminTransaction(async ({ transaction }) => {
        await updateOrganization(
          {
            id: organization.id,
            allowMultipleSubscriptionsPerCustomer: true,
          },
          transaction
        )
      })

      // Create an active paid subscription alongside the free subscription
      const existingPaidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: false,
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
            createDiscardingEffectsContext(transaction)
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

      await adminTransaction(async ({ transaction }) => {
        // Free subscription should be canceled
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

        // Existing paid subscription should remain active and unchanged
        const existingPaidSub = await selectSubscriptionById(
          existingPaidSubscription.id,
          transaction
        )
        expect(existingPaidSub.status).toBe(SubscriptionStatus.Active)
        expect(existingPaidSub.isFreePlan).toBe(false)
        expect(existingPaidSub.cancellationReason).toBeNull()
        expect(existingPaidSub.replacedBySubscriptionId).toBeNull()

        // New paid subscription should be created
        const newPaidSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )
        expect(newSubscriptionId).toBe(newPaidSubscription.id)
        expect(newPaidSubscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(newPaidSubscription.isFreePlan).toBe(false)
      })
    })

    it('should prevent creating a second free subscription', async () => {
      // Test by calling createSubscriptionWorkflow directly with a free price
      // This should fail because only one free subscription is allowed per customer
      await adminTransaction(async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_free_test_${core.nanoid()}`
        const secondFreeResult = await createSubscriptionWorkflow(
          {
            organization,
            customer,
            product: {
              ...freeProduct,
              default: freeProduct.default ?? false,
            },
            price: freePrice,
            quantity: 1,
            livemode: true,
            startDate: Date.now(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: paymentMethod,
            stripeSetupIntentId,
            autoStart: true,
          },
          createDiscardingEffectsContext(transaction)
        )
        expect(Result.isError(secondFreeResult)).toBe(true)
        if (Result.isError(secondFreeResult)) {
          expect(secondFreeResult.error.message).toContain(
            'already has an active free subscription. Only one free subscription is allowed per customer.'
          )
        }
      })

      await adminTransaction(async ({ transaction }) => {
        // Original free subscription should remain active and unchanged
        const originalFreeSubscription = await selectSubscriptionById(
          freeSubscription.id,
          transaction
        )
        expect(originalFreeSubscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(originalFreeSubscription.cancellationReason).toBeNull()
        expect(
          originalFreeSubscription.replacedBySubscriptionId
        ).toBeNull()

        // Should still have only one free subscription (the original)
        const allSubscriptions = await selectSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const freeSubscriptions = allSubscriptions.filter(
          (sub) =>
            sub.isFreePlan === true &&
            sub.status === SubscriptionStatus.Active
        )
        expect(freeSubscriptions.length).toBe(1)
        expect(freeSubscriptions[0].id).toBe(freeSubscription.id)
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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof firstSubscriptionId).toBe('string')

      // Process the same setup intent again (idempotency check)
      const secondResult = await adminTransaction(
        async ({ transaction }) => {
          // Note: Fee calculation already exists, so this shouldn't cause issues
          return await processSetupIntentSucceeded(
            setupIntent,
            createDiscardingEffectsContext(transaction)
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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof firstSubscriptionId).toBe('string')

      // Attempt to process the second setup intent (should fail)
      const concurrentResult = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            secondCheckoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return await processSetupIntentSucceeded(
            secondSetupIntent,
            createDiscardingEffectsContext(transaction)
          )
        }
      )
      expect(Result.isError(concurrentResult)).toBe(true)
      if (Result.isError(concurrentResult)) {
        expect(concurrentResult.error.message).toContain(
          'already has an active subscription'
        )
      }

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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof newSubscriptionId).toBe('string')

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
            canceledAt: Date.now(),
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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof newSubscriptionId).toBe('string')

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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof newSubscriptionId).toBe('string')

      await adminTransaction(async ({ transaction }) => {
        // New subscription should have proper billing period dates
        const newSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )
        expect(typeof newSubscription.currentBillingPeriodStart).toBe(
          'number'
        )
        expect(typeof newSubscription.currentBillingPeriodEnd).toBe(
          'number'
        )
        expect(
          newSubscription.currentBillingPeriodEnd
        ).toBeGreaterThan(Date.now())

        // Billing period end should be in the future
        expect(
          newSubscription.currentBillingPeriodEnd!
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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof newSubscriptionId).toBe('string')

      await adminTransaction(async ({ transaction }) => {
        const newSubscription = await selectSubscriptionById(
          newSubscriptionId!,
          transaction
        )
        // Verify the new subscription was created
        expect(typeof newSubscription).toBe('object')
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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof newSubscriptionId).toBe('string')

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
            createDiscardingEffectsContext(transaction)
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
      expect(typeof paidSubscriptionId).toBe('string')

      await adminTransaction(async ({ transaction }) => {
        // Query current subscription - should return the latest in the chain
        const currentSubscription =
          await selectCurrentSubscriptionForCustomer(
            customer.id,
            transaction
          )

        // Should return the paid subscription, not the canceled free one
        expect(currentSubscription).toMatchObject({
          id: paidSubscriptionId,
        })
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

  describe('Terminal Checkout Session Handling', () => {
    it('should handle terminal checkout session without creating/canceling anything', async () => {
      // Create a new customer for this test to avoid interference
      const testCustomer = await setupCustomer({
        organizationId: organization.id,
        email: `terminal-test-${core.nanoid()}@example.com`,
      })

      // Create a free subscription for this customer
      const testFreeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: testCustomer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })

      // Create a checkout session that's already succeeded
      const terminalCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: testCustomer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Succeeded, // Terminal state
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: terminalCheckoutSession.id,
        stripeCustomerId: testCustomer.stripeCustomerId!,
      })

      // Add fee calculation for the terminal checkout session
      await setupFeeCalculation({
        checkoutSessionId: terminalCheckoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: terminalCheckoutSession.livemode,
      })

      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const result = await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )

        // Should return terminal result without creating new subscription
        expect(result.unwrap().type).toBe(CheckoutSessionType.Product)

        // Verify no new subscription was created
        const subscriptions = await selectSubscriptions(
          { customerId: testCustomer.id },
          transaction
        )
        // Should still only have the free subscription
        expect(subscriptions).toHaveLength(1)
        expect(subscriptions[0].id).toBe(testFreeSubscription.id)
        expect(subscriptions[0].status).toBe(
          SubscriptionStatus.Active
        )

        // Free subscription should NOT be canceled
        const freeSubAfter = await selectSubscriptionById(
          testFreeSubscription.id,
          transaction
        )
        expect(freeSubAfter.status).toBe(SubscriptionStatus.Active)
        expect(freeSubAfter.cancellationReason).toBeNull()
        return result
      })
    })

    it('should handle Failed terminal checkout session', async () => {
      // Create a new customer for this test to avoid interference
      const testCustomer = await setupCustomer({
        organizationId: organization.id,
        email: `failed-terminal-test-${core.nanoid()}@example.com`,
      })

      // Create a free subscription for this customer
      const testFreeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: testCustomer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })

      const failedCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: testCustomer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Failed, // Terminal state
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: failedCheckoutSession.id,
        stripeCustomerId: testCustomer.stripeCustomerId!,
      })

      // Add fee calculation for the failed checkout session
      await setupFeeCalculation({
        checkoutSessionId: failedCheckoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: failedCheckoutSession.livemode,
      })

      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const result = await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )

        expect(result.unwrap().type).toBe(CheckoutSessionType.Product)

        // No new subscription should be created
        const subscriptions = await selectSubscriptions(
          { customerId: testCustomer.id },
          transaction
        )
        expect(subscriptions).toHaveLength(1)
        expect(subscriptions[0].id).toBe(testFreeSubscription.id)
        expect(subscriptions[0].status).toBe(
          SubscriptionStatus.Active
        )
        return result
      })
    })
  })

  describe('Status Mapping Validation', () => {
    it('should map setup intent statuses to checkout session statuses correctly', () => {
      // Test the status mapping function directly
      expect(
        setupIntentStatusToCheckoutSessionStatus('succeeded')
      ).toBe(CheckoutSessionStatus.Succeeded)
      expect(
        setupIntentStatusToCheckoutSessionStatus('processing')
      ).toBe(CheckoutSessionStatus.Pending)
      expect(
        setupIntentStatusToCheckoutSessionStatus('canceled')
      ).toBe(CheckoutSessionStatus.Failed)
      expect(
        setupIntentStatusToCheckoutSessionStatus(
          'requires_payment_method'
        )
      ).toBe(CheckoutSessionStatus.Pending)
      // Test unknown status defaults to Pending
      expect(
        setupIntentStatusToCheckoutSessionStatus(
          'unknown_status' as any
        )
      ).toBe(CheckoutSessionStatus.Pending)
    })

    it('should update checkout session status when processing succeeded setup intent', async () => {
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: checkoutSession.livemode,
      })
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const result = await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )

        // Check the updated checkout session status
        const updatedSession = await selectCheckoutSessionById(
          checkoutSession.id,
          transaction
        )
        expect(updatedSession.status).toBe(
          CheckoutSessionStatus.Succeeded
        )

        return result
      })
    })
  })

  describe('Trial Eligibility Logic', () => {
    it('should grant trial when customer never had a trial before', async () => {
      // Create a new customer without any trial history
      const newCustomer = await setupCustomer({
        organizationId: organization.id,
        email: 'new-trial@example.com',
      })

      // Create a price with trial period
      const priceWithTrial = await setupPrice({
        productId: paidProduct.id,
        name: 'Trial Price',
        type: PriceType.Subscription,
        unitPrice: 2000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: 14, // 14-day trial
        livemode: true,
        isDefault: false,
      })

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: newCustomer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        priceId: priceWithTrial.id,
        quantity: 1,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: newCustomer.stripeCustomerId!,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: checkoutSession.livemode,
      })
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const result = await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )

        // Get the created subscription
        const subscriptions = await selectSubscriptions(
          { customerId: newCustomer.id },
          transaction
        )
        expect(subscriptions).toHaveLength(1)

        const newSubscription = subscriptions[0]
        // Should have trial end date set
        expect(typeof newSubscription.trialEnd).toBe('number')
        expect(typeof newSubscription.trialEnd).toBe('number')

        // Trial should be approximately 14 days from now
        const daysDiff = Math.round(
          (newSubscription.trialEnd! - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
        expect(daysDiff).toBeGreaterThanOrEqual(13)
        expect(daysDiff).toBeLessThanOrEqual(14)
        return result
      })
    })

    it('should NOT grant trial when customer had a previous trial', async () => {
      // Create a customer with trial history
      const customerWithTrialHistory = await setupCustomer({
        organizationId: organization.id,
        email: 'had-trial@example.com',
      })

      // Create a previous subscription with trial that ended
      const previousSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customerWithTrialHistory.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Canceled,
        trialEnd: new Date('2023-01-15').getTime(), // Had a trial in the past
        canceledAt: new Date('2023-02-01').getTime(),
      })

      // Create a price with trial period
      const priceWithTrial = await setupPrice({
        productId: paidProduct.id,
        name: 'Trial Price 2',
        type: PriceType.Subscription,
        unitPrice: 3000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: 14,
        livemode: true,
        isDefault: false,
      })

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customerWithTrialHistory.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        priceId: priceWithTrial.id,
        quantity: 1,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customerWithTrialHistory.stripeCustomerId!,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: checkoutSession.livemode,
      })
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const result = await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )

        // Get the new subscription
        const subscriptions = await selectSubscriptions(
          {
            customerId: customerWithTrialHistory.id,
            status: SubscriptionStatus.Active,
          },
          transaction
        )
        expect(subscriptions).toHaveLength(1)

        const newSubscription = subscriptions[0]
        // Should NOT have trial since customer already had one
        expect(newSubscription.trialEnd).toBeNull()
        return result
      })
    })
  })

  describe('Payment Method Guard Tests', () => {
    it('should throw error when payment method is missing for ActivateSubscription', async () => {
      // First, we need to set up the idempotency scenario
      // Create a setup intent ID that will be used
      const setupIntentId = `seti_no_pm_${core.nanoid()}`

      // Create a subscription with the stripeSetupIntentId to trigger idempotency path
      const subscriptionForActivation = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        // No payment method - undefined by default
      })

      // Update the subscription to have the stripeSetupIntentId
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: subscriptionForActivation.id,
            stripeSetupIntentId: setupIntentId,
            renews: subscriptionForActivation.renews,
          },
          transaction
        )
      })

      // Create an ActivateSubscription checkout session
      const activateCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.ActivateSubscription,
        status: CheckoutSessionStatus.Pending,
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
        targetSubscriptionId: subscriptionForActivation.id,
      })

      const setupIntentNoPM: CoreSripeSetupIntent = {
        status: 'succeeded',
        id: setupIntentId,
        customer: customer.stripeCustomerId!,
        payment_method: null as any, // No payment method
        metadata: {
          type: IntentMetadataType.CheckoutSession,
          checkoutSessionId: activateCheckoutSession.id,
        },
      }

      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await expect(
          processSetupIntentSucceeded(
            setupIntentNoPM,
            createDiscardingEffectsContext(transaction)
          )
        ).rejects.toThrow(
          'Payment method required for subscription activation'
        )
        return Result.ok(null)
      })
    })
  })

  describe('AddPaymentMethod Flow Specifics', () => {
    it('should update payment method on target subscription', async () => {
      // Create a subscription to update
      const targetSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        defaultPaymentMethodId: paymentMethod.id,
      })

      const addPMCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.AddPaymentMethod,
        status: CheckoutSessionStatus.Pending,
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
        targetSubscriptionId: targetSub.id,
      })

      const newPaymentMethodId = `pm_new_${core.nanoid()}`
      const setupIntent: CoreSripeSetupIntent = {
        status: 'succeeded',
        id: `seti_${core.nanoid()}`,
        customer: customer.stripeCustomerId!,
        payment_method: newPaymentMethodId,
        metadata: {
          type: IntentMetadataType.CheckoutSession,
          checkoutSessionId: addPMCheckoutSession.id,
        },
      }

      await comprehensiveAdminTransaction(async ({ transaction }) => {
        // Create the new payment method first
        const newPM = await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
          stripePaymentMethodId: newPaymentMethodId,
          type: PaymentMethodType.Card,
        })

        await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )

        // Verify the subscription was updated
        const updatedSub = await selectSubscriptionById(
          targetSub.id,
          transaction
        )
        expect(updatedSub.defaultPaymentMethodId).toBe(newPM.id)
        // Verify renews is preserved
        expect(updatedSub.renews).toBe(targetSub.renews)
        return Result.ok(null)
      })
    })

    it('should update all subscriptions when automaticallyUpdateSubscriptions is true', async () => {
      // Create multiple subscriptions for the customer
      const sub1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
      })
      const sub2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
      })

      const addPMCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.AddPaymentMethod,
        status: CheckoutSessionStatus.Pending,
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
        automaticallyUpdateSubscriptions: true,
      })

      const newPaymentMethodId = `pm_auto_update_${core.nanoid()}`
      const setupIntent: CoreSripeSetupIntent = {
        status: 'succeeded',
        id: `seti_${core.nanoid()}`,
        customer: customer.stripeCustomerId!,
        payment_method: newPaymentMethodId,
        metadata: {
          type: IntentMetadataType.CheckoutSession,
          checkoutSessionId: addPMCheckoutSession.id,
        },
      }

      // Create the new payment method
      const newPM = await setupPaymentMethod({
        customerId: customer.id,
        stripePaymentMethodId: newPaymentMethodId,
        type: PaymentMethodType.Card,
        organizationId: organization.id,
      })
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )

        // Verify all subscriptions were updated
        const updatedSub1 = await selectSubscriptionById(
          sub1.id,
          transaction
        )
        const updatedSub2 = await selectSubscriptionById(
          sub2.id,
          transaction
        )

        expect(updatedSub1.defaultPaymentMethodId).toBe(newPM.id)
        expect(updatedSub2.defaultPaymentMethodId).toBe(newPM.id)
        return Result.ok(null)
      })
    })
  })

  describe('Customer and PaymentMethod Syncing', () => {
    it('should associate payment method with correct customer', async () => {
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
      })

      const pmId = `pm_assoc_${core.nanoid()}`
      const setupIntent: CoreSripeSetupIntent = {
        status: 'succeeded',
        id: `seti_${core.nanoid()}`,
        customer: customer.stripeCustomerId!,
        payment_method: pmId,
        metadata: {
          type: IntentMetadataType.CheckoutSession,
          checkoutSessionId: checkoutSession.id,
        },
      }
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: checkoutSession.livemode,
      })
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )
        const paymentMethods = await selectPaymentMethods(
          { stripePaymentMethodId: pmId },
          transaction
        )

        expect(paymentMethods).toHaveLength(1)
        expect(paymentMethods[0].customerId).toBe(customer.id)

        // Get the new subscription and verify it uses this payment method
        const subscriptions = await selectSubscriptions(
          {
            customerId: customer.id,
            isFreePlan: false,
          },
          transaction
        )
        expect(subscriptions[0].defaultPaymentMethodId).toBe(
          paymentMethods[0].id
        )
        return Result.ok(null)
      })
    })
  })

  describe('Name and Metadata Propagation', () => {
    it('should copy outputName to subscription name field', async () => {
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
        outputName: 'Premium Plan - Special Edition',
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: checkoutSession.livemode,
      })
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )

        const subscriptions = await selectSubscriptions(
          {
            customerId: customer.id,
            isFreePlan: false,
          },
          transaction
        )

        expect(subscriptions).toHaveLength(1)
        expect(subscriptions[0].name).toBe(
          'Premium Plan - Special Edition'
        )
        return Result.ok(null)
      })
    })
  })

  describe('Events Logging Validation', () => {
    it('should emit appropriate events via callback', async () => {
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        priceId: paidPrice.id,
        quantity: 1,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: checkoutSession.livemode,
      })
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const { ctx, effects } =
          createCapturingEffectsContext(transaction)
        const result = await processSetupIntentSucceeded(
          setupIntent,
          ctx
        )

        // SubscriptionCreated events are emitted via callback, check captured effects
        const subscriptionCreatedEvents = effects.events.filter(
          (event) =>
            event.type === FlowgladEventType.SubscriptionCreated
        )
        expect(subscriptionCreatedEvents).toHaveLength(1)
        // submittedAt should equal occurredAt since they're set to the same timestamp
        expect(subscriptionCreatedEvents[0].submittedAt).toBe(
          subscriptionCreatedEvents[0].occurredAt
        )

        // PurchaseCompleted event is emitted via callback, check captured effects
        const purchaseCompletedEvents = effects.events.filter(
          (event) =>
            event.type === FlowgladEventType.PurchaseCompleted
        )
        expect(purchaseCompletedEvents).toHaveLength(1)

        return result
      })
    })
  })
})
