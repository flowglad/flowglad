import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest'
import { createNonInvoiceCheckoutSession } from './checkoutSessionState'
import {
  setupOrg,
  setupCustomer,
  teardownOrg,
  setupPrice,
  setupUsageMeter,
  setupProduct,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { CheckoutSessionType, PriceType } from '@/types'
import { IntervalUnit } from '@/types'
import { UsageMeter } from '@/db/schema/usageMeters'
import { core } from '@/utils/core'

describe('createNonInvoiceCheckoutSession', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let singlePaymentPrice: Price.Record
  let subscriptionPrice: Price.Record
  let usagePrice: Price.Record
  let usageMeter: UsageMeter.Record
  beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  beforeEach(async () => {
    const { organization: org, pricingModel } = await setupOrg()
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
      intervalUnit: IntervalUnit.Day,
      intervalCount: 1,
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
      productId: nonDefaultProduct.id,
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
      const defaultPrice = await setupPrice({
        productId: defaultProduct.id,
        type: PriceType.SinglePayment,
        name: 'Default Product Price',
        unitPrice: 0,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })

      await expect(
        adminTransaction(async ({ transaction }) =>
          createNonInvoiceCheckoutSession(
            {
              price: defaultPrice,
              organizationId: defaultOrg.id,
            },
            transaction
          )
        )
      ).rejects.toThrow(
        'Checkout sessions cannot be created for default products. Default products are automatically assigned to customers and do not require manual checkout.'
      )
    })

    it('should allow creating checkout sessions for non-default products', async () => {
      // This test verifies that the existing functionality still works for non-default products
      const checkoutSession = await adminTransaction(
        async ({ transaction }) =>
          createNonInvoiceCheckoutSession(
            {
              price: singlePaymentPrice,
              organizationId: organization.id,
            },
            transaction
          )
      )

      expect(checkoutSession.stripePaymentIntentId).not.toBeNull()
      expect(checkoutSession.stripeSetupIntentId).toBeNull()
    })
  })

  describe('Product checkout sessions', () => {
    it('should create a checkout session for a SinglePayment product', async () => {
      const checkoutSession = await adminTransaction(
        async ({ transaction }) =>
          createNonInvoiceCheckoutSession(
            {
              price: singlePaymentPrice,
              organizationId: organization.id,
            },
            transaction
          )
      )

      expect(checkoutSession.stripePaymentIntentId).not.toBeNull()
      expect(checkoutSession.stripeSetupIntentId).toBeNull()
      expect(checkoutSession.type).toBe(CheckoutSessionType.Product)
      expect(checkoutSession.priceId).toBe(singlePaymentPrice.id)
    })

    it('should create a checkout session for a Subscription product', async () => {
      const checkoutSession = await adminTransaction(
        async ({ transaction }) =>
          createNonInvoiceCheckoutSession(
            {
              price: subscriptionPrice,
              organizationId: organization.id,
            },
            transaction
          )
      )

      expect(checkoutSession.stripePaymentIntentId).toBeNull()
      expect(checkoutSession.stripeSetupIntentId).not.toBeNull()
      expect(checkoutSession.type).toBe(CheckoutSessionType.Product)
      expect(checkoutSession.priceId).toBe(subscriptionPrice.id)
    })

    it('should create a checkout session for a Usage-based product', async () => {
      const checkoutSession = await adminTransaction(
        async ({ transaction }) =>
          createNonInvoiceCheckoutSession(
            {
              price: usagePrice,
              organizationId: organization.id,
            },
            transaction
          )
      )

      expect(checkoutSession.stripeSetupIntentId).not.toBeNull()
      expect(checkoutSession.type).toBe(CheckoutSessionType.Product)
      expect(checkoutSession.priceId).toBe(usagePrice.id)
    })
  })

  describe('Add payment method checkout sessions', () => {
    it('should create a checkout session for AddPaymentMethod', async () => {
      const checkoutSession = await adminTransaction(
        async ({ transaction }) =>
          createNonInvoiceCheckoutSession(
            {
              price: subscriptionPrice,
              organizationId: organization.id,
              targetSubscriptionId: 'sub_123',
              customerId: customer.id,
            },
            transaction
          )
      )

      expect(checkoutSession.stripeSetupIntentId).not.toBeNull()
      expect(checkoutSession.type).toBe(
        CheckoutSessionType.AddPaymentMethod
      )
      expect(checkoutSession.targetSubscriptionId).toBe('sub_123')
      expect(checkoutSession.customerId).toBe(customer.id)
    })
  })
})
