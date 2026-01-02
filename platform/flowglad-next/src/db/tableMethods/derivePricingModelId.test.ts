import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCheckoutSession,
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPrice,
  setupPurchase,
  setupSubscription,
  setupUsageCredit,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  InvoiceStatus,
  PaymentStatus,
  PriceType,
  RefundStatus,
  UsageCreditType,
} from '@/types'
import { core, nanoid } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Invoice } from '../schema/invoices'
import type { Organization } from '../schema/organizations'
import type { Payment } from '../schema/payments'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { Purchase } from '../schema/purchases'
import type { Subscription } from '../schema/subscriptions'
import type { UsageCredit } from '../schema/usageCredits'
import type { UsageMeter } from '../schema/usageMeters'
import {
  derivePricingModelIdForCheckoutSession,
  insertCheckoutSession,
} from './checkoutSessionMethods'
import { derivePricingModelIdFromPrice } from './priceMethods'
import { derivePricingModelIdFromProduct } from './productMethods'
import {
  derivePricingModelIdFromPayment,
  insertRefund,
} from './refundMethods'
import { derivePricingModelIdFromUsageCredit } from './usageCreditMethods'
import { derivePricingModelIdFromUsageMeter } from './usageMeterMethods'

describe('derivePricingModelIdFromProduct', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
  })

  it('should successfully derive pricingModelId when product has pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromProduct(product.id, transaction)

      expect(derivedPricingModelId).toBe(product.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  // Note: We skip testing the case where product.pricingModelId is null because
  // the database schema enforces NOT NULL constraint on pricing_model_id.
  // This scenario cannot occur in production, so testing it would require
  // bypassing database constraints which is not a realistic test case.

  it('should throw an error when product does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentProductId = `prod_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromProduct(
          nonExistentProductId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdFromUsageMeter', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let usageMeter: UsageMeter.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })
  })

  it('should successfully derive pricingModelId when usage meter has pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromUsageMeter(
          usageMeter.id,
          transaction
        )

      expect(derivedPricingModelId).toBe(usageMeter.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  // Note: We skip testing the case where usageMeter.pricingModelId is null because
  // the database schema enforces NOT NULL constraint on pricing_model_id.
  // This scenario cannot occur in production, so testing it would require
  // bypassing database constraints which is not a realistic test case.

  it('should throw an error when usage meter does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentUsageMeterId = `um_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromUsageMeter(
          nonExistentUsageMeterId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdFromPrice', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })
  })

  it('should successfully derive pricingModelId from price via product', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromPrice(price.id, transaction)

      expect(derivedPricingModelId).toBe(product.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should throw an error when price does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentPriceId = `price_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromPrice(nonExistentPriceId, transaction)
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdFromUsageCredit', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let usageMeter: UsageMeter.Record
  let subscription: Subscription.Record
  let usageCredit: UsageCredit.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
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

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      usageMeterId: usageMeter.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      livemode: true,
      issuedAmount: 1000,
    })
  })

  it('should successfully derive pricingModelId from usage credit', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromUsageCredit(
          usageCredit.id,
          transaction
        )

      expect(derivedPricingModelId).toBe(usageCredit.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should throw an error when usage credit does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentUsageCreditId = `uc_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromUsageCredit(
          nonExistentUsageCreditId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdForCheckoutSession', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let purchase: Purchase.Record
  let invoice: Invoice.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      status: InvoiceStatus.Draft,
      livemode: true,
      priceId: price.id,
    })
  })

  it('should derive pricingModelId from priceId when provided (Product session)', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdForCheckoutSession(
          {
            priceId: price.id,
            purchaseId: null,
            invoiceId: null,
            customerId: null,
            type: CheckoutSessionType.Product,
          },
          transaction
        )

      expect(derivedPricingModelId).toBe(product.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should derive pricingModelId from purchaseId when priceId not provided (Purchase session)', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdForCheckoutSession(
          {
            priceId: null,
            purchaseId: purchase.id,
            invoiceId: null,
            customerId: null,
            type: CheckoutSessionType.Purchase,
          },
          transaction
        )

      expect(derivedPricingModelId).toBe(purchase.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should derive pricingModelId from invoiceId when priceId and purchaseId not provided (Invoice session)', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdForCheckoutSession(
          {
            priceId: null,
            purchaseId: null,
            invoiceId: invoice.id,
            customerId: null,
            type: CheckoutSessionType.Invoice,
          },
          transaction
        )

      expect(derivedPricingModelId).toBe(invoice.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should derive pricingModelId from customerId for AddPaymentMethod session when other IDs not provided', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdForCheckoutSession(
          {
            priceId: null,
            purchaseId: null,
            invoiceId: null,
            customerId: customer.id,
            type: CheckoutSessionType.AddPaymentMethod,
          },
          transaction
        )

      expect(derivedPricingModelId).toBe(customer.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should throw an error when no valid parent is provided', async () => {
    await adminTransaction(async ({ transaction }) => {
      await expect(
        derivePricingModelIdForCheckoutSession(
          {
            priceId: null,
            purchaseId: null,
            invoiceId: null,
            customerId: null,
            type: CheckoutSessionType.Product,
          },
          transaction
        )
      ).rejects.toThrow(
        'Cannot derive pricingModelId for checkout session: no valid parent found'
      )
    })
  })

  it('should throw an error when parent does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentPriceId = `price_${core.nanoid()}`

      await expect(
        derivePricingModelIdForCheckoutSession(
          {
            priceId: nonExistentPriceId,
            purchaseId: null,
            invoiceId: null,
            customerId: null,
            type: CheckoutSessionType.Product,
          },
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdFromPayment', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let payment: Payment.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      status: InvoiceStatus.Draft,
      livemode: true,
      priceId: price.id,
    })

    payment = await setupPayment({
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: 1000,
      status: PaymentStatus.Succeeded,
      stripeChargeId: `ch_${nanoid()}`,
      livemode: true,
    })
  })

  it('should successfully derive pricingModelId from payment', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromPayment(payment.id, transaction)

      expect(derivedPricingModelId).toBe(payment.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  it('should throw an error when payment does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentPaymentId = `payment_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromPayment(
          nonExistentPaymentId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('insertCheckoutSession with derived pricingModelId', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
      pricingModelId: pricingModel.id,
    })
  })

  it('should automatically derive and set pricingModelId when inserting Product checkout session', async () => {
    await adminTransaction(async ({ transaction }) => {
      const checkoutSession = await insertCheckoutSession(
        {
          organizationId: organization.id,
          type: CheckoutSessionType.Product,
          status: CheckoutSessionStatus.Open,
          priceId: price.id,
          customerId: customer.id,
          livemode: true,
          quantity: 1,
          purchaseId: null,
          invoiceId: null,
          targetSubscriptionId: null,
          preserveBillingCycleAnchor: false,
          automaticallyUpdateSubscriptions: null,
          billingAddress: null,
          customerEmail: customer.email,
          customerName: null,
          paymentMethodType: null,
          stripePaymentIntentId: null,
          stripeSetupIntentId: null,
          successUrl: null,
          cancelUrl: null,
          discountId: null,
          outputMetadata: null,
          outputName: null,
        },
        transaction
      )

      expect(checkoutSession.pricingModelId).toBe(
        product.pricingModelId
      )
      expect(checkoutSession.pricingModelId).toBe(pricingModel.id)
    })
  })
})

describe('insertRefund with derived pricingModelId', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let payment: Payment.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      status: InvoiceStatus.Draft,
      livemode: true,
      priceId: price.id,
    })

    payment = await setupPayment({
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: 1000,
      status: PaymentStatus.Succeeded,
      stripeChargeId: `ch_${nanoid()}`,
      livemode: true,
    })
  })

  it('should automatically derive and set pricingModelId when inserting refund', async () => {
    await adminTransaction(async ({ transaction }) => {
      const refund = await insertRefund(
        {
          organizationId: organization.id,
          paymentId: payment.id,
          subscriptionId: null,
          amount: 500,
          currency: CurrencyCode.USD,
          reason: 'Test refund',
          status: RefundStatus.Succeeded,
          refundProcessedAt: Date.now(),
          gatewayRefundId: null,
          notes: null,
          initiatedByUserId: null,
          livemode: true,
        },
        transaction
      )

      expect(refund.pricingModelId).toBe(payment.pricingModelId)
      expect(refund.pricingModelId).toBe(pricingModel.id)
    })
  })
})
