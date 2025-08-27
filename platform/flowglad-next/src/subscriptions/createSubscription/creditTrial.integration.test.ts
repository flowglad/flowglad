import {
  CoreSripeSetupIntent,
  processSetupIntentSucceeded,
} from '@/utils/bookkeeping/processSetupIntent'
import { describe, it, expect } from 'vitest'
import {
  setupCustomer,
  setupPrice,
  setupProduct,
  setupProductFeature,
  setupToggleFeature,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
  setupOrg,
} from '@/../seedDatabase'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'
import { createCheckoutSessionTransaction } from '@/utils/bookkeeping/createCheckoutSession'
import {
  CheckoutSessionType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import { selectFeeCalculations } from '@/db/tableMethods/feeCalculationMethods'
import { IntentMetadataType } from '@/utils/stripe'
import { createSubscriptionWorkflow } from './workflow'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { CreateCheckoutSessionInput } from '@/db/schema/checkoutSessions'
import {
  updateCheckoutSessionBillingAddress,
  updateCheckoutSessionPaymentMethodType,
} from '@/db/tableMethods/checkoutSessionMethods'
import core from '@/utils/core'
import { ingestAndProcessUsageEvent } from '@/utils/usage/usageEventHelpers'

describe('Subscription Activation Workflow E2E', () => {
  it('should handle activating a credit trial subscription', async () => {
    // Setup:
    const { organization, pricingModel } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'API Calls',
      pricingModelId: pricingModel.id,
    })
    const toggleFeature = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Cool Toggle',
      livemode: true,
      pricingModelId: pricingModel.id,
    })
    const oneTimeCreditGrant = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'One Time 1000 Credits',
      livemode: true,
      usageMeterId: usageMeter.id,
      amount: 1000,
      renewalFrequency: FeatureUsageGrantFrequency.Once,
      pricingModelId: pricingModel.id,
    })
    const recurringCreditGrant = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'Recurring 100 Credits',
      livemode: true,
      usageMeterId: usageMeter.id,
      amount: 100,
      renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
      pricingModelId: pricingModel.id,
    })

    const product = await setupProduct({
      organizationId: organization.id,
      name: 'Test API Product',
      pricingModelId: pricingModel.id,
    })
    await setupProductFeature({
      productId: product.id,
      featureId: toggleFeature.id,
      organizationId: organization.id,
    })
    await setupProductFeature({
      productId: product.id,
      featureId: oneTimeCreditGrant.id,
      organizationId: organization.id,
    })
    await setupProductFeature({
      productId: product.id,
      featureId: recurringCreditGrant.id,
      organizationId: organization.id,
    })

    const price = await setupPrice({
      productId: product.id,
      name: 'Credit Trial Price',
      type: PriceType.Subscription,
      unitPrice: 10,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      usageMeterId: usageMeter.id,
      startsWithCreditTrial: true,
    })
    const usagePrice = await setupPrice({
      productId: product.id,
      name: 'Usage Price',
      type: PriceType.Usage,
      unitPrice: 1,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
      startsWithCreditTrial: true,
    })
    const { subscription } = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        // 1. call @createSubscriptionWorkflow with a price that creates a credit trial
        const output = await createSubscriptionWorkflow(
          {
            price,
            product,
            organization,
            customer,
            livemode: true,
            quantity: 1,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            startDate: new Date(),
          },
          transaction
        )
        expect(output.result.subscription).toBeDefined()
        expect(output.ledgerCommand).toBeDefined()
        return output
      }
    )

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
      expect(usageCredits).toHaveLength(1)
      expect(usageCredits[0].usageMeterId).toBe(usageMeter.id)
      expect(usageCredits[0].status).toBe('posted')

      // call @customerBillingTransaction and check state
      const billingState1 = await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction
      )
      const sub1 = billingState1.subscriptions[0]
      expect(sub1.status).toBe(SubscriptionStatus.CreditTrial)
      expect(sub1.experimental?.featureItems).toHaveLength(3)
      expect(sub1.experimental?.usageMeterBalances).toHaveLength(1)
      expect(
        sub1.experimental?.usageMeterBalances?.[0].availableBalance
      ).toBe(1000)
    })

    // 2. Create a usage event for the subscription
    const staticTransctionId = 'test-' + core.nanoid()
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      return await ingestAndProcessUsageEvent(
        {
          input: {
            usageEvent: {
              subscriptionId: subscription.id,
              priceId: usagePrice.id,
              amount: 100,
              transactionId: staticTransctionId,
              properties: {},
              usageDate: new Date().getTime(),
            },
          },
          livemode: true,
        },
        transaction
      )
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
      expect(sub2.status).toBe(SubscriptionStatus.CreditTrial)
      expect(sub2.experimental?.featureItems).toHaveLength(3)
      expect(sub2.experimental?.usageMeterBalances).toHaveLength(1)
      expect(
        sub2.experimental?.usageMeterBalances?.[0].availableBalance
      ).toBe(900)
    })

    // 4. Create a usage event for the subscription
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      return await ingestAndProcessUsageEvent(
        {
          input: {
            usageEvent: {
              subscriptionId: subscription.id,
              priceId: usagePrice.id,
              amount: 100,
              transactionId: staticTransctionId,
              properties: {},
              usageDate: new Date().getTime(),
            },
          },
          livemode: true,
        },
        transaction
      )
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
      expect(sub2Prime.status).toBe(SubscriptionStatus.CreditTrial)
      expect(sub2Prime.experimental?.featureItems).toHaveLength(3)
      expect(sub2Prime.experimental?.usageMeterBalances).toHaveLength(
        1
      )
      /**
       * Expect the available balance to be 900 because the usage event was actually redundant
       */
      expect(
        sub2Prime.experimental?.usageMeterBalances?.[0]
          .availableBalance
      ).toBe(900)
    })

    // 2. Call @createCheckoutSessionTransaction to create an ActivateSubscription checkout session
    await adminTransaction(async ({ transaction }) => {
      const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
        {
          type: CheckoutSessionType.ActivateSubscription,
          customerExternalId: customer.externalId,
          targetSubscriptionId: subscription.id,
          successUrl: 'https://test.com/success',
          cancelUrl: 'https://test.com/cancel',
          priceId: price.id,
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
        transaction
      )

      // expect a feeCalculation for the checkout session
      const feeCalculations = await selectFeeCalculations(
        { checkoutSessionId: checkoutSession.id },
        transaction
      )
      expect(feeCalculations).toHaveLength(1)

      // 4. Call @processSetupIntentSucceeded with a stubbed setupIntent
      const setupIntent: CoreSripeSetupIntent = {
        id: 'si_123',
        status: 'succeeded',
        customer: 'cus_123' + core.nanoid(),
        payment_method: 'pm_123' + core.nanoid(),
        metadata: {
          type: IntentMetadataType.CheckoutSession,
          checkoutSessionId: checkoutSession.id,
        },
      }
      await processSetupIntentSucceeded(setupIntent, transaction)

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
      ).toHaveLength(3)
      const toggleFeatureResult =
        activatedSubscription?.experimental?.featureItems?.find(
          (fi) => fi.featureId === toggleFeature.id
        )
      expect(toggleFeatureResult).toBeDefined()
      expect(
        activatedSubscription?.experimental?.usageMeterBalances?.[0]
          .availableBalance
      ).toBe(900)
    })

    // 6. Create a usage event after activation
    const newTransactionId = 'test2-' + core.nanoid()
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      return await ingestAndProcessUsageEvent(
        {
          input: {
            usageEvent: {
              subscriptionId: subscription.id,
              priceId: usagePrice.id,
              amount: 100,
              transactionId: newTransactionId,
              properties: {},
              usageDate: new Date().getTime(),
            },
          },
          livemode: true,
        },
        transaction
      )
    })

    // 7. Call @customerBillingTransaction again and assert final state after new usage
    await adminTransaction(async ({ transaction }) => {
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
      ).toBe(800)
    })
  })
})
