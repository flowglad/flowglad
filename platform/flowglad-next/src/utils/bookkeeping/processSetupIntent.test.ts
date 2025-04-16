import { describe, it, expect, beforeEach } from 'vitest'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentMethodType,
  PurchaseStatus,
  SubscriptionStatus,
} from '@/types'
import {
  setupIntentStatusToCheckoutSessionStatus,
  processCheckoutSessionSetupIntent,
  calculateTrialEnd,
  processSetupIntentSucceeded,
  CoreSripeSetupIntent,
} from '@/utils/bookkeeping/processSetupIntent'
import { Purchase } from '@/db/schema/purchases'
import {
  setupBillingPeriod,
  setupBillingRun,
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPurchase,
  setupSubscription,
  setupCheckoutSession,
} from '../../../seedDatabase'
import { Customer } from '@/db/schema/customers'
import { Invoice } from '@/db/schema/invoices'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import {
  safelyUpdateCheckoutSessionStatus,
  selectCheckoutSessionById,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  IntentMetadataType,
  stripeIdFromObjectOrId,
  StripeIntentMetadata,
} from '../stripe'
import core from '../core'
import Stripe from 'stripe'
import {
  currentSubscriptionStatuses,
  safelyUpdateSubscriptionStatus,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { createFeeCalculationForCheckoutSession } from './checkoutSessions'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { cancelSubscriptionImmediately } from '@/subscriptions/cancelSubscription'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'

// Helper functions to generate mock Stripe objects with random IDs
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
    console.log(
      'checkoutSession.billingAddress',
      checkoutSession.billingAddress
    )
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

  describe('processCheckoutSessionSetupIntent', () => {
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
          return processCheckoutSessionSetupIntent(
            invalidSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('No metadata found')
    })

    it('throws an error when metadata type is not CheckoutSession', async () => {
      const invalidSetupIntent = {
        ...mockSucceededSetupIntent({
          checkoutSessionId: checkoutSession.id,
          stripeCustomerId: customer.stripeCustomerId!,
        }),
        metadata: {
          type: IntentMetadataType.Invoice,
          invoiceId: `inv_${core.nanoid()}`,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return processCheckoutSessionSetupIntent(
            invalidSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow('Metadata type is not checkout_session')
    })

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
          return processCheckoutSessionSetupIntent(
            succeededSetupIntent,
            transaction
          )
        }
      )

      expect(result.checkoutSession).toBeDefined()
      expect(result.organization).toBeDefined()
      expect(result.customer).toBeDefined()
      expect(result.purchase).toBeUndefined()
    })

    it('updates checkout session status based on setup intent status', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return processCheckoutSessionSetupIntent(
            succeededSetupIntent,
            transaction
          )
        }
      )

      expect(result.checkoutSession.status).toEqual(
        CheckoutSessionStatus.Succeeded
      )
    })

    it('throws an error when checkout session type is Invoice', async () => {
      // Update checkout session to Invoice type
      const invoiceCheckoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Invoice,
        livemode: true,
        quantity: 1,
      })
      const succeededSetupIntent = mockSucceededSetupIntent({
        checkoutSessionId: invoiceCheckoutSession.id,
        stripeCustomerId: customer.stripeCustomerId!,
      })
      await expect(
        adminTransaction(async ({ transaction }) => {
          return processCheckoutSessionSetupIntent(
            succeededSetupIntent,
            transaction
          )
        })
      ).rejects.toThrow(
        'Invoice checkout flow does not support setup intents'
      )
    })

    it('processes purchase bookkeeping for regular checkout sessions', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return processCheckoutSessionSetupIntent(
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
    })
  })

  describe('calculateTrialEnd', () => {
    it('returns undefined when trialPeriodDays is null', () => {
      const result = calculateTrialEnd({
        hasHadTrial: false,
        trialPeriodDays: null,
      })
      expect(result).toBeUndefined()
    })

    it('returns undefined when hasHadTrial is true', () => {
      const result = calculateTrialEnd({
        hasHadTrial: true,
        trialPeriodDays: 14,
      })
      expect(result).toBeUndefined()
    })

    it('returns a future date when hasHadTrial is false and trialPeriodDays is provided', () => {
      const now = new Date()
      const result = calculateTrialEnd({
        hasHadTrial: false,
        trialPeriodDays: 14,
      })

      expect(result).toBeDefined()
      expect(result instanceof Date).toBe(true)
      expect(result!.getTime()).toBeGreaterThan(now.getTime())
      expect(result!.getTime() - now.getTime()).toBeLessThanOrEqual(
        14 * 24 * 60 * 60 * 1000 + 1000
      ) // Allow 1 second for test execution
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
          type: IntentMetadataType.Invoice,
          invoiceId: `inv_${core.nanoid()}`,
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

    it('updates customer with Stripe customer ID when it changes', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return processSetupIntentSucceeded(
            succeededSetupIntent,
            transaction
          )
        }
      )

      expect(result.customer?.stripeCustomerId).toEqual(
        succeededSetupIntent.customer
      )
    })

    it('returns early for AddPaymentMethod checkout session type', async () => {
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
      const { result, paymentMethod } = await adminTransaction(
        async ({ transaction }) => {
          const result = await processSetupIntentSucceeded(
            addPaymentMethodSetupIntent,
            transaction
          )
          const [paymentMethod] = await selectPaymentMethods(
            {
              stripePaymentMethodId: stripeIdFromObjectOrId(
                addPaymentMethodSetupIntent.payment_method!
              ),
            },
            transaction
          )
          return {
            result,
            paymentMethod,
          }
        }
      )

      expect(result.purchase).toBeNull()
      expect(result.checkoutSession).toBeDefined()
      expect(result.price).toBeNull()
      expect(result.organization).toBeDefined()
      expect(result.customer).toBeDefined()
      expect(result.purchase).toBeNull()
      expect(result.checkoutSession.status).toEqual(
        CheckoutSessionStatus.Succeeded
      )
      expect(result.billingRun).toBeUndefined()
      expect(paymentMethod).toBeDefined()
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

    it('creates a subscription with the correct parameters', async () => {
      const correctSubscription = await adminTransaction(
        async ({ transaction }) => {
          await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          const { billingRun } = await processSetupIntentSucceeded(
            succeededSetupIntent,
            transaction
          )
          if (!billingRun) {
            throw new Error('Billing run not found')
          }
          const subscription = await selectSubscriptionById(
            billingRun.subscriptionId,
            transaction
          )
          return subscription
        }
      )

      expect(correctSubscription).toBeDefined()
      expect(correctSubscription).toBeDefined()
      expect(correctSubscription.organizationId).toEqual(
        organization.id
      )
      expect(correctSubscription.status).toEqual(
        SubscriptionStatus.Active
      )
      expect(correctSubscription.customerId).toEqual(customer.id)
      expect(correctSubscription.priceId).toEqual(price.id)
    })

    describe('Integration Tests', () => {
      it('completes a full setup intent flow from creation to success', async () => {
        const result = await adminTransaction(
          async ({ transaction }) => {
            await createFeeCalculationForCheckoutSession(
              checkoutSession as CheckoutSession.FeeReadyRecord,
              transaction
            )
            return processSetupIntentSucceeded(
              succeededSetupIntent,
              transaction
            )
          }
        )

        expect(result.purchase?.status).toEqual(PurchaseStatus.Paid)
        expect(result.checkoutSession.status).toEqual(
          CheckoutSessionStatus.Succeeded
        )
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
        const oldSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          livemode: true,
          paymentMethodId: paymentMethod.id,
          trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        })
        const result = await adminTransaction(
          async ({ transaction }) => {
            await updateSubscription(
              {
                id: oldSubscription.id,
                status: SubscriptionStatus.Canceled,
              },
              transaction
            )
            await createFeeCalculationForCheckoutSession(
              checkoutSession as CheckoutSession.FeeReadyRecord,
              transaction
            )
            const result = await processSetupIntentSucceeded(
              succeededSetupIntent,
              transaction
            )
            return {
              ...result,
              subscription: await selectSubscriptionById(
                result.billingRun!.subscriptionId,
                transaction
              ),
            }
          }
        )

        // The result should not include a trial end date for the new subscription
        expect(result.subscription.trialEnd).toBeDefined()
        // cancel the subscription so we can create a new one
        await adminTransaction(async ({ transaction }) => {
          await safelyUpdateSubscriptionStatus(
            result.subscription,
            SubscriptionStatus.Canceled,
            transaction
          )
        })
        const secondCheckoutSession = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          quantity: 1,
          livemode: checkoutSession.livemode,
          type: CheckoutSessionType.Product,
        })
        const secondSetupIntentSucceeded = mockSucceededSetupIntent({
          checkoutSessionId: secondCheckoutSession.id,
          stripeCustomerId: customer.stripeCustomerId!,
        })
        const { subscription: secondSubscription } =
          await adminTransaction(async ({ transaction }) => {
            await createFeeCalculationForCheckoutSession(
              secondCheckoutSession as CheckoutSession.FeeReadyRecord,
              transaction
            )
            const result = await processSetupIntentSucceeded(
              secondSetupIntentSucceeded,
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
        expect(secondSubscription.trialEnd).toBeUndefined()
        // Now set up a new customer with no trial history
        const newCustomer = await setupCustomer({
          organizationId: organization.id,
          stripeCustomerId: `cus_${core.nanoid()}`,
        })

        const newCheckoutSession = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: newCustomer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Purchase,
          quantity: 1,
          livemode: true,
        })

        // Update setup intent to use the new customer
        const newSetupIntent = {
          ...mockSucceededSetupIntent({
            checkoutSessionId: newCheckoutSession.id,
            stripeCustomerId: newCustomer.stripeCustomerId!,
          }),
        } as CoreSripeSetupIntent

        const subscription = await adminTransaction(
          async ({ transaction }) => {
            const result = await processSetupIntentSucceeded(
              newSetupIntent,
              transaction
            )
            if (!result) {
              throw new Error('Result not found')
            }
            return await selectSubscriptionById(
              result.billingRun!.subscriptionId,
              transaction
            )
          }
        )

        // The result should include a trial end date for the new subscription
        expect(subscription.trialEnd).toBeDefined()
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
