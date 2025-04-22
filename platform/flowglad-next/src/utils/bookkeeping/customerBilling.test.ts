import { describe, it, expect, beforeEach } from 'vitest'
import {
  setupOrg,
  setupCustomer,
  setupInvoice,
  setupSubscription,
  setupPaymentMethod,
  setupBillingPeriod,
  setupProduct,
  setupPrice,
} from '../../../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  PaymentMethodType,
  InvoiceStatus,
  SubscriptionStatus,
} from '@/types'
import { customerBillingTransaction } from './customerBilling'
import core from '../core'

describe('Customer Billing', async () => {
  // Common variables for all tests
  const { organization } = await setupOrg()
  let customer: Customer.Record
  let activeProduct: Product.Record
  let inactiveProduct: Product.Record
  let activePrice: Price.Record
  let inactivePrice: Price.Record
  let subscription: Subscription.Record
  let paymentMethod: PaymentMethod.Record

  beforeEach(async () => {
    // Set up common test data
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
    })

    activeProduct = await setupProduct({
      organizationId: organization.id,
      active: true,
    })

    inactiveProduct = await setupProduct({
      organizationId: organization.id,
      active: false,
    })

    activePrice = await setupPrice({
      organizationId: organization.id,
      productId: activeProduct.id,
    })

    inactivePrice = await setupPrice({
      organizationId: organization.id,
      productId: inactiveProduct.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      type: PaymentMethodType.Card,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: activePrice.id,
      livemode: true,
    })

    await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      livemode: true,
    })
  })

  describe('Invoice Status Filtering', () => {
    it('excludes draft invoices from billing data', async () => {
      // Create invoices with different statuses
      const draftInvoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        status: InvoiceStatus.Draft,
      })

      const paidInvoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        status: InvoiceStatus.Paid,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return customerBillingTransaction(customer.id, transaction)
        }
      )

      expect(result.invoices).not.toContainEqual(
        expect.objectContaining({ id: draftInvoice.id })
      )
      expect(result.invoices).toContainEqual(
        expect.objectContaining({ id: paidInvoice.id })
      )
    })
  })

  describe('Subscription Status Filtering', () => {
    it('only includes current subscriptions in currentSubscriptions', async () => {
      // Create subscriptions with different statuses
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: activePrice.id,
        status: SubscriptionStatus.Canceled,
        livemode: true,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return customerBillingTransaction(customer.id, transaction)
        }
      )

      expect(result.currentSubscriptions).not.toContainEqual(
        expect.objectContaining({ id: canceledSubscription.id })
      )
      expect(result.currentSubscriptions).toContainEqual(
        expect.objectContaining({ id: subscription.id })
      )
    })
  })

  describe('Product Status Filtering', () => {
    it('excludes inactive products from catalog', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return customerBillingTransaction(customer.id, transaction)
        }
      )

      const catalogProducts = result.catalog.products

      expect(catalogProducts).toContainEqual(
        expect.objectContaining({ id: activeProduct.id })
      )
      expect(catalogProducts).not.toContainEqual(
        expect.objectContaining({ id: inactiveProduct.id })
      )
    })
  })

  describe('All Subscriptions', () => {
    it('includes all subscriptions regardless of status', async () => {
      const canceledSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: activePrice.id,
        status: SubscriptionStatus.Canceled,
        livemode: true,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return customerBillingTransaction(customer.id, transaction)
        }
      )

      expect(result.subscriptions).toContainEqual(
        expect.objectContaining({ id: subscription.id })
      )
      expect(result.subscriptions).toContainEqual(
        expect.objectContaining({ id: canceledSubscription.id })
      )
    })
  })
})
