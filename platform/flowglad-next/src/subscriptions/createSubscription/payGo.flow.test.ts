import { describe, expect, it } from 'vitest'
import {
  setupOrg,
  setupPrice,
  setupProduct,
  setupProductFeature,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { CreateCheckoutSessionInput } from '@/db/schema/checkoutSessions'
import {
  updateCheckoutSessionBillingAddress,
  updateCheckoutSessionPaymentMethodType,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectFeeCalculations } from '@/db/tableMethods/feeCalculationMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { updatePrice } from '@/db/tableMethods/priceMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  CheckoutSessionType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import { createCustomerBookkeeping } from '@/utils/bookkeeping'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'
import { createCheckoutSessionTransaction } from '@/utils/bookkeeping/createCheckoutSession'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import {
  type CoreStripePaymentIntent,
  processPaymentIntentStatusUpdated,
} from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import core from '@/utils/core'
import { IntentMetadataType } from '@/utils/stripe'
import { ingestAndProcessUsageEvent } from '@/utils/usage/usageEventHelpers'

describe('Pay as You Go Workflow E2E', () => {
  it('should handle creating a pay as you go flow from start to finish', async () => {
    // Setup:
    const {
      organization,
      pricingModel,
      product: freeProduct,
      price: freePrice,
    } = await setupOrg()
    await adminTransaction(async ({ transaction }) => {
      await updateOrganization(
        {
          id: organization.id,
          stripeAccountId: 'acct_123' + core.nanoid(),
          payoutsEnabled: true,
        },
        transaction
      )
    })
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'API Calls',
      pricingModelId: pricingModel.id,
    })
    const freeOneTimeCreditGrant = await setupUsageCreditGrantFeature(
      {
        organizationId: organization.id,
        name: 'Free 100 Credits',
        livemode: true,
        usageMeterId: usageMeter.id,
        amount: 100,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        pricingModelId: pricingModel.id,
      }
    )

    const paidOneTimeCreditGrant = await setupUsageCreditGrantFeature(
      {
        organizationId: organization.id,
        name: 'Paid 1000 Credits',
        livemode: true,
        usageMeterId: usageMeter.id,
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        pricingModelId: pricingModel.id,
      }
    )

    const paidProduct = await setupProduct({
      organizationId: organization.id,
      name: 'Paid API Product',
      pricingModelId: pricingModel.id,
    })

    await setupProductFeature({
      productId: freeProduct.id,
      featureId: freeOneTimeCreditGrant.id,
      organizationId: organization.id,
    })

    await setupProductFeature({
      productId: paidProduct.id,
      featureId: paidOneTimeCreditGrant.id,
      organizationId: organization.id,
    })

    const singlePaymentPrice = await setupPrice({
      productId: paidProduct.id,
      name: 'Paid Price',
      type: PriceType.SinglePayment,
      unitPrice: 10,
      livemode: true,
      isDefault: true,
    })
    const usagePrice = await setupPrice({
      productId: paidProduct.id,
      name: 'Usage Price',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: pricingModel.livemode,
      isDefault: false,
      usageMeterId: usageMeter.id,
    })
    // Override unitPrice to 0 for the default/free price
    await adminTransaction(async ({ transaction }) => {
      await updatePrice(
        {
          id: freePrice.id,
          type: freePrice.type,
          unitPrice: 0,
        },
        transaction
      )
    })
    const { customer, subscription } =
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        return await createCustomerBookkeeping(
          {
            customer: {
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
              name: 'Test Customer',
              externalId: 'test-customer' + core.nanoid(),
              email: 'test@test.com',
            },
          },
          {
            transaction,
            organizationId: organization.id,
            livemode: true,
          }
        )
      })

    if (!subscription) {
      throw new Error('No subscription')
    }

    // 1. Expect usage credits and initial billing
    await adminTransaction(async ({ transaction }) => {
      // expect there to be a usageCredit record for the meter and subscription
      const usageCredits = await selectUsageCredits(
        {
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
        },
        transaction
      )

      // For non-renewing subscriptions, Once credits are granted initially
      expect(usageCredits).toHaveLength(1)
      expect(usageCredits[0].usageMeterId).toBe(usageMeter.id)
      expect(usageCredits[0].status).toBe('posted')

      // Total should be 100 (Once)
      const totalIssuedAmount = usageCredits.reduce(
        (sum, credit) => sum + credit.issuedAmount,
        0
      )
      expect(totalIssuedAmount).toBe(100)

      // call @customerBillingTransaction and check state
      const billingState1 = await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction
      )
      const sub1 = billingState1.subscriptions[0]
      expect(sub1.status).toBe(SubscriptionStatus.Active)
      expect(sub1.experimental?.featureItems).toHaveLength(1)
      expect(sub1.experimental?.usageMeterBalances).toHaveLength(1)
      expect(
        sub1.experimental?.usageMeterBalances?.[0].availableBalance
      ).toBe(100) // 100 (Once)
    })

    // 2. Create a usage event for the subscription
    const staticTransctionId = 'test-' + core.nanoid()
    await comprehensiveAdminTransaction(async (ctx) => {
      const usageEvent = await ingestAndProcessUsageEvent(
        {
          input: {
            usageEvent: {
              subscriptionId: subscription.id,
              priceId: usagePrice.id,
              usageMeterId: usageMeter.id,
              amount: 100,
              transactionId: staticTransctionId,
              properties: {},
              usageDate: Date.now(),
            },
          },
          livemode: true,
        },
        ctx
      )
      return { result: usageEvent }
    })

    // 3. Call @customerBillingTransaction again and assert final state
    await adminTransaction(async ({ transaction }) => {
      const billingState2 = await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction
      )
      const sub2 = billingState2.subscriptions[0]
      expect(sub2.status).toBe(SubscriptionStatus.Active)
      expect(sub2.experimental?.featureItems).toHaveLength(1)
      expect(sub2.experimental?.usageMeterBalances).toHaveLength(1)
      expect(
        sub2.experimental?.usageMeterBalances?.[0].availableBalance
      ).toBe(0) // 100 - 100 (usage)
    })

    // 4. Create a usage event for the subscription
    await comprehensiveAdminTransaction(async (ctx) => {
      const usageEvent = await ingestAndProcessUsageEvent(
        {
          input: {
            usageEvent: {
              subscriptionId: subscription.id,
              priceId: usagePrice.id,
              usageMeterId: usageMeter.id,
              amount: 100,
              transactionId: staticTransctionId,
              properties: {},
              usageDate: Date.now(),
            },
          },
          livemode: true,
        },
        ctx
      )
      return { result: usageEvent }
    })

    // 5. Call @customerBillingTransaction again and assert final state
    await adminTransaction(async ({ transaction }) => {
      const billingState2Prime = await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction
      )
      const sub2Prime = billingState2Prime.subscriptions[0]
      expect(sub2Prime.status).toBe(SubscriptionStatus.Active)
      expect(sub2Prime.experimental?.featureItems).toHaveLength(1)
      expect(sub2Prime.experimental?.usageMeterBalances).toHaveLength(
        1
      )
      /**
       * Expect the available balance to be 0
       * (Started with 100 credits, used 100 credits)
       */
      expect(
        sub2Prime.experimental?.usageMeterBalances?.[0]
          .availableBalance
      ).toBe(0)
    })

    // 2. Call @createCheckoutSessionTransaction to create an ActivateSubscription checkout session
    const checkoutSession = await comprehensiveAdminTransaction(
      async (ctx) => {
        const { transaction } = ctx
        const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
          {
            type: CheckoutSessionType.Product,
            customerExternalId: customer.externalId,
            successUrl: 'https://test.com/success',
            cancelUrl: 'https://test.com/cancel',
            priceId: singlePaymentPrice.id,
          }
        const { checkoutSession } =
          await createCheckoutSessionTransaction(
            {
              checkoutSessionInput,
              organizationId: organization.id,
              livemode: true,
            },
            transaction
          )
        await updateCheckoutSessionBillingAddress(
          {
            id: checkoutSession.id,
            billingAddress: {
              address: {
                line1: '123 Main St',
                line2: 'Apt 4B',
                city: 'Anytown',
                state: 'CA',
                postal_code: '12345',
                country: 'US',
              },
              name: 'John Doe',
              firstName: 'John',
            },
          },
          transaction
        )
        await updateCheckoutSessionPaymentMethodType(
          {
            id: checkoutSession.id,
            paymentMethodType: PaymentMethodType.Card,
          },
          transaction
        )
        // 3. Call @confirmCheckoutSession.ts to finalize it
        await confirmCheckoutSessionTransaction(
          { id: checkoutSession.id },
          ctx
        )

        // expect a feeCalculation for the checkout session
        const feeCalculations = await selectFeeCalculations(
          { checkoutSessionId: checkoutSession.id },
          transaction
        )
        expect(feeCalculations).toHaveLength(1)
        return { result: checkoutSession }
      }
    )

    await comprehensiveAdminTransaction(async (ctx) => {
      // 4. Call @processSetupIntentSucceeded with a stubbed paymentIntent
      const paymentIntent: CoreStripePaymentIntent = {
        id: 'si_123',
        status: 'succeeded',
        latest_charge: 'ch_123' + core.nanoid(),
        metadata: {
          type: IntentMetadataType.CheckoutSession,
          checkoutSessionId: checkoutSession.id,
        },
      }

      const result = await processPaymentIntentStatusUpdated(
        paymentIntent,
        ctx
      )
      return { result }
    })

    await comprehensiveAdminTransaction(async ({ transaction }) => {
      // 5. Call @customerBillingTransaction again and assert final state
      const billingState3 = await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction
      )

      const activatedSubscription = billingState3.subscriptions.find(
        (s) => s.id === subscription.id
      )

      expect(activatedSubscription?.status).toBe(
        SubscriptionStatus.Active
      )
      expect(
        activatedSubscription?.experimental?.featureItems
      ).toHaveLength(1)
      expect(
        activatedSubscription?.experimental?.usageMeterBalances?.[0]
          .availableBalance
      ).toBe(1000) // 100 - 100 (usage) + 1000 (payment) = 1000
      return { result: null }
    })

    // 6. Create a usage event after payment
    const newTransactionId = 'test2-' + core.nanoid()
    await comprehensiveAdminTransaction(async (ctx) => {
      const usageEvent = await ingestAndProcessUsageEvent(
        {
          input: {
            usageEvent: {
              subscriptionId: subscription.id,
              priceId: usagePrice.id,
              usageMeterId: usageMeter.id,
              amount: 100,
              transactionId: newTransactionId,
              properties: {},
              usageDate: Date.now(),
            },
          },
          livemode: true,
        },
        ctx
      )
      return { result: usageEvent }
    })

    // 7. Call @customerBillingTransaction again and assert final state after new usage
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      const billingState4 = await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction
      )
      const activatedSubscriptionAfterUsage =
        billingState4.subscriptions.find(
          (s) => s.id === subscription.id
        )
      expect(
        activatedSubscriptionAfterUsage?.experimental
          ?.usageMeterBalances?.[0].availableBalance
      ).toBe(900) // 1000 - 100 (new usage) = 900
      return { result: null }
    })
  }, 120000)
})
