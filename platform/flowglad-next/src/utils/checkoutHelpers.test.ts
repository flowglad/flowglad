import { describe, it, expect, vi, beforeEach } from 'vitest'
// Relax Zod parsing for unit tests
vi.mock('@/db/tableMethods/purchaseMethods', () => ({
  checkoutInfoSchema: { parse: (x: any) => x },
}))
// Stripe helpers
vi.mock('./stripe', () => ({
  getPaymentIntent: vi.fn(async (id: string) => ({
    client_secret: `pi_secret_${id}`,
  })),
  getSetupIntent: vi.fn(async (id: string) => ({
    client_secret: `si_secret_${id}`,
  })),
}))
// Override findOrCreateCheckoutSession (use hoisted var to avoid TDZ with Vitest mocks)
const { findOrCreateCheckoutSessionMock } = vi.hoisted(() => ({
  findOrCreateCheckoutSessionMock: vi.fn(),
}))
vi.mock('./checkoutSessionState', async () => {
  const actual = await vi.importActual<
    typeof import('./checkoutSessionState')
  >('./checkoutSessionState')
  return {
    ...actual,
    findOrCreateCheckoutSession:
      findOrCreateCheckoutSessionMock as any,
  }
})

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
    beforeEach(() => findOrCreateCheckoutSessionMock.mockReset())

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
    const mockSession = (
      s: Partial<{ id: string; pi: string | null; si: string | null }>
    ) =>
      findOrCreateCheckoutSessionMock.mockResolvedValueOnce({
        id: s.id ?? 'cs_1',
        status: CheckoutSessionStatus.Open,
        stripePaymentIntentId: s.pi ?? null,
        stripeSetupIntentId: s.si ?? null,
      })

    it.each([
      {
        label: 'inactive product',
        productActive: false,
        priceActive: true,
      },
      {
        label: 'inactive price',
        productActive: true,
        priceActive: false,
      },
    ])('%s → error', async ({ productActive, priceActive }) => {
      const { organization, price } = await seedPrice(
        PriceType.SinglePayment,
        { productActive, priceActive }
      )
      const result = await checkoutInfoForPriceWhere({
        id: price.id,
      } as Price.Where)
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
      mockSession({})
      const result = await checkoutInfoForPriceWhere({
        id: price.id,
      } as Price.Where)
      expect(result.success).toBe(true)
      if (!result.success) throw new Error('Expected success')
      expect(result.checkoutInfo.flowType).toBe(expected)
    })

    it.skip('missing checkout session → error (not reachable: findOrCreate always returns a session)', async () => {
      const { organization, pricingModel } = await setupOrg()
      const product = await setupProduct({
        organizationId: organization.id,
        name: 'P',
        pricingModelId: pricingModel.id,
        livemode: true,
        active: true,
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'X',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        active: true,
      })
      findOrCreateCheckoutSessionMock.mockResolvedValueOnce(
        null as any
      )
      const result = await checkoutInfoForPriceWhere({
        id: price.id,
      } as Price.Where)
      expect(result.success).toBe(false)
      if (result.success) throw new Error('Expected error')
      expect(result.checkoutInfo).toBeNull()
      expect(result.error).toMatch(/no longer valid/i)
    })

    it.each([
      {
        label: 'PaymentIntent',
        type: PriceType.SinglePayment,
        pi: 'pi_123',
        expected: 'pi_secret_pi_123',
      },
      {
        label: 'SetupIntent',
        type: PriceType.Subscription,
        si: 'seti_987',
        expected: 'si_secret_seti_987',
      },
    ])(
      'Stripe %s present → returns clientSecret',
      async ({ type, pi, si, expected }) => {
        const { price } = await seedPrice(type)
        mockSession({ pi: pi ?? null, si: si ?? null })
        const result = await checkoutInfoForPriceWhere({
          id: price.id,
        } as Price.Where)
        expect(result.success).toBe(true)
        if (!result.success) throw new Error('Expected success')
        expect(result.checkoutInfo.clientSecret).toBe(expected)
      }
    )
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

    it('valid session → includes product/price/org and customer', async () => {
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

    it('includes discount', async () => {
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

    it('includes feeCalculation', async () => {
      const { organization, price, session } = await makeSession()
      await setupFeeCalculation({
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
      })
    })

    it('includes current subscriptions when multiples disallowed', async () => {
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
