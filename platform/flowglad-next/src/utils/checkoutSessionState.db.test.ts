import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  CheckoutSessionType,
  IntervalUnit,
  PriceType,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupProduct,
  setupPurchase,
  setupUsageMeter,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { core } from '@/utils/core'
import { createNonInvoiceCheckoutSession } from './checkoutSessionState'

describe('createNonInvoiceCheckoutSession', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let singlePaymentPrice: Price.Record
  let subscriptionPrice: Price.Record
  let usagePrice: Price.Record
  let usageMeter: UsageMeter.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const { organization: org, pricingModel: pm } = await setupOrg()
    pricingModel = pm
    organization = org
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
    })
    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: false,
    })

    // Create a non-default product for testing
    const nonDefaultProduct = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product',
      livemode: false,
      pricingModelId: pricingModel.id,
      active: true,
      default: false,
    })

    singlePaymentPrice = await setupPrice({
      productId: nonDefaultProduct.id,
      type: PriceType.SinglePayment,
      name: 'Single Payment Price',
      unitPrice: 1000,
      livemode: false,
      isDefault: false,
    })
    subscriptionPrice = await setupPrice({
      productId: nonDefaultProduct.id,
      type: PriceType.Subscription,
      name: 'Subscription Price',
      unitPrice: 500,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: false,
      isDefault: false,
    })
    usagePrice = await setupPrice({
      type: PriceType.Usage,
      name: 'Usage Price',
      unitPrice: 100,
      intervalUnit: IntervalUnit.Day,
      intervalCount: 1,
      livemode: false,
      isDefault: false,
      usageMeterId: usageMeter.id,
    })
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  describe('Default product validation', () => {
    it('should throw an error when trying to create a checkout session for a default product', async () => {
      // Create a default product and price
      const { organization: defaultOrg, product: defaultProduct } =
        await setupOrg()
      try {
        const defaultPrice = await setupPrice({
          productId: defaultProduct.id,
          type: PriceType.SinglePayment,
          name: 'Default Product Price',
          unitPrice: 0,
          livemode: true,
          isDefault: true,
        })

        const result = await adminTransactionWithResult(
          async ({ transaction }) => {
            return createNonInvoiceCheckoutSession(
              {
                price: defaultPrice,
                organizationId: defaultOrg.id,
              },
              transaction
            )
          }
        )

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error.message).toContain(
            'Checkout sessions cannot be created for default products. Default products are automatically assigned to customers and do not require manual checkout.'
          )
        }
      } finally {
        await teardownOrg({ organizationId: defaultOrg.id })
      }
    })

    it('should allow creating checkout sessions for non-default products', async () => {
      // This test verifies that the existing functionality still works for non-default products
      const checkoutSession = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return createNonInvoiceCheckoutSession(
            {
              price: singlePaymentPrice,
              organizationId: organization.id,
            },
            transaction
          )
        })
      ).unwrap()

      expect(typeof checkoutSession.stripePaymentIntentId).toBe(
        'string'
      )
      expect(
        checkoutSession.stripePaymentIntentId!.length
      ).toBeGreaterThan(0)
      expect(checkoutSession.stripeSetupIntentId).toBeNull()
    })
  })

  describe('Product checkout sessions', () => {
    it('should create a checkout session for a SinglePayment product', async () => {
      const checkoutSession = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return createNonInvoiceCheckoutSession(
            {
              price: singlePaymentPrice,
              organizationId: organization.id,
            },
            transaction
          )
        })
      ).unwrap()

      expect(typeof checkoutSession.stripePaymentIntentId).toBe(
        'string'
      )
      expect(
        checkoutSession.stripePaymentIntentId!.length
      ).toBeGreaterThan(0)
      expect(checkoutSession.stripeSetupIntentId).toBeNull()
      expect(checkoutSession.type).toBe(CheckoutSessionType.Product)
      expect(checkoutSession.priceId).toBe(singlePaymentPrice.id)
      expect(checkoutSession.pricingModelId).toBe(pricingModel.id)
      expect(checkoutSession.pricingModelId).toBe(
        singlePaymentPrice.pricingModelId
      )
    })

    it('should create a checkout session for a Subscription product', async () => {
      const checkoutSession = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return createNonInvoiceCheckoutSession(
            {
              price: subscriptionPrice,
              organizationId: organization.id,
            },
            transaction
          )
        })
      ).unwrap()

      expect(checkoutSession.stripePaymentIntentId).toBeNull()
      expect(typeof checkoutSession.stripeSetupIntentId).toBe(
        'string'
      )
      expect(
        checkoutSession.stripeSetupIntentId!.length
      ).toBeGreaterThan(0)
      expect(checkoutSession.type).toBe(CheckoutSessionType.Product)
      expect(checkoutSession.priceId).toBe(subscriptionPrice.id)
      expect(checkoutSession.pricingModelId).toBe(pricingModel.id)
      expect(checkoutSession.pricingModelId).toBe(
        subscriptionPrice.pricingModelId
      )
    })

    it('should create a checkout session for a Usage-based product', async () => {
      const checkoutSession = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return createNonInvoiceCheckoutSession(
            {
              price: usagePrice,
              organizationId: organization.id,
            },
            transaction
          )
        })
      ).unwrap()

      expect(typeof checkoutSession.stripeSetupIntentId).toBe(
        'string'
      )
      expect(
        checkoutSession.stripeSetupIntentId!.length
      ).toBeGreaterThan(0)
      expect(checkoutSession.type).toBe(CheckoutSessionType.Product)
      expect(checkoutSession.priceId).toBe(usagePrice.id)
      expect(checkoutSession.pricingModelId).toBe(pricingModel.id)
      expect(checkoutSession.pricingModelId).toBe(
        usagePrice.pricingModelId
      )
    })
  })

  describe('Add payment method checkout sessions', () => {
    it('should create a checkout session for AddPaymentMethod', async () => {
      const checkoutSession = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return createNonInvoiceCheckoutSession(
            {
              price: subscriptionPrice,
              organizationId: organization.id,
              targetSubscriptionId: 'sub_123',
              customerId: customer.id,
            },
            transaction
          )
        })
      ).unwrap()

      expect(typeof checkoutSession.stripeSetupIntentId).toBe(
        'string'
      )
      expect(checkoutSession.type).toBe(
        CheckoutSessionType.AddPaymentMethod
      )
      expect(checkoutSession.targetSubscriptionId).toBe('sub_123')
      expect(checkoutSession.customerId).toBe(customer.id)
      expect(checkoutSession.pricingModelId).toBe(pricingModel.id)
      expect(checkoutSession.pricingModelId).toBe(
        subscriptionPrice.pricingModelId
      )
    })
  })

  describe('Purchase checkout sessions', () => {
    it('should derive pricingModelId from price for SinglePayment purchase', async () => {
      const purchase = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: singlePaymentPrice.id,
        livemode: false,
      })

      const checkoutSession = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return createNonInvoiceCheckoutSession(
            {
              price: singlePaymentPrice,
              organizationId: organization.id,
              purchase,
            },
            transaction
          )
        })
      ).unwrap()

      expect(checkoutSession.pricingModelId).toBe(pricingModel.id)
      expect(checkoutSession.pricingModelId).toBe(
        singlePaymentPrice.pricingModelId
      )
      expect(checkoutSession.type).toBe(CheckoutSessionType.Purchase)
      expect(checkoutSession.purchaseId).toBe(purchase.id)
    })

    it('should derive pricingModelId from price for Subscription purchase', async () => {
      const purchase = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: subscriptionPrice.id,
        livemode: false,
      })

      const checkoutSession = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return createNonInvoiceCheckoutSession(
            {
              price: subscriptionPrice,
              organizationId: organization.id,
              purchase,
            },
            transaction
          )
        })
      ).unwrap()

      expect(checkoutSession.pricingModelId).toBe(pricingModel.id)
      expect(checkoutSession.pricingModelId).toBe(
        subscriptionPrice.pricingModelId
      )
      expect(checkoutSession.type).toBe(CheckoutSessionType.Purchase)
      expect(checkoutSession.purchaseId).toBe(purchase.id)
    })

    it('should derive pricingModelId from price for Usage purchase', async () => {
      const purchase = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: usagePrice.id,
        livemode: false,
      })

      const checkoutSession = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return createNonInvoiceCheckoutSession(
            {
              price: usagePrice,
              organizationId: organization.id,
              purchase,
            },
            transaction
          )
        })
      ).unwrap()

      expect(checkoutSession.pricingModelId).toBe(pricingModel.id)
      expect(checkoutSession.pricingModelId).toBe(
        usagePrice.pricingModelId
      )
      expect(checkoutSession.type).toBe(CheckoutSessionType.Purchase)
      expect(checkoutSession.purchaseId).toBe(purchase.id)
    })
  })
})
