import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupProductFeature,
  setupToggleFeature,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import type { CreateCheckoutSessionInput } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import {
  selectCheckoutSessionById,
  updateCheckoutSessionBillingAddress,
  updateCheckoutSessionPaymentMethodType,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectFeeCalculations } from '@/db/tableMethods/feeCalculationMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'
import { createCheckoutSessionTransaction } from '@/utils/bookkeeping/createCheckoutSession'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import {
  type CoreSripeSetupIntent,
  processSetupIntentSucceeded,
} from '@/utils/bookkeeping/processSetupIntent'
import {
  checkoutInfoForCheckoutSession,
  checkoutInfoForPriceWhere,
} from '@/utils/checkoutHelpers'
import core from '@/utils/core'
import { createProductTransaction } from '@/utils/pricingModel'
import { IntentMetadataType } from '@/utils/stripe'

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}))

describe('Subscription Activation Workflow E2E - Time Trial', () => {
  let trialPeriodDays: number
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record
  let toggleFeature: Feature.Record

  beforeEach(async () => {
    // Define trial period length
    trialPeriodDays = 5
    // Setup organization, pricingModel, product
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    // Setup customer
    customer = await setupCustomer({
      organizationId: organization.id,
    })

    // Setup toggle feature and attach to product
    toggleFeature = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Test Toggle Feature',
      livemode: true,
      pricingModelId: pricingModel.id,
    })
  })

  it('should handle activating a time trial subscription', async () => {
    // 0. Create a user/membership to drive product creation
    const { user } = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    // 1. Create product and price via createProductTransaction
    const { product: createdProduct, prices } =
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const result = await createProductTransaction(
          {
            product: {
              name: 'Test API Product',
              description: 'Test',
              imageURL: 'https://flowglad.com/logo.png',
              active: true,
              singularQuantityLabel: 'unit',
              pluralQuantityLabel: 'units',
              pricingModelId: pricingModel.id,
              default: false,
              slug: `flowglad-test-product-price+${core.nanoid()}`,
            },
            prices: [
              {
                name: 'Time Trial Price',
                type: PriceType.Subscription,
                unitPrice: 10,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                isDefault: true,
                active: true,
                trialPeriodDays,
                usageMeterId: null,
                usageEventsPerUnit: null,
                slug: `flowglad-test-product-price+${core.nanoid()}`,
              },
            ],
          },
          {
            userId: user.id,
            transaction,
            livemode: true,
            organizationId: organization.id,
          }
        )
        return { result }
      })
    // 2. Associate the toggle feature with the created product
    await setupProductFeature({
      organizationId: organization.id,
      productId: createdProduct.id,
      featureId: toggleFeature.id,
    })
    // Override product and price for the rest of the test
    const product = createdProduct
    const price = prices[0]
    // Intermediary: check checkout info by product ID
    const infoByProduct = await checkoutInfoForPriceWhere({
      productId: product.id,
      isDefault: true,
    })
    expect(infoByProduct.success).toBe(true)
    if (!infoByProduct.success)
      throw new Error(
        'Expected checkoutInfoForPriceWhere success for product'
      )
    const ci1: any = infoByProduct.checkoutInfo
    expect(ci1.product.id).toBe(product.id)
    expect(ci1.price.id).toBe(price.id)
    expect(typeof ci1.checkoutSession.id).toBe('string')

    // Intermediary: check checkout info by price ID
    const infoByPrice = await checkoutInfoForPriceWhere({
      id: price.id,
    })
    expect(infoByPrice.success).toBe(true)
    if (!infoByPrice.success)
      throw new Error(
        'Expected checkoutInfoForPriceWhere success for price'
      )
    const ci2: any = infoByPrice.checkoutInfo
    expect(ci2.product.id).toBe(product.id)
    expect(ci2.price.id).toBe(price.id)

    const checkoutSession = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        // 1. Create checkout session
        const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
          {
            type: CheckoutSessionType.Product,
            customerExternalId: customer.externalId,
            priceId: price.id,
            quantity: 1,
            successUrl: 'https://test.com/success',
            cancelUrl: 'https://test.com/cancel',
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
        // 2. Update billing address & payment method
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
        // 3. Confirm checkout session
        await confirmCheckoutSessionTransaction(
          { id: checkoutSession.id },
          transaction
        )
        // 4. Expect fee calculation exists
        const feeCalculations = await selectFeeCalculations(
          { checkoutSessionId: checkoutSession.id },
          transaction
        )
        expect(feeCalculations).toHaveLength(1)
        return { result: checkoutSession }
      }
    )

    // Intermediary: check checkout info by checkout session ID
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      const sessionInfo = await checkoutInfoForCheckoutSession(
        checkoutSession.id,
        transaction
      )
      expect(sessionInfo.checkoutSession.id).toBe(checkoutSession.id)
      expect(sessionInfo.product.id).toBe(product.id)
      expect(sessionInfo.price.id).toBe(price.id)
      expect(typeof sessionInfo.feeCalculation).toBe('object')
      return { result: null }
    })

    await comprehensiveAdminTransaction(async ({ transaction }) => {
      // 5. Process setup intent
      const setupIntent: CoreSripeSetupIntent = {
        id: `si_${core.nanoid()}`,
        status: 'succeeded',
        customer: customer.stripeCustomerId,
        payment_method: `pm_${core.nanoid()}`,
        metadata: {
          type: IntentMetadataType.CheckoutSession,
          checkoutSessionId: checkoutSession.id,
        },
      }
      await processSetupIntentSucceeded(setupIntent, transaction)
      // 6. Final billing state
      const billingState = await customerBillingTransaction(
        {
          externalId: customer.externalId,
          organizationId: organization.id,
        },
        transaction
      )
      const sub = billingState.subscriptions[0]
      expect(sub.status).toBe(SubscriptionStatus.Trialing)
      expect(typeof sub.trialEnd).toBe('number')
      const diff = sub.trialEnd! - Date.now()
      expect(diff).toBeGreaterThanOrEqual(
        trialPeriodDays * 24 * 60 * 60 * 1000 - 1000
      )
      expect(diff).toBeLessThanOrEqual(
        trialPeriodDays * 24 * 60 * 60 * 1000 + 1000
      )
      expect(
        sub.experimental?.featureItems.some(
          (fi) => fi.featureId === toggleFeature.id
        )
      ).toBe(true)
      expect(typeof sub.defaultPaymentMethodId).toBe('string')
      expect(sub.defaultPaymentMethodId!.length).toBeGreaterThan(0)

      // After processing setup intent, verify checkoutSession status
      const finalSession = await selectCheckoutSessionById(
        checkoutSession.id,
        transaction
      )
      expect(finalSession.status).toBe(
        CheckoutSessionStatus.Succeeded
      )
      return { result: null }
    })
  })
})
