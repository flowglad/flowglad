import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  checkoutInfoForPriceWhere,
  checkoutInfoForCheckoutSession,
} from './checkoutHelpers'
import {
  setupOrg,
  setupProduct,
  setupPrice,
  setupCustomer,
  setupCheckoutSession,
  setupDiscount,
  setupSubscription,
  setupFeeCalculation,
  setupTestFeaturesAndProductFeatures,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  PriceType,
  IntervalUnit,
  CurrencyCode,
  CheckoutSessionStatus,
  CheckoutSessionType,
  SubscriptionStatus,
  CheckoutFlowType,
  FeatureType,
  FeatureUsageGrantFrequency,
} from '@/types'
import { Price } from '@/db/schema/prices'
import { adminTransaction } from '@/db/adminTransaction'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'

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
      const price = await setupPrice({
        productId: product.id,
        name: 'X',
        type,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: opts?.priceActive ?? true,
        usageMeterId,
      })
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
      const price = await setupPrice({
        productId: product.id,
        name: 'Price',
        type,
        unitPrice: 500,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
      })
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

    it('missing priceId → throws', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'Prod',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'P',
        type: PriceType.SinglePayment,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoiceSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
        await expect(
          checkoutInfoForCheckoutSession(
            invoiceSession.id,
            transaction
          )
        ).rejects.toThrow(/No price id found/i)
      })
    })

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
        const { insertCheckoutSession } = await import(
          '@/db/tableMethods/checkoutSessionMethods'
        )
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
})
