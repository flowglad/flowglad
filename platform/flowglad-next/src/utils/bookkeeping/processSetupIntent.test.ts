import Stripe from 'stripe'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  setupBillingPeriod,
  setupBillingRun,
  setupCheckoutSession,
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPurchase,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import { Invoice } from '@/db/schema/invoices'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Purchase } from '@/db/schema/purchases'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import {
  safelyUpdateCheckoutSessionStatus,
  selectCheckoutSessionById,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import {
  currentSubscriptionStatuses,
  safelyUpdateSubscriptionStatus,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { cancelSubscriptionImmediately } from '@/subscriptions/cancelSubscription'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentMethodType,
  PurchaseStatus,
  SubscriptionStatus,
} from '@/types'
import {
  type CoreSripeSetupIntent,
  calculateTrialEnd,
  checkoutSessionFromSetupIntent,
  createSubscriptionFromSetupIntentableCheckoutSession,
  type ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult,
  processAddPaymentMethodSetupIntentSucceeded,
  processSetupIntentSucceeded,
  processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded,
  setupIntentStatusToCheckoutSessionStatus,
} from '@/utils/bookkeeping/processSetupIntent'
import core from '../core'
import {
  IntentMetadataType,
  type StripeIntentMetadata,
  stripeIdFromObjectOrId,
} from '../stripe'
import { createFeeCalculationForCheckoutSession } from './checkoutSessions'

// Helper functions to generate mock Stripe objects with random IDs
const mockSucceededSetupIntent = ({
  checkoutSessionId,
  stripeCustomerId,
  paymentMethodId,
}: {
  checkoutSessionId: string
  stripeCustomerId: string
  paymentMethodId?: string
}): CoreSripeSetupIntent => ({
  status: 'succeeded',
  id: `seti_${core.nanoid()}`,
  customer: stripeCustomerId,
  payment_method: paymentMethodId ?? `pm_${core.nanoid()}`,
  metadata: {
    type: IntentMetadataType.CheckoutSession,
    checkoutSessionId,
  },
})

const mockProcessingSetupIntent = (
  checkoutSessionId: string,
  stripeCustomerId: string
): CoreSripeSetupIntent => ({
  status: 'processing',
  id: `seti_${core.nanoid()}`,
  customer: stripeCustomerId,
  payment_method: `pm_${core.nanoid()}`,
  metadata: {
    type: IntentMetadataType.CheckoutSession,
    checkoutSessionId,
  },
})

const mockCanceledSetupIntent = (
  checkoutSessionId: string,
  stripeCustomerId: string
): CoreSripeSetupIntent => ({
  status: 'canceled',
  id: `seti_${core.nanoid()}`,
  customer: stripeCustomerId,
  payment_method: `pm_${core.nanoid()}`,
  metadata: {
    type: IntentMetadataType.CheckoutSession,
    checkoutSessionId,
  },
})

const mockRequiresPaymentMethodSetupIntent = (
  checkoutSessionId: string,
  stripeCustomerId: string
): CoreSripeSetupIntent => ({
  status: 'requires_payment_method',
  id: `seti_${core.nanoid()}`,
  customer: stripeCustomerId,
  payment_method: `pm_${core.nanoid()}`,
  metadata: {
    type: IntentMetadataType.CheckoutSession,
    checkoutSessionId,
  },
})

describe('Process setup intent', async () => {
  // Common variables for all tests
  const { organization, price } = await setupOrg()
  let customer: Customer.Record
  let checkoutSession: CheckoutSession.Record
  let paymentMethod: PaymentMethod.Record
  let purchase: Purchase.Record
  let subscription: Subscription.Record
  let succeededSetupIntent: CoreSripeSetupIntent

  beforeEach(async () => {
    // Set up common test data
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      type: PaymentMethodType.Card,
    })

    checkoutSession = await setupCheckoutSession({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    purchase = await setupPurchase({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
      status: PurchaseStatus.Pending,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      livemode: true,
    })

    await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      livemode: true,
    })

    // Generate a new setup intent for each test
    succeededSetupIntent = mockSucceededSetupIntent({
      checkoutSessionId: checkoutSession.id,
      stripeCustomerId: customer.stripeCustomerId!,
    })
  })

  describe('setupIntentStatusToCheckoutSessionStatus', () => {
    it('correctly maps "succeeded" status to CheckoutSessionStatus.Succeeded', () => {
      const result =
        setupIntentStatusToCheckoutSessionStatus('succeeded')
      expect(result).toEqual(CheckoutSessionStatus.Succeeded)
    })

    it('correctly maps "processing" status to CheckoutSessionStatus.Pending', () => {
      const result =
        setupIntentStatusToCheckoutSessionStatus('processing')
      expect(result).toEqual(CheckoutSessionStatus.Pending)
    })

    it('correctly maps "canceled" status to CheckoutSessionStatus.Failed', () => {
      const result =
        setupIntentStatusToCheckoutSessionStatus('canceled')
      expect(result).toEqual(CheckoutSessionStatus.Failed)
    })

    it('correctly maps "requires_payment_method" status to CheckoutSessionStatus.Pending', () => {
      const result = setupIntentStatusToCheckoutSessionStatus(
        'requires_payment_method'
      )
      expect(result).toEqual(CheckoutSessionStatus.Pending)
    })

    it('maps unknown status to CheckoutSessionStatus.Pending', () => {
      const result = setupIntentStatusToCheckoutSessionStatus(
        'unknown' as any
      )
      expect(result).toEqual(CheckoutSessionStatus.Pending)
    })
  })

  describe('checkoutSessionFromSetupIntent', () => {
    it('throws an error when metadata is missing', async () => {
      const invalidSetupIntent = {
        ...mockSucceededSetupIntent({
          checkoutSessionId: checkoutSession.id,
          stripeCustomerId: customer.stripeCustomerId!,
        }),
        metadata: null,
      } as CoreSripeSetupIntent

      await expect(
        adminTransaction(async ({ transaction }) => {
          return checkoutSessionFromSetupIntent(
            invalidSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('No metadata found')
    })

    it('throws an error when metadata type is not CheckoutSession', async () => {
      const metadata: StripeIntentMetadata = {
        type: IntentMetadataType.BillingRun,
        billingRunId: `br_${core.nanoid()}`,
        billingPeriodId: `bp_${core.nanoid()}`,
      }
      const invalidSetupIntent = {
        ...mockSucceededSetupIntent({
          checkoutSessionId: checkoutSession.id,
          stripeCustomerId: customer.stripeCustomerId!,
        }),
        metadata,
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return checkoutSessionFromSetupIntent(
            invalidSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('Metadata type is not checkout_session')
    })

    it('throws an error when setup intent status is not succeeded', async () => {
      const processingSetupIntent = mockProcessingSetupIntent(
        checkoutSession.id,
        customer.stripeCustomerId!
      )

      await expect(
        adminTransaction(async ({ transaction }) => {
          return checkoutSessionFromSetupIntent(
            processingSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('Setup intent')
    })

    it('returns the checkout session when all conditions are met', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return checkoutSessionFromSetupIntent(
            succeededSetupIntent,
            transaction
          )
        }
      )

      expect(result).toBeDefined()
      expect(result.id).toEqual(checkoutSession.id)
    })
  })

  describe('processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded', () => {
    it('throws an error when checkout session is in terminal state', async () => {
      // Update checkout session to a terminal state
      await adminTransaction(async ({ transaction }) => {
        await selectCheckoutSessionById(
          checkoutSession.id,
          transaction
        )
        await safelyUpdateCheckoutSessionStatus(
          checkoutSession,
          CheckoutSessionStatus.Succeeded,
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded(
            succeededSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow(
        `processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Checkout session is in terminal state (checkout session id: ${checkoutSession.id})`
      )
    })

    it('throws an error when checkout session type is AddPaymentMethod', async () => {
      // Update checkout session to AddPaymentMethod type
      const addPaymentMethodCheckoutSession =
        await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.AddPaymentMethod,
          livemode: true,
          quantity: 1,
        })
      const addPaymentMethodSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: addPaymentMethodCheckoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })
      await expect(
        adminTransaction(async ({ transaction }) => {
          return processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded(
            addPaymentMethodSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow(
        'processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded: Add payment method checkout flow not support'
      )
    })

    it('processes purchase bookkeeping for regular checkout sessions', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded(
            succeededSetupIntent,
            transaction
          )
        }
      )

      expect(result.purchase).toBeDefined()
      expect(result.checkoutSession).toBeDefined()
      expect(result.price).toBeDefined()
      expect(result.organization).toBeDefined()
      expect(result.product).toBeDefined()
      expect(result.customer).toBeDefined()
      expect(result.paymentMethod).toBeDefined()
    })
  })

  describe('processAddPaymentMethodSetupIntentSucceeded', () => {
    it('returns early with organization and customer when checkout session is in terminal state', async () => {
      // Update checkout session to a terminal state
      await adminTransaction(async ({ transaction }) => {
        await selectCheckoutSessionById(
          checkoutSession.id,
          transaction
        )
        await safelyUpdateCheckoutSessionStatus(
          checkoutSession,
          CheckoutSessionStatus.Succeeded,
          transaction
        )
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processAddPaymentMethodSetupIntentSucceeded(
            succeededSetupIntent,
            transaction
          )
        }
      )

      expect(result.checkoutSession).toBeDefined()
      expect(result.organization).toBeDefined()
      expect(result.customer).toBeDefined()
      expect(result.purchase).toBeNull()
      expect(result.price).toBeNull()
      expect(result.product).toBeNull()
    })

    it('updates checkout session status based on setup intent status', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return processAddPaymentMethodSetupIntentSucceeded(
            succeededSetupIntent,
            transaction
          )
        }
      )

      expect(result.checkoutSession.status).toEqual(
        CheckoutSessionStatus.Succeeded
      )
    })

    it('updates the target subscription with the new payment method when targetSubscriptionId is defined', async () => {
      // Create a new subscription to be the target
      const targetSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        livemode: true,
      })

      // Create a checkout session with targetSubscriptionId
      const addPaymentMethodCheckoutSession =
        await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.AddPaymentMethod,
          targetSubscriptionId: targetSubscription.id,
          livemode: true,
          quantity: 1,
        })

      const addPaymentMethodSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: addPaymentMethodCheckoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await processAddPaymentMethodSetupIntentSucceeded(
          addPaymentMethodSetupIntent,
          transaction
        )
      })

      // Verify the subscription was updated with the new payment method
      const updatedSubscription = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionById(
            targetSubscription.id,
            transaction
          )
        }
      )

      // Get the payment method from the setup intent
      const [newPaymentMethod] = await adminTransaction(
        async ({ transaction }) => {
          return selectPaymentMethods(
            {
              stripePaymentMethodId: stripeIdFromObjectOrId(
                addPaymentMethodSetupIntent.payment_method!
              ),
            },
            transaction
          )
        }
      )

      expect(updatedSubscription.defaultPaymentMethodId).toEqual(
        newPaymentMethod.id
      )
    })

    it('does not update any subscription when targetSubscriptionId is not defined', async () => {
      // Create a checkout session without targetSubscriptionId
      const addPaymentMethodCheckoutSession =
        await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.AddPaymentMethod,
          livemode: true,
          quantity: 1,
        })

      const addPaymentMethodSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: addPaymentMethodCheckoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // Get the original subscription
      const originalSubscription = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionById(subscription.id, transaction)
        }
      )

      await adminTransaction(async ({ transaction }) => {
        await processAddPaymentMethodSetupIntentSucceeded(
          addPaymentMethodSetupIntent,
          transaction
        )
      })

      // Verify the subscription was not updated
      const updatedSubscription = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionById(subscription.id, transaction)
        }
      )

      expect(updatedSubscription.defaultPaymentMethodId).toEqual(
        originalSubscription.defaultPaymentMethodId
      )
    })

    it('updates all customer subscriptions when automaticallyUpdateSubscriptions is true', async () => {
      // Setup: Create another subscription for the same customer with the original payment method
      const secondSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        livemode: true,
      })

      // Create a checkout session with automaticallyUpdateSubscriptions: true
      const addPaymentMethodCheckoutSession =
        await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.AddPaymentMethod,
          automaticallyUpdateSubscriptions: true,
          livemode: true,
          priceId: price.id,
          quantity: 1,
        })

      const addPaymentMethodSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: addPaymentMethodCheckoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      // Execute the function
      await adminTransaction(async ({ transaction }) => {
        await processAddPaymentMethodSetupIntentSucceeded(
          addPaymentMethodSetupIntent,
          transaction
        )
      })

      // Verify subscriptions are updated
      const [updatedFirstSubscription, updatedSecondSubscription] =
        await adminTransaction(async ({ transaction }) => {
          const s1 = await selectSubscriptionById(
            subscription.id,
            transaction
          )
          const s2 = await selectSubscriptionById(
            secondSubscription.id,
            transaction
          )
          return [s1, s2]
        })

      // Get the new payment method from the setup intent
      const [newPaymentMethod] = await adminTransaction(
        async ({ transaction }) => {
          return selectPaymentMethods(
            {
              stripePaymentMethodId: stripeIdFromObjectOrId(
                addPaymentMethodSetupIntent.payment_method!
              ),
            },
            transaction
          )
        }
      )

      expect(updatedFirstSubscription.defaultPaymentMethodId).toEqual(
        newPaymentMethod.id
      )
      expect(
        updatedSecondSubscription.defaultPaymentMethodId
      ).toEqual(newPaymentMethod.id)
      expect(
        updatedFirstSubscription.defaultPaymentMethodId
      ).not.toEqual(paymentMethod.id)
      expect(
        updatedSecondSubscription.defaultPaymentMethodId
      ).not.toEqual(paymentMethod.id)
    })

    it('does not update customer subscriptions when automaticallyUpdateSubscriptions is false', async () => {
      const secondSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        livemode: true,
      })

      const addPaymentMethodCheckoutSession =
        await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.AddPaymentMethod,
          automaticallyUpdateSubscriptions: false,
          livemode: true,
          priceId: price.id,
          quantity: 1,
        })

      const addPaymentMethodSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: addPaymentMethodCheckoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })

      await adminTransaction(async ({ transaction }) => {
        await processAddPaymentMethodSetupIntentSucceeded(
          addPaymentMethodSetupIntent,
          transaction
        )
      })

      const [updatedFirstSubscription, updatedSecondSubscription] =
        await adminTransaction(async ({ transaction }) => {
          const s1 = await selectSubscriptionById(
            subscription.id,
            transaction
          )
          const s2 = await selectSubscriptionById(
            secondSubscription.id,
            transaction
          )
          return [s1, s2]
        })

      expect(updatedFirstSubscription.defaultPaymentMethodId).toEqual(
        paymentMethod.id
      )
      expect(
        updatedSecondSubscription.defaultPaymentMethodId
      ).toEqual(paymentMethod.id)
    })
  })

  describe('calculateTrialEnd', () => {
    // Scenario 1: Invalid or Zero Trial Period Days
    describe('when trialPeriodDays is invalid or zero', () => {
      it('should return undefined when trialPeriodDays is null', () => {
        // setup:
        const params = { hasHadTrial: false, trialPeriodDays: null }
        // expects:
        expect(calculateTrialEnd(params)).toBeUndefined()
      })

      it('should return undefined when trialPeriodDays is null and hasHadTrial is true', () => {
        // setup:
        const params = { hasHadTrial: true, trialPeriodDays: null }
        // expects:
        expect(calculateTrialEnd(params)).toBeUndefined()
      })

      it('should return undefined when trialPeriodDays is undefined', () => {
        // setup:
        const params = {
          hasHadTrial: false,
          trialPeriodDays: undefined as any, // Cast to any to test undefined path
        }
        // expects:
        expect(calculateTrialEnd(params)).toBeUndefined()
      })

      it('should return undefined when trialPeriodDays is undefined and hasHadTrial is true', () => {
        // setup:
        const params = {
          hasHadTrial: true,
          trialPeriodDays: undefined as any, // Cast to any to test undefined path
        }
        // expects:
        expect(calculateTrialEnd(params)).toBeUndefined()
      })

      it('should return undefined when trialPeriodDays is 0', () => {
        // setup:
        const params = { hasHadTrial: false, trialPeriodDays: 0 }
        // expects:
        expect(calculateTrialEnd(params)).toBeUndefined()
      })

      it('should return undefined when trialPeriodDays is 0 and hasHadTrial is true', () => {
        // setup:
        const params = { hasHadTrial: true, trialPeriodDays: 0 }
        // expects:
        expect(calculateTrialEnd(params)).toBeUndefined()
      })
    })

    // Scenario 2: User Has Already Had a Trial
    describe('when user has already had a trial', () => {
      it('should return undefined with a positive trialPeriodDays', () => {
        // setup:
        const params = { hasHadTrial: true, trialPeriodDays: 7 }
        // expects:
        expect(calculateTrialEnd(params)).toBeUndefined()
      })
    })

    // Scenario 3: User Has Not Had a Trial and trialPeriodDays is Positive
    describe('when user has not had a trial and trialPeriodDays is positive', () => {
      const mockDate = new Date(2024, 0, 1, 12, 0, 0) // Jan 1, 2024, 12:00:00

      beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(mockDate)
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('should return a future date for trialPeriodDays = 7', () => {
        // setup:
        const params = { hasHadTrial: false, trialPeriodDays: 7 }
        const expectedDate = new Date(
          mockDate.getTime() + 7 * 24 * 60 * 60 * 1000
        )
        // expects:
        const result = calculateTrialEnd(params)
        expect(result).toBeDefined()
        expect(result).toEqual(expectedDate.getTime())
      })

      it('should return a future date for trialPeriodDays = 30', () => {
        // setup:
        const params = { hasHadTrial: false, trialPeriodDays: 30 }
        const expectedDate = new Date(
          mockDate.getTime() + 30 * 24 * 60 * 60 * 1000
        )
        // expects:
        const result = calculateTrialEnd(params)
        expect(result).toBeDefined()
        expect(result).toEqual(expectedDate.getTime())
      })

      it('should return a future date for trialPeriodDays = 1', () => {
        // setup:
        const params = { hasHadTrial: false, trialPeriodDays: 1 }
        const expectedDate = new Date(
          mockDate.getTime() + 1 * 24 * 60 * 60 * 1000
        )
        // expects:
        const result = calculateTrialEnd(params)
        expect(result).toBeDefined()
        expect(result).toEqual(expectedDate.getTime())
      })
    })
  })

  describe('processSetupIntentSucceeded', () => {
    it('throws an error when metadata is missing', async () => {
      const invalidSetupIntent = {
        ...mockSucceededSetupIntent({
          checkoutSessionId: checkoutSession.id,
          stripeCustomerId: customer.stripeCustomerId!,
        }),
        metadata: null,
      } as CoreSripeSetupIntent

      await expect(
        adminTransaction(async ({ transaction }) => {
          return processSetupIntentSucceeded(
            invalidSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('No metadata found')
    })

    it('throws an error when setup intent status is not succeeded', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return processSetupIntentSucceeded(
            mockProcessingSetupIntent(
              checkoutSession.id,
              customer.stripeCustomerId!
            ),
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('throws an error when metadata type is not CheckoutSession', async () => {
      const invalidSetupIntent = {
        ...mockSucceededSetupIntent({
          checkoutSessionId: checkoutSession.id,
          stripeCustomerId: customer.stripeCustomerId!,
        }),
        metadata: {
          type: IntentMetadataType.BillingRun,
          billingRunId: `br_${core.nanoid()}`,
          billingPeriodId: `bp_${core.nanoid()}`,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return processSetupIntentSucceeded(
            invalidSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('Metadata type is not checkout_session')
    })

    it('throws when the stripe customer from the setup intent does not match the customer stripe customer id', async () => {
      const newCustomer = await setupCustomer({
        organizationId: organization.id,
        stripeCustomerId: `cus_${core.nanoid()}`,
      })
      const newCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: newCustomer.id,
        priceId: price.id,
        livemode: true,
        quantity: 1,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
      })
      const newSetupIntentSucceeded = mockSucceededSetupIntent({
        checkoutSessionId: newCheckoutSession.id,
        stripeCustomerId: 'newcust_' + core.nanoid(),
      })
      await expect(
        adminTransaction(async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            newCheckoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return processSetupIntentSucceeded(
            newSetupIntentSucceeded,
            transaction
          )
        })
      ).rejects.toThrow(/^Attempting to process checkout session/)
    })
    it('throws an error when product is not found for non-AddPaymentMethod checkout session', async () => {
      // This is a bit tricky to test directly, so we'll mock the selectPriceProductAndOrganizationByPriceWhere function
      // In a real test, you might need to set up a more complex test scenario
      // For now, we'll just test that the function throws an error when product is not found
      // This would require mocking the database call or setting up a specific test scenario
    })

    it('throws an error when purchase is not found for non-AddPaymentMethod checkout session', async () => {
      // Similar to the previous test, this would require mocking or setting up a specific test scenario
    })

    it('throws an error when price.intervalUnit is missing', async () => {
      // Update price to have missing intervalUnit
      // This would require mocking or setting up a specific test scenario
    })

    it('throws an error when price.intervalCount is missing', async () => {
      // Update price to have missing intervalCount
      // This would require mocking or setting up a specific test scenario
    })

    describe('ActivateSubscription Idempotency', () => {
      it('should not create duplicate billing periods when webhook is replayed', async () => {
        // Create a payment method for the test
        const testPaymentMethod = await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
          stripePaymentMethodId: `pm_${core.nanoid()}`,
          type: PaymentMethodType.Card,
        })

        // Setup: Create an incomplete subscription that needs activation
        const incompleteSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          livemode: true,
          status: SubscriptionStatus.Incomplete,
        })

        // Create subscription items for the incomplete subscription
        await setupSubscriptionItem({
          subscriptionId: incompleteSubscription.id,
          name: 'Test Item',
          quantity: 1,
          unitPrice: 1000,
          priceId: price.id,
        })

        // Create ActivateSubscription checkout session
        const activateCheckoutSession = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.ActivateSubscription,
          targetSubscriptionId: incompleteSubscription.id,
          livemode: true,
          priceId: price.id,
          quantity: 1,
        })

        const setupIntent = mockSucceededSetupIntent({
          checkoutSessionId: activateCheckoutSession.id,
          stripeCustomerId: customer.stripeCustomerId!,
          paymentMethodId: testPaymentMethod.stripePaymentMethodId!,
        })

        // First webhook delivery - should succeed
        const firstActivationResult =
          await comprehensiveAdminTransaction(
            async ({ transaction }) => {
              return processSetupIntentSucceeded(
                setupIntent,
                transaction
              )
            }
          )

        // Verify the result type
        expect(firstActivationResult.type).toBe(
          CheckoutSessionType.ActivateSubscription
        )
        if (
          firstActivationResult.type !==
          CheckoutSessionType.ActivateSubscription
        ) {
          throw new Error('Expected ActivateSubscription result')
        }
        // Type assertion after guard
        const firstResult =
          firstActivationResult as ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult
        expect(firstResult.subscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(firstResult.subscription.stripeSetupIntentId).toBe(
          setupIntent.id
        )

        // Get billing periods after first delivery
        const firstBillingPeriods = await adminTransaction(
          async ({ transaction }) => {
            return selectBillingPeriods(
              { subscriptionId: incompleteSubscription.id },
              transaction
            )
          }
        )

        expect(firstBillingPeriods.length).toBeGreaterThan(0)
        const firstBillingPeriodCount = firstBillingPeriods.length
        const firstCurrentBillingPeriodStart =
          firstResult.subscription.currentBillingPeriodStart
        const firstCurrentBillingPeriodEnd =
          firstResult.subscription.currentBillingPeriodEnd
        const firstBillingCycleAnchorDate =
          firstResult.subscription.billingCycleAnchorDate

        // Second webhook delivery (replay) - should be idempotent
        const secondActivationResult =
          await comprehensiveAdminTransaction(
            async ({ transaction }) => {
              return processSetupIntentSucceeded(
                setupIntent,
                transaction
              )
            }
          )

        // Verify idempotent behavior
        expect(secondActivationResult.type).toBe(
          CheckoutSessionType.ActivateSubscription
        )
        if (
          secondActivationResult.type !==
          CheckoutSessionType.ActivateSubscription
        ) {
          throw new Error('Expected ActivateSubscription result')
        }
        // Type assertion after guard
        const secondResult =
          secondActivationResult as ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult

        // Get billing periods after replay
        const secondBillingPeriods = await adminTransaction(
          async ({ transaction }) => {
            return selectBillingPeriods(
              { subscriptionId: incompleteSubscription.id },
              transaction
            )
          }
        )

        // Assertions: Should have same data (idempotent)
        expect(secondResult.subscription.id).toBe(
          firstResult.subscription.id
        )
        expect(
          secondResult.subscription.currentBillingPeriodStart
        ).toBe(firstCurrentBillingPeriodStart)
        expect(
          secondResult.subscription.currentBillingPeriodEnd
        ).toBe(firstCurrentBillingPeriodEnd)
        expect(secondResult.subscription.billingCycleAnchorDate).toBe(
          firstBillingCycleAnchorDate
        )

        // Critical: Should not have created duplicate billing periods
        expect(secondBillingPeriods.length).toBe(
          firstBillingPeriodCount
        )

        // Verify the stripeSetupIntentId is still set
        expect(secondResult.subscription.stripeSetupIntentId).toBe(
          setupIntent.id
        )
      })

      it('should short-circuit on second setup intent when subscription already has stripeSetupIntentId', async () => {
        // Create a payment method for the test
        const testPaymentMethod = await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
          stripePaymentMethodId: `pm_${core.nanoid()}`,
          type: PaymentMethodType.Card,
        })

        // Setup: Create an incomplete subscription
        const incompleteSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          livemode: true,
          status: SubscriptionStatus.Incomplete,
        })

        // Create subscription items for the incomplete subscription
        await setupSubscriptionItem({
          subscriptionId: incompleteSubscription.id,
          name: 'Test Item',
          quantity: 1,
          unitPrice: 1000,
          priceId: price.id,
        })

        // First activation with setup intent 1
        const activateCheckoutSession1 = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.ActivateSubscription,
          targetSubscriptionId: incompleteSubscription.id,
          livemode: true,
          priceId: price.id,
          quantity: 1,
        })

        const setupIntent1 = mockSucceededSetupIntent({
          checkoutSessionId: activateCheckoutSession1.id,
          stripeCustomerId: customer.stripeCustomerId!,
          paymentMethodId: testPaymentMethod.stripePaymentMethodId!,
        })

        // Process first activation
        const firstActivationResult =
          await comprehensiveAdminTransaction(
            async ({ transaction }) => {
              return processSetupIntentSucceeded(
                setupIntent1,
                transaction
              )
            }
          )

        // Verify first activation succeeded and set stripeSetupIntentId
        expect(firstActivationResult.type).toBe(
          CheckoutSessionType.ActivateSubscription
        )
        if (
          firstActivationResult.type !==
          CheckoutSessionType.ActivateSubscription
        ) {
          throw new Error('Expected ActivateSubscription result')
        }
        // Type assertion after guard
        const firstResult =
          firstActivationResult as ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult
        expect(firstResult.subscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(firstResult.subscription.stripeSetupIntentId).toBe(
          setupIntent1.id
        )

        // Get billing periods after first activation
        const firstBillingPeriods = await adminTransaction(
          async ({ transaction }) => {
            return selectBillingPeriods(
              { subscriptionId: incompleteSubscription.id },
              transaction
            )
          }
        )
        expect(firstBillingPeriods.length).toBeGreaterThan(0)
        const firstBillingPeriodCount = firstBillingPeriods.length

        // Process the SAME setup intent again (webhook replay)
        // The idempotency check should find the subscription by its stripeSetupIntentId
        // and short-circuit, returning the existing subscription without reprocessing
        const secondActivationResult =
          await comprehensiveAdminTransaction(
            async ({ transaction }) => {
              return processSetupIntentSucceeded(
                setupIntent1, // Same setup intent as before
                transaction
              )
            }
          )

        // Verify it short-circuited and returned the existing subscription
        expect(secondActivationResult.type).toBe(
          CheckoutSessionType.ActivateSubscription
        )
        if (
          secondActivationResult.type !==
          CheckoutSessionType.ActivateSubscription
        ) {
          throw new Error('Expected ActivateSubscription result')
        }
        // Type assertion after guard
        const secondResult =
          secondActivationResult as ProcessActivateSubscriptionCheckoutSessionSetupIntentSucceededResult

        // The idempotency check should have found the subscription by stripeSetupIntentId
        // and returned it without reprocessing
        expect(secondResult.subscription.id).toBe(
          firstResult.subscription.id
        )
        expect(secondResult.subscription.stripeSetupIntentId).toBe(
          setupIntent1.id
        )

        // Get billing periods after replay to verify no duplicates were created
        const secondBillingPeriods = await adminTransaction(
          async ({ transaction }) => {
            return selectBillingPeriods(
              { subscriptionId: incompleteSubscription.id },
              transaction
            )
          }
        )

        // Critical: Should not have created new billing periods
        expect(secondBillingPeriods.length).toBe(
          firstBillingPeriodCount
        )
      })
    })

    describe('Integration Tests', () => {
      it('completes a full setup intent flow from creation to success', async () => {
        const freshCustomer = await setupCustomer({
          organizationId: organization.id,
          stripeCustomerId: `cus_${core.nanoid()}`,
        })
        const freshCheckoutSession = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: freshCustomer.id,
          priceId: price.id,
          livemode: true,
          quantity: 1,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Product,
        })
        const freshSetupIntentSucceeded = mockSucceededSetupIntent({
          checkoutSessionId: freshCheckoutSession.id,
          stripeCustomerId: freshCustomer.stripeCustomerId!,
        })

        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            await createFeeCalculationForCheckoutSession(
              freshCheckoutSession as CheckoutSession.FeeReadyRecord,
              transaction
            )
            return processSetupIntentSucceeded(
              freshSetupIntentSucceeded,
              transaction
            )
          }
        )

        expect(result.purchase?.status).toEqual(PurchaseStatus.Paid)
        expect(result.checkoutSession.status).toEqual(
          CheckoutSessionStatus.Succeeded
        )
        if (!('billingRun' in result)) {
          throw new Error('Billing run not found')
        }
        expect(result.billingRun).toBeDefined()
        const subscription = await adminTransaction(
          async ({ transaction }) => {
            return await selectSubscriptionById(
              result.billingRun!.subscriptionId,
              transaction
            )
          }
        )
        expect(currentSubscriptionStatuses).toContain(
          subscription.status
        )
      })

      it('applies trial periods correctly based on customer history', async () => {
        // Create a local customer for this test
        const localCustomer = await setupCustomer({
          organizationId: organization.id,
          stripeCustomerId: `cus_${core.nanoid()}`,
        })

        // Create a local payment method for this test
        const localPaymentMethod = await setupPaymentMethod({
          organizationId: organization.id,
          customerId: localCustomer.id,
          stripePaymentMethodId: `pm_${core.nanoid()}`,
          type: PaymentMethodType.Card,
        })

        // Create a local old subscription with trial period
        const localOldSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: localCustomer.id,
          priceId: price.id,
          livemode: true,
          paymentMethodId: localPaymentMethod.id,
          trialEnd: Date.now() + 14 * 24 * 60 * 60 * 1000,
        })

        // Create a local first checkout session
        const localFirstCheckoutSession = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: localCustomer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Product,
          quantity: 1,
          livemode: true,
        })

        // Create a local setup intent for the first checkout session
        const localFirstSetupIntent = mockSucceededSetupIntent({
          checkoutSessionId: localFirstCheckoutSession.id,
          stripeCustomerId: localCustomer.stripeCustomerId!,
        })

        // Process the first setup intent
        const firstResult = await adminTransaction(
          async ({ transaction }) => {
            await updateSubscription(
              {
                id: localOldSubscription.id,
                status: SubscriptionStatus.Canceled,
                renews: localOldSubscription.renews,
              },
              transaction
            )
            await createFeeCalculationForCheckoutSession(
              localFirstCheckoutSession as CheckoutSession.FeeReadyRecord,
              transaction
            )
            const { result } = await processSetupIntentSucceeded(
              localFirstSetupIntent,
              transaction
            )
            if (!('billingRun' in result)) {
              throw new Error('Billing run not found')
            }
            expect(result.billingRun).toBeDefined()
            return {
              ...result,
              subscription: await selectSubscriptionById(
                result.billingRun!.subscriptionId,
                transaction
              ),
            }
          }
        )

        // The result should include a trial end date for the new subscription
        expect(firstResult.subscription.trialEnd).toBeDefined()

        // Cancel the subscription so we can create a new one
        await adminTransaction(async ({ transaction }) => {
          await safelyUpdateSubscriptionStatus(
            firstResult.subscription,
            SubscriptionStatus.Canceled,
            transaction
          )
        })

        // Create a local second checkout session
        const localSecondCheckoutSession = await setupCheckoutSession(
          {
            organizationId: organization.id,
            customerId: localCustomer.id,
            priceId: price.id,
            status: CheckoutSessionStatus.Open,
            quantity: 1,
            livemode: true,
            type: CheckoutSessionType.Product,
          }
        )

        // Create a local setup intent for the second checkout session
        const localSecondSetupIntent = mockSucceededSetupIntent({
          checkoutSessionId: localSecondCheckoutSession.id,
          stripeCustomerId: localCustomer.stripeCustomerId!,
        })

        // Process the second setup intent
        const { subscription: secondSubscription } =
          await adminTransaction(async ({ transaction }) => {
            await createFeeCalculationForCheckoutSession(
              localSecondCheckoutSession as CheckoutSession.FeeReadyRecord,
              transaction
            )
            const initialResult =
              await processSubscriptionCreatingCheckoutSessionSetupIntentSucceeded(
                localSecondSetupIntent,
                transaction
              )
            const { result } =
              await createSubscriptionFromSetupIntentableCheckoutSession(
                {
                  ...initialResult,
                  setupIntent: localFirstSetupIntent,
                },
                transaction
              )
            return {
              ...result,
              subscription: await selectSubscriptionById(
                result.billingRun!.subscriptionId,
                transaction
              ),
            }
          })

        // The second subscription should not include a trial end date
        expect(secondSubscription.trialEnd).toBeNull()

        // Create a new customer with no trial history
        const newCustomer = await setupCustomer({
          organizationId: organization.id,
          stripeCustomerId: `cus_${core.nanoid()}`,
        })

        // Create a new checkout session for the new customer
        const newCheckoutSession = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: newCustomer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Product,
          quantity: 1,
          livemode: true,
        })

        // Create a setup intent for the new customer
        const newSetupIntent = mockSucceededSetupIntent({
          checkoutSessionId: newCheckoutSession.id,
          stripeCustomerId: newCustomer.stripeCustomerId!,
        })

        // Process the setup intent for the new customer
        const newSubscription = await adminTransaction(
          async ({ transaction }) => {
            await createFeeCalculationForCheckoutSession(
              newCheckoutSession as CheckoutSession.FeeReadyRecord,
              transaction
            )
            const { result } = await processSetupIntentSucceeded(
              newSetupIntent,
              transaction
            )
            if (!('billingRun' in result)) {
              throw new Error('Billing run not found')
            }
            expect(result.billingRun).toBeDefined()
            return await selectSubscriptionById(
              result.billingRun!.subscriptionId,
              transaction
            )
          }
        )

        // The new subscription should include a trial end date
        expect(newSubscription.trialEnd).toBeDefined()
      })
    })

    describe('Edge Cases', () => {
      it('handles cases where customer ID is missing', async () => {
        // Update checkout session to have no customer ID
        await adminTransaction(async ({ transaction }) => {
          await selectCheckoutSessionById(
            checkoutSession.id,
            transaction
          )
          checkoutSession.customerId = null
        })

        await expect(
          adminTransaction(async ({ transaction }) => {
            return processSetupIntentSucceeded(
              succeededSetupIntent,
              transaction
            )
          })
        ).rejects.toThrow()
      })

      it('handles cases where payment method is missing', async () => {
        // Update setup intent to have no payment method
        const invalidSetupIntent = {
          ...mockSucceededSetupIntent({
            checkoutSessionId: checkoutSession.id,
            stripeCustomerId: customer.stripeCustomerId!,
          }),
          payment_method: null,
        } as CoreSripeSetupIntent

        await expect(
          adminTransaction(async ({ transaction }) => {
            return processSetupIntentSucceeded(
              invalidSetupIntent,
              transaction
            )
          })
        ).rejects.toThrow()
      })

      it('handles cases where price has no trial period', async () => {
        // Update price to have no trial period
        // This would require mocking or setting up a specific test scenario
      })
    })
  })
})
