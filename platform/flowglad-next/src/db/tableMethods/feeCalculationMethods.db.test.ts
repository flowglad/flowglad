import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupBillingPeriod,
  setupCheckoutSession,
  setupCustomer,
  setupOrg,
  setupPrice,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  BillingPeriodStatus,
  CheckoutSessionStatus,
  CheckoutSessionType,
  CountryCode,
  CurrencyCode,
  FeeCalculationType,
  PaymentMethodType,
  PriceType,
} from '@/types'
import { core } from '@/utils/core'
import {
  derivePricingModelIdForFeeCalculation,
  insertFeeCalculation,
} from './feeCalculationMethods'

describe('Fee Calculation Methods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let billingPeriod: BillingPeriod.Record
  let checkoutSession: CheckoutSession.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: 'test@test.com',
        livemode: true,
      })
    ).unwrap()

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    const now = Date.now()
    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: now,
      endDate: now + 30 * 24 * 60 * 60 * 1000, // 30 days later
      livemode: true,
    })

    checkoutSession = (
      await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
    ).unwrap()
  })

  describe('derivePricingModelIdForFeeCalculation', () => {
    it('should derive pricingModelId from billingPeriod when billingPeriodId is provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const derivedPricingModelId =
          await derivePricingModelIdForFeeCalculation(
            {
              billingPeriodId: billingPeriod.id,
              checkoutSessionId: null,
            },
            transaction
          )

        expect(derivedPricingModelId).toBe(
          billingPeriod.pricingModelId
        )
        expect(derivedPricingModelId).toBe(pricingModel.id)
      })
    })

    it('should derive pricingModelId from checkoutSession when only checkoutSessionId is provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const derivedPricingModelId =
          await derivePricingModelIdForFeeCalculation(
            {
              billingPeriodId: null,
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )

        expect(derivedPricingModelId).toBe(
          checkoutSession.pricingModelId
        )
        expect(derivedPricingModelId).toBe(pricingModel.id)
      })
    })

    it('should prioritize billingPeriod over checkoutSession when both are provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const derivedPricingModelId =
          await derivePricingModelIdForFeeCalculation(
            {
              billingPeriodId: billingPeriod.id,
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )

        // Should use billingPeriod's pricingModelId
        expect(derivedPricingModelId).toBe(
          billingPeriod.pricingModelId
        )
      })
    })

    it('should throw error when neither billingPeriodId nor checkoutSessionId is provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          derivePricingModelIdForFeeCalculation(
            {
              billingPeriodId: null,
              checkoutSessionId: null,
            },
            transaction
          )
        ).rejects.toThrow(
          'Cannot derive pricingModelId for fee calculation: no valid parent found'
        )
      })
    })

    it('should throw error when billingPeriodId does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentBillingPeriodId = `billing_period_${core.nanoid()}`

        await expect(
          derivePricingModelIdForFeeCalculation(
            {
              billingPeriodId: nonExistentBillingPeriodId,
              checkoutSessionId: null,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('should throw error when checkoutSessionId does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentCheckoutSessionId = `chckt_session_${core.nanoid()}`

        await expect(
          derivePricingModelIdForFeeCalculation(
            {
              billingPeriodId: null,
              checkoutSessionId: nonExistentCheckoutSessionId,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })

  describe('insertFeeCalculation', () => {
    const baseFeeCalculationData = {
      currency: CurrencyCode.USD,
      billingAddress: {
        address: {
          line1: '123 Test St',
          line2: 'Apt 1',
          city: 'Test City',
          state: 'Test State',
          postal_code: '12345',
          country: CountryCode.US,
        },
      },
      paymentMethodType: PaymentMethodType.Card,
      discountAmountFixed: 0,
      discountId: null,
      paymentMethodFeeFixed: 0,
      baseAmount: 1000,
      internationalFeePercentage: '0',
      flowgladFeePercentage: '0.65',
      taxAmountFixed: 0,
      pretaxTotal: 1000,
      internalNotes: 'Test Fee Calculation',
    } as const

    it('should insert subscription fee calculation and derive pricingModelId from billingPeriod', async () => {
      await adminTransaction(async ({ transaction }) => {
        const feeCalculation = await insertFeeCalculation(
          {
            ...baseFeeCalculationData,
            organizationId: organization.id,
            billingPeriodId: billingPeriod.id,
            checkoutSessionId: null,
            priceId: null,
            purchaseId: null,
            type: FeeCalculationType.SubscriptionPayment,
            livemode: true,
          },
          transaction
        )

        expect(feeCalculation.pricingModelId).toBe(
          billingPeriod.pricingModelId
        )
        expect(feeCalculation.pricingModelId).toBe(pricingModel.id)
        expect(feeCalculation.billingPeriodId).toBe(billingPeriod.id)
      })
    })

    it('should insert checkout session fee calculation and derive pricingModelId from checkoutSession', async () => {
      await adminTransaction(async ({ transaction }) => {
        const feeCalculation = await insertFeeCalculation(
          {
            ...baseFeeCalculationData,
            organizationId: organization.id,
            billingPeriodId: null,
            checkoutSessionId: checkoutSession.id,
            priceId: price.id,
            purchaseId: null,
            type: FeeCalculationType.CheckoutSessionPayment,
            livemode: true,
          },
          transaction
        )

        expect(feeCalculation.pricingModelId).toBe(
          checkoutSession.pricingModelId
        )
        expect(feeCalculation.pricingModelId).toBe(pricingModel.id)
        expect(feeCalculation.checkoutSessionId).toBe(
          checkoutSession.id
        )
      })
    })

    it('should use provided pricingModelId without derivation when explicitly provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const feeCalculation = await insertFeeCalculation(
          {
            ...baseFeeCalculationData,
            organizationId: organization.id,
            billingPeriodId: billingPeriod.id,
            checkoutSessionId: null,
            priceId: null,
            purchaseId: null,
            type: FeeCalculationType.SubscriptionPayment,
            livemode: true,
            pricingModelId: pricingModel.id, // explicitly provided
          },
          transaction
        )

        expect(feeCalculation.pricingModelId).toBe(pricingModel.id)
      })
    })

    it('should throw error when neither billingPeriodId nor checkoutSessionId is provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          insertFeeCalculation(
            {
              ...baseFeeCalculationData,
              organizationId: organization.id,
              billingPeriodId: null,
              checkoutSessionId: null,
              priceId: null,
              purchaseId: null,
              type: FeeCalculationType.SubscriptionPayment,
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow(
          'Cannot derive pricingModelId for fee calculation: no valid parent found'
        )
      })
    })
  })
})
