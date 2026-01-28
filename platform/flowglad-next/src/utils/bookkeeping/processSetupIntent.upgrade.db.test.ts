import { beforeEach, describe, expect, it } from 'bun:test'
import {
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
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import {
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import {
  createDiscardingEffectsContext,
  noopEmitEvent,
  noopInvalidateCache,
} from '@/test-utils/transactionCallbacks'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  PurchaseStatus,
  SubscriptionStatus,
} from '@/types'
import {
  type CoreSripeSetupIntent,
  processSetupIntentSucceeded,
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

describe('processSetupIntentSucceeded - Subscription Upgrade Flow', () => {
  // Common test data
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let freeProduct: Product.Record
  let freePrice: Price.Record
  let paidProduct: Product.Record
  let paidPrice: Price.Record

  beforeEach(async () => {
    // Set up organization with default pricing model
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    // Create free product and price
    freeProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Free Plan',
      livemode: true,
      default: false,
    })

    freePrice = await setupPrice({
      productId: freeProduct.id,
      name: 'Free Tier',
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
      name: 'Pro Tier',
      type: PriceType.Subscription,
      unitPrice: 5000, // $50
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    // Create customer
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
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
  })

  describe('Customer with free subscription upgrading to paid', () => {
    it('should cancel free subscription and create paid subscription atomically', async () => {
      // Create free subscription for customer
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true, // Mark as free plan
        defaultPaymentMethodId: paymentMethod.id,
      })

      // Create purchase for paid product
      const purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: PurchaseStatus.Pending,
        livemode: true,
      })

      // Create checkout session for paid product
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        purchaseId: purchase.id,
        livemode: true,
        quantity: 1,
      })

      // Create fee calculation for the checkout session
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: true,
      })

      // Create successful setup intent
      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // Process the setup intent
      const result = await adminTransaction(
        async ({ transaction }) => {
          return await processSetupIntentSucceeded(
            setupIntent,
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify free subscription was canceled
      const updatedFreeSubscription = await adminTransaction(
        async ({ transaction }) => {
          return (
            await selectSubscriptionById(
              freeSubscription.id,
              transaction
            )
          ).unwrap()
        }
      )
      expect(updatedFreeSubscription.status).toBe(
        SubscriptionStatus.Canceled
      )
      expect(updatedFreeSubscription.cancellationReason).toBe(
        'upgraded_to_paid'
      )
      expect(typeof updatedFreeSubscription.canceledAt).toBe('number')
      expect(
        typeof updatedFreeSubscription.replacedBySubscriptionId
      ).toBe('string')

      // Verify new subscription was created
      const allSubscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )
      const activeSubscriptions = allSubscriptions.filter(
        (sub) => sub.status === SubscriptionStatus.Active
      )
      expect(activeSubscriptions).toHaveLength(1)
      expect(activeSubscriptions[0].priceId).toBe(paidPrice.id)

      // Verify linking between subscriptions via the replacedBySubscriptionId column
      expect(updatedFreeSubscription.replacedBySubscriptionId).toBe(
        activeSubscriptions[0].id
      )
    })

    it('should preserve metadata from free subscription to paid subscription', async () => {
      // Create free subscription with custom metadata
      const customMetadata = {
        source: 'organic',
        campaign: 'summer2024',
        customField: 'test123',
      }
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
        metadata: customMetadata,
        defaultPaymentMethodId: paymentMethod.id,
      })

      // Create purchase and checkout session
      const purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: PurchaseStatus.Pending,
        livemode: true,
      })

      const checkoutMetadata = { referrer: 'dashboard' }
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        purchaseId: purchase.id,
        outputMetadata: checkoutMetadata,
        livemode: true,
        quantity: 1,
      })

      // Create fee calculation for the checkout session
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        return await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )
      })

      // Get the new subscription
      const allSubscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )
      const newSubscription = allSubscriptions.find(
        (sub) => sub.status === SubscriptionStatus.Active
      )

      expect(typeof newSubscription).toBe('object')
      expect(typeof newSubscription!.metadata).toBe('object')
      const metadata = newSubscription!.metadata as any

      // Should preserve checkout metadata only (no upgrade tracking in metadata)
      expect(metadata.referrer).toBe('dashboard')
      // Upgrade tracking is done via replacedBySubscriptionId column, not metadata
      expect(metadata.upgraded_from_subscription_id).toBeUndefined()
      expect(metadata.upgrade_date).toBeUndefined()
    })

    it('should handle billing periods correctly during upgrade', async () => {
      // setup:
      // - create customer with free subscription
      // - create active billing period for free subscription
      // - create checkout session for paid product
      // - create successful setup intent
      // expects:
      // - free subscription's billing period should remain unchanged
      // - new subscription should have its own billing period
      // - new billing period should start from current date
      // - billing cycle anchor should be set correctly
    })
  })

  describe('Customer without existing subscription', () => {
    it('should create new subscription without canceling anything', async () => {
      // Ensure customer has no subscriptions
      const existingSubscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )
      expect(existingSubscriptions).toHaveLength(0)

      // Create purchase and checkout session for paid product
      const purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: PurchaseStatus.Pending,
        livemode: true,
      })

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        purchaseId: purchase.id,
        livemode: true,
        quantity: 1,
      })

      // Create fee calculation for the checkout session
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // Process the setup intent
      await adminTransaction(async ({ transaction }) => {
        return await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )
      })

      // Verify new subscription was created
      const allSubscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )
      expect(allSubscriptions).toHaveLength(1)
      expect(allSubscriptions[0].status).toBe(
        SubscriptionStatus.Active
      )
      expect(allSubscriptions[0].priceId).toBe(paidPrice.id)

      // Verify metadata doesn't contain upgrade info (we use replacedBySubscriptionId column instead)
      const metadata = allSubscriptions[0].metadata as any
      if (metadata) {
        expect(metadata.upgraded_from_subscription_id).toBeUndefined()
        expect(metadata.upgrade_date).toBeUndefined()
      }
    })
  })

  describe('Customer with multiple free subscriptions', () => {
    it('should cancel most recent free subscription when multiple exist', async () => {
      // setup:
      // - create customer
      // - create two different free products
      // - create two active free subscriptions for different products
      // - create checkout session for paid product
      // - create successful setup intent
      // expects:
      // - most recently created free subscription should be canceled
      // - older free subscription should remain active
      // - new paid subscription should be created
      // - canceled subscription should be linked to new subscription
    })
  })

  describe('Customer with existing paid subscription', () => {
    it('should allow creating second paid subscription while canceling free', async () => {
      // Update organization to allow multiple subscriptions
      await adminTransaction(async ({ transaction }) => {
        await updateOrganization(
          {
            id: organization.id,
            allowMultipleSubscriptionsPerCustomer: true,
          },
          transaction
        )
      })

      // Create existing paid subscription
      const existingPaidSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id, // Use default paid price from setupOrg
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: false,
        defaultPaymentMethodId: paymentMethod.id,
      })

      // Create free subscription
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
        defaultPaymentMethodId: paymentMethod.id,
      })

      // Create purchase and checkout for another paid product
      const purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: PurchaseStatus.Pending,
        livemode: true,
      })

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Pending,
        purchaseId: purchase.id,
        livemode: true,
        quantity: 1,
      })

      // Create fee calculation for the checkout session
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: paidPrice.id,
        livemode: true,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // Process the setup intent
      await adminTransaction(async ({ transaction }) => {
        return await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )
      })

      // Verify free subscription was canceled
      const updatedFreeSubscription = await adminTransaction(
        async ({ transaction }) => {
          return (
            await selectSubscriptionById(
              freeSubscription.id,
              transaction
            )
          ).unwrap()
        }
      )
      expect(updatedFreeSubscription.status).toBe(
        SubscriptionStatus.Canceled
      )
      expect(updatedFreeSubscription.cancellationReason).toBe(
        'upgraded_to_paid'
      )

      // Verify original paid subscription remains active
      const updatedExistingPaid = await adminTransaction(
        async ({ transaction }) => {
          return (
            await selectSubscriptionById(
              existingPaidSubscription.id,
              transaction
            )
          ).unwrap()
        }
      )
      expect(updatedExistingPaid.status).toBe(
        SubscriptionStatus.Active
      )
      expect(updatedExistingPaid.cancellationReason).toBeNull()

      // Verify customer has two active paid subscriptions
      const allSubscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )
      const activeSubscriptions = allSubscriptions.filter(
        (sub) => sub.status === SubscriptionStatus.Active
      )
      expect(activeSubscriptions).toHaveLength(2)
      expect(
        activeSubscriptions.every(
          (sub) => sub.isFreePlan === false || sub.isFreePlan === null
        )
      ).toBe(true)
    })

    it('should not cancel existing paid subscription', async () => {
      // setup:
      // - create customer with active paid subscription (unitPrice > 0)
      // - create checkout session for different paid product
      // - create successful setup intent
      // expects:
      // - existing paid subscription should remain active
      // - new paid subscription should be created
      // - no subscriptions should be canceled
      // - customer should have two active paid subscriptions
    })
  })

  describe('Transaction rollback on failure', () => {
    it('should rollback cancellation if subscription creation fails', async () => {
      // setup:
      // - create customer with active free subscription
      // - create checkout session with invalid price data that will cause creation to fail
      // - create successful setup intent
      // expects:
      // - should throw an error
      // - free subscription should remain active (not canceled)
      // - no new subscription should exist
      // - free subscription should not have cancellationReason set
      // - free subscription should not have replacedBySubscriptionId set
    })
  })

  describe('Idempotency handling', () => {
    it('should handle duplicate setup intent processing correctly', async () => {
      // setup:
      // - create customer with active free subscription
      // - create checkout session for paid product
      // - create successful setup intent
      // - process the setup intent once successfully
      // - process the same setup intent again (webhook replay)
      // expects:
      // - first processing should cancel free and create paid subscription
      // - second processing should return existing result without modifications
      // - should not create duplicate subscriptions
      // - should not double-cancel the free subscription
      // - only one paid subscription should exist
    })
  })

  describe('Non-subscription checkout types', () => {
    it('should not cancel free subscription for AddPaymentMethod checkout', async () => {
      // Create free subscription
      const freeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
        defaultPaymentMethodId: paymentMethod.id,
      })

      // Create AddPaymentMethod checkout session
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        type: CheckoutSessionType.AddPaymentMethod,
        status: CheckoutSessionStatus.Pending,
        livemode: true,
        quantity: 1,
        priceId: freePrice.id,
      })

      const setupIntent = mockSucceededSetupIntent({
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // Process the setup intent
      await adminTransaction(async ({ transaction }) => {
        return await processSetupIntentSucceeded(
          setupIntent,
          createDiscardingEffectsContext(transaction)
        )
      })

      // Verify free subscription remains active
      const updatedFreeSubscription = await adminTransaction(
        async ({ transaction }) => {
          return (
            await selectSubscriptionById(
              freeSubscription.id,
              transaction
            )
          ).unwrap()
        }
      )
      expect(updatedFreeSubscription.status).toBe(
        SubscriptionStatus.Active
      )
      expect(updatedFreeSubscription.cancellationReason).toBeNull()
      expect(updatedFreeSubscription.canceledAt).toBeNull()

      // Verify no new subscriptions were created
      const allSubscriptions = await adminTransaction(
        async ({ transaction }) => {
          return await selectSubscriptions(
            { customerId: customer.id },
            transaction
          )
        }
      )
      expect(allSubscriptions).toHaveLength(1)
      expect(allSubscriptions[0].id).toBe(freeSubscription.id)
    })

    it('should not cancel free subscription for ActivateSubscription checkout', async () => {
      // setup:
      // - create customer with active free subscription
      // - create existing incomplete subscription
      // - create checkout session of type ActivateSubscription targeting the incomplete subscription
      // - create successful setup intent
      // expects:
      // - free subscription should remain active
      // - incomplete subscription should be activated
      // - no subscriptions should be canceled
      // - no new subscription should be created
    })
  })

  describe('Edge cases', () => {
    it('should handle customer with already canceled free subscription', async () => {
      // setup:
      // - create customer with canceled free subscription (status = 'canceled')
      // - create checkout session for paid product
      // - create successful setup intent
      // expects:
      // - canceled free subscription should remain unchanged
      // - new subscription should be created normally
      // - no linking between old canceled and new subscription
      // - new subscription should not have upgrade metadata
    })

    it('should handle customer with free subscription canceled for other reasons', async () => {
      // setup:
      // - create customer with free subscription canceled with reason 'customer_request'
      // - create checkout session for paid product
      // - create successful setup intent
      // expects:
      // - canceled subscription should remain unchanged
      // - new subscription should be created normally
      // - canceled subscription's cancellationReason should remain 'customer_request'
    })

    it('should handle free subscription with trial period', async () => {
      // setup:
      // - create customer with free subscription in trial period
      // - create checkout session for paid product
      // - create successful setup intent
      // expects:
      // - free subscription should be canceled regardless of trial status
      // - new paid subscription should be created with its own trial settings
      // - trial period should not affect upgrade logic
    })
  })
})

describe('cancelFreeSubscriptionIfExists - Helper Function', () => {
  it('should cancel active free subscription', async () => {
    // setup:
    // - create customer
    // - create active subscription with isFreePlan = true
    // expects:
    // - should return the canceled subscription
    // - subscription status should be 'canceled'
    // - cancellationReason should be 'upgraded_to_paid'
    // - canceledAt should be set to current timestamp
  })

  it('should return null when no free subscription exists', async () => {
    // setup:
    // - create customer
    // - create only paid subscriptions (isFreePlan = false)
    // expects:
    // - should return null
    // - no subscriptions should be modified
    // - paid subscriptions should remain active
  })

  it('should return null when free subscription is already canceled', async () => {
    // setup:
    // - create customer
    // - create free subscription with status = 'canceled'
    // expects:
    // - should return null
    // - canceled subscription should remain unchanged
    // - no modifications should be made
  })

  it('should handle multiple free subscriptions by canceling most recent', async () => {
    // setup:
    // - create customer
    // - create two active free subscriptions with different creation dates
    // expects:
    // - should cancel the most recently created free subscription
    // - older free subscription should remain active
    // - returned subscription should be the canceled one
  })
})
