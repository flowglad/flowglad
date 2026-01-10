import { beforeEach, describe, expect, it, vi } from 'vitest'
import { insertCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'

// Only mock Next headers to satisfy runtime; avoid higher-level mocks
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
  cookies: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}))

import {
  setupCheckoutSession,
  setupCustomer,
  setupDiscount,
  setupFeeCalculation,
  setupOrg,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupTestFeaturesAndProductFeatures,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { Price } from '@/db/schema/prices'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import {
  CheckoutFlowType,
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import {
  calculateTrialEligibility,
  checkoutInfoForCheckoutSession,
  checkoutInfoForPriceWhere,
  hasCustomerUsedTrial,
} from './checkoutHelpers'

describe('checkoutHelpers', () => {
  describe('checkoutInfoForPriceWhere', () => {
    // Seed helpers
    const seedPrice = async (
      type: PriceType,
      opts?: { productActive?: boolean; priceActive?: boolean }
    ) => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'P',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: opts?.productActive ?? true,
      })
      let usageMeterId: string | undefined
      if (type === PriceType.Usage) {
        const meter = await setupUsageMeter({
          organizationId: organization.id,
          name: 'Meter',
          livemode: true,
          pricingModelId: product.pricingModelId,
        })
        usageMeterId = meter.id
      }

      // Build price params conditionally based on type
      // TypeScript needs explicit type narrowing for discriminated unions
      let priceParams: Parameters<typeof setupPrice>[0]

      if (type === PriceType.SinglePayment) {
        priceParams = {
          productId: product.id,
          name: 'X',
          type: PriceType.SinglePayment,
          unitPrice: 1000,
          livemode: true,
          isDefault: true,
          currency: CurrencyCode.USD,
          active: opts?.priceActive ?? true,
        }
      } else if (type === PriceType.Usage) {
        if (!usageMeterId) {
          throw new Error('Usage price requires usageMeterId')
        }
        priceParams = {
          productId: product.id,
          name: 'X',
          type: PriceType.Usage,
          unitPrice: 1000,
          livemode: true,
          isDefault: true,
          currency: CurrencyCode.USD,
          active: opts?.priceActive ?? true,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          usageMeterId,
        }
      } else {
        // PriceType.Subscription
        priceParams = {
          productId: product.id,
          name: 'X',
          type: PriceType.Subscription,
          unitPrice: 1000,
          livemode: true,
          isDefault: true,
          currency: CurrencyCode.USD,
          active: opts?.priceActive ?? true,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
        }
      }

      const price = await setupPrice(priceParams)
      return { organization, product, price }
    }
    it.each([
      {
        label: 'inactive product',
        productActive: false,
        priceActive: true,
      },
    ])('%s → error', async ({ productActive, priceActive }) => {
      const { organization, price } = await seedPrice(
        PriceType.SinglePayment,
        { productActive, priceActive }
      )
      const result = await checkoutInfoForPriceWhere({
        id: price.id,
      })
      expect(result.success).toBe(false)
      if (result.success) throw new Error('Expected error')
      expect(result.organization.id).toBe(organization.id)
      expect(result.checkoutInfo).toBeNull()
    })

    it.each([
      {
        label: 'SinglePayment',
        type: PriceType.SinglePayment,
        expected: CheckoutFlowType.SinglePayment,
      },
      {
        label: 'Subscription',
        type: PriceType.Subscription,
        expected: CheckoutFlowType.Subscription,
      },
      {
        label: 'Usage',
        type: PriceType.Usage,
        expected: CheckoutFlowType.Subscription,
      },
    ])('active %s → success', async ({ type, expected }) => {
      const { price } = await seedPrice(type)
      const result = await checkoutInfoForPriceWhere({
        id: price.id,
      })
      expect(result.success).toBe(true)
      if (!result.success) throw new Error('Expected success')
      expect(result.checkoutInfo.flowType).toBe(expected)
    })
    // Intentionally avoid asserting on Stripe client_secret here to
    // keep tests aligned with msw stripeServer and real flows
  })

  describe('checkoutInfoForCheckoutSession', () => {
    // Helper to create a typical product-session setup
    const makeSession = async (
      type: PriceType = PriceType.Subscription
    ) => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Prod',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })

      // Build price params conditionally based on type
      // TypeScript needs explicit type narrowing for discriminated unions
      let priceParams: Parameters<typeof setupPrice>[0]

      if (type === PriceType.SinglePayment) {
        priceParams = {
          productId: product.id,
          name: 'Price',
          type: PriceType.SinglePayment,
          unitPrice: 500,
          livemode: true,
          isDefault: true,
          currency: CurrencyCode.USD,
          active: true,
        }
      } else {
        // PriceType.Subscription (default for this helper)
        priceParams = {
          productId: product.id,
          name: 'Price',
          type: PriceType.Subscription,
          unitPrice: 500,
          livemode: true,
          isDefault: true,
          currency: CurrencyCode.USD,
          active: true,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
        }
      }

      const price = await setupPrice(priceParams)
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const session = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      return { organization, product, price, customer, session }
    }

    it('valid session with customer → includes product/price/org and customer', async () => {
      const { organization, product, price, customer, session } =
        await makeSession()
      await adminTransaction(async ({ transaction }) => {
        const result = await checkoutInfoForCheckoutSession(
          session.id,
          transaction
        )
        expect(result.product.id).toBe(product.id)
        expect(result.price.id).toBe(price.id)
        expect(result.sellerOrganization.id).toBe(organization.id)
        expect(result.maybeCustomer?.id).toBe(customer.id)
      })
    })

    it('valid session without customer → includes product/price/org and no customer', async () => {
      const { organization, product, price } = await makeSession()
      await adminTransaction(async ({ transaction }) => {
        const noCustomerSession = await insertCheckoutSession(
          {
            status: CheckoutSessionStatus.Open,
            type: CheckoutSessionType.Product,
            priceId: price.id,
            quantity: 1,
            livemode: price.livemode,
            organizationId: organization.id,
            invoiceId: null,
            purchaseId: null,
            targetSubscriptionId: null,
            automaticallyUpdateSubscriptions: null,
            preserveBillingCycleAnchor: false,
            outputName: null,
            outputMetadata: {},
            customerId: null,
            customerEmail: null,
            customerName: null,
          },
          transaction
        )
        const result = await checkoutInfoForCheckoutSession(
          noCustomerSession.id,
          transaction
        )
        expect(result.product.id).toBe(product.id)
        expect(result.price.id).toBe(price.id)
        expect(result.sellerOrganization.id).toBe(organization.id)
        expect(result.maybeCustomer).toBeNull()
      })
    })

    it('includes discount when discount is applied to checkout', async () => {
      const { organization, session } = await makeSession()
      const discount = await setupDiscount({
        organizationId: organization.id,
        name: 'Test Discount',
        amount: 10,
        code: 'SAVE10',
      })
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          { ...session, discountId: discount.id },
          transaction
        )
        const result = await checkoutInfoForCheckoutSession(
          session.id,
          transaction
        )
        expect(result.discount?.id).toBe(discount.id)
      })
    })

    it('includes latest feeCalculation for checkout', async () => {
      const { organization, price, session } = await makeSession()
      const first = await setupFeeCalculation({
        checkoutSessionId: session.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      const second = await setupFeeCalculation({
        checkoutSessionId: session.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
        const result = await checkoutInfoForCheckoutSession(
          session.id,
          transaction
        )
        expect(result.feeCalculation).not.toBeNull()
        expect(result.feeCalculation?.id).toBe(second.id)
        expect(result.feeCalculation?.id).not.toBe(first.id)
      })
    })

    it('includes current subscriptions if the customer has any', async () => {
      const { organization, price, customer, session } =
        await makeSession()
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
      await adminTransaction(async ({ transaction }) => {
        const result = await checkoutInfoForCheckoutSession(
          session.id,
          transaction
        )
        expect(
          result.maybeCurrentSubscriptions?.length
        ).toBeGreaterThan(0)
      })
    })

    it('includes features', async () => {
      const { organization, product, price, customer } =
        await makeSession()
      await setupTestFeaturesAndProductFeatures({
        organizationId: organization.id,
        productId: product.id,
        livemode: true,
        featureSpecs: [
          { name: 'Toggle Feature', type: FeatureType.Toggle },
          {
            name: 'Credits',
            type: FeatureType.UsageCreditGrant,
            amount: 100,
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
            usageMeterName: 'Feature Meter',
          },
        ],
      })
      const session = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
        const result = await checkoutInfoForCheckoutSession(
          session.id,
          transaction
        )
        expect(result.features?.length).toBeGreaterThan(0)
      })
    })
  })

  describe('hasCustomerUsedTrial', () => {
    it('should return false when customer has no subscriptions', async () => {
      const { organization } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await hasCustomerUsedTrial(
          customer.id,
          transaction
        )
        expect(result).toBe(false)
      })
    })

    it('should return false when customer has subscriptions but none with trialEnd', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      // Create subscription without trial
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
        trialEnd: undefined,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await hasCustomerUsedTrial(
          customer.id,
          transaction
        )
        expect(result).toBe(false)
      })
    })

    it('should return true when customer has one subscription with trialEnd', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      // Create subscription with trial
      const trialEnd = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days from now
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: SubscriptionStatus.Trialing,
        trialEnd,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await hasCustomerUsedTrial(
          customer.id,
          transaction
        )
        expect(result).toBe(true)
      })
    })

    it('should return true when customer has multiple subscriptions and one has trialEnd', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price1 = await setupPrice({
        productId: product.id,
        name: 'Price 1',
        type: PriceType.Subscription,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      const price2 = await setupPrice({
        productId: product.id,
        name: 'Price 2',
        type: PriceType.Subscription,
        unitPrice: 2000,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      // Create subscription without trial
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
        trialEnd: undefined,
      })

      // Create subscription with trial
      const trialEnd = Date.now() + 7 * 24 * 60 * 60 * 1000
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price2.id,
        status: SubscriptionStatus.Trialing,
        trialEnd,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await hasCustomerUsedTrial(
          customer.id,
          transaction
        )
        expect(result).toBe(true)
      })
    })

    it('should return true when customer has cancelled subscription with trialEnd', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      // Create cancelled subscription with trial (trialEnd should still be set)
      const trialEnd = Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days ago
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: SubscriptionStatus.Canceled,
        trialEnd,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await hasCustomerUsedTrial(
          customer.id,
          transaction
        )
        expect(result).toBe(true)
      })
    })
  })

  describe('calculateTrialEligibility', () => {
    it('should return undefined for SinglePayment price type', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Price',
        type: PriceType.SinglePayment,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await calculateTrialEligibility(
          price,
          customer,
          transaction
        )
        expect(result).toBeUndefined()
      })
    })

    it('should return true for Subscription price with anonymous customer', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await calculateTrialEligibility(
          price,
          null,
          transaction
        )
        expect(result).toBe(true)
      })
    })

    it('should return true for Subscription price with customer who has no trial history', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      // Create subscription without trial
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
        trialEnd: undefined,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await calculateTrialEligibility(
          price,
          customer,
          transaction
        )
        expect(result).toBe(true)
      })
    })

    it('should return false for Subscription price with customer who has used trial', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Product',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price1 = await setupPrice({
        productId: product.id,
        name: 'Price 1',
        type: PriceType.Subscription,
        unitPrice: 1000,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      const price2 = await setupPrice({
        productId: product.id,
        name: 'Price 2',
        type: PriceType.Subscription,
        unitPrice: 2000,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        active: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      // Create subscription with trial (customer has used trial)
      const trialEnd = Date.now() + 7 * 24 * 60 * 60 * 1000
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price1.id,
        status: SubscriptionStatus.Trialing,
        trialEnd,
      })

      await adminTransaction(async ({ transaction }) => {
        // Check eligibility for a different price
        const result = await calculateTrialEligibility(
          price2,
          customer,
          transaction
        )
        expect(result).toBe(false)
      })
    })
  })
})
