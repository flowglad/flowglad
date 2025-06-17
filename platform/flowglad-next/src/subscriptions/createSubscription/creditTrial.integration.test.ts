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
} from '../../../seedDatabase'
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

describe('Subscription Activation Workflow E2E', () => {
  it('should handle activating a credit trial subscription', async () => {
    // Setup:
    const { organization, catalog } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'API Calls',
      catalogId: catalog.id,
    })
    const toggleFeature = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Cool Toggle',
      livemode: true,
      catalogId: catalog.id,
    })
    const oneTimeCreditGrant = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'One Time 1000 Credits',
      livemode: true,
      usageMeterId: usageMeter.id,
      amount: 1000,
      renewalFrequency: FeatureUsageGrantFrequency.Once,
      catalogId: catalog.id,
    })
    const recurringCreditGrant = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'Recurring 100 Credits',
      livemode: true,
      usageMeterId: usageMeter.id,
      amount: 100,
      renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
      catalogId: catalog.id,
    })

    const product = await setupProduct({
      organizationId: organization.id,
      name: 'Test API Product',
      catalogId: catalog.id,
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
    console.log('price', price)

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
        console.log(
          'output.result.subscription',
          output.result.subscription
        )
        expect(output.result.subscription).toBeDefined()
        expect(output.ledgerCommand).toBeDefined()
        console.log('output.ledgerCommand', output.ledgerCommand)
        return output
      }
    )
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
      console.log('billingState1', billingState1)
      const sub1 = billingState1.subscriptions[0]
      expect(sub1.status).toBe(SubscriptionStatus.CreditTrial)
      expect(sub1.experimental?.featureItems).toHaveLength(3)
      expect(sub1.experimental?.usageMeterBalances).toHaveLength(1)
      expect(
        sub1.experimental?.usageMeterBalances?.[0].availableBalance
      ).toBe(1000)

      // 2. Call @createCheckoutSessionTransaction to create an ActivateSubscription checkout session
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
      const billingState2 = await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction
      )

      const activatedSubscription = billingState2.subscriptions.find(
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
      ).toBe(1000)
    })
  })
})
