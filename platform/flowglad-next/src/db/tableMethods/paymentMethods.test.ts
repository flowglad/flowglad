import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPrice,
  setupProduct,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CurrencyCode,
  IntervalUnit,
  PaymentMethodType,
  PaymentStatus,
  PriceType,
  RevenueChartIntervalUnit,
} from '@/types'
import { nanoid } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Invoice } from '../schema/invoices'
import type { Organization } from '../schema/organizations'
import { type Payment, RevenueDataItem } from '../schema/payments'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import {
  safelyUpdatePaymentForRefund,
  safelyUpdatePaymentStatus,
  selectPaymentById,
  selectRevenueDataForOrganization,
} from './paymentMethods'

describe('paymentMethods.ts', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let payment: Payment.Record

  beforeEach(async () => {
    const setup = await setupOrg()
    organization = setup.organization

    // Setup customer
    customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
    })

    // Setup invoice
    invoice = await setupInvoice({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: setup.price.id,
      livemode: true,
    })

    // Setup payment
    payment = await setupPayment({
      stripeChargeId: `ch_${nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      paymentMethod: PaymentMethodType.Card,
    })
  })

  describe('safelyUpdatePaymentForRefund', () => {
    it('successfully updates a payment for refund', async () => {
      await adminTransaction(async ({ transaction }) => {
        const updatedPayment = await safelyUpdatePaymentForRefund(
          {
            id: payment.id,
            refunded: true,
            refundedAt: Date.now(),
            refundedAmount: payment.amount,
            status: PaymentStatus.Refunded,
          },
          transaction
        )

        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(payment.amount)
        expect(updatedPayment.refundedAt).not.toBeNull()
      })
    })
    it('fails if refund status is not explicitly set', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          safelyUpdatePaymentForRefund(
            { id: payment.id, refunded: true },
            transaction
          )
        ).rejects.toThrow(
          `Failed to update payment ${payment.id}: Refunded amount must be the same as the original amount, Only refund status is supported`
        )
      })
    })

    it('fails if refund is for more than the payment amount', async () => {
      await adminTransaction(async ({ transaction }) => {
        const refundAmount = 1001
        await expect(
          safelyUpdatePaymentForRefund(
            {
              id: payment.id,
              refunded: true,
              refundedAt: Date.now(),
              refundedAmount: refundAmount,
            },
            transaction
          )
        ).rejects.toThrow(
          `Failed to update payment ${payment.id}: Refunded amount must be the same as the original amount, Only refund status is supported`
        )
      })
    })

    it('throws error when payment is not found', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentPaymentId = nanoid()

        await expect(
          safelyUpdatePaymentForRefund(
            {
              id: nonExistentPaymentId,
              refunded: true,
              refundedAt: Date.now(),
              refundedAmount: 500,
            },
            transaction
          )
        ).rejects.toThrow(
          `No payments found with id: ${nonExistentPaymentId}`
        )
      })
    })

    it('throws error when payment is not in a valid state for refund', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in a non-refundable state
        const nonRefundablePayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Processing,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        await expect(
          safelyUpdatePaymentForRefund(
            {
              id: nonRefundablePayment.id,
              refunded: true,
              refundedAt: Date.now(),
              refundedAmount: 500,
            },
            transaction
          )
        ).rejects.toThrow(
          `Payment ${nonRefundablePayment.id} is not in a state to be updated. Its status: ${nonRefundablePayment.status})`
        )
      })
    })

    it('allows updating an already refunded payment', async () => {
      await adminTransaction(async ({ transaction }) => {
        // First refund the payment
        await safelyUpdatePaymentForRefund(
          {
            id: payment.id,
            refunded: true,
            refundedAt: Date.now(),
            refundedAmount: payment.amount,
            status: PaymentStatus.Refunded,
          },
          transaction
        )

        // Then update it again
        const updatedPayment = await safelyUpdatePaymentForRefund(
          {
            id: payment.id,
            refunded: true,
            refundedAt: Date.now(),
            refundedAmount: payment.amount,
            status: PaymentStatus.Refunded,
          },
          transaction
        )

        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(1000)
      })
    })
  })

  describe('safelyUpdatePaymentStatus', () => {
    it('successfully updates payment status', async () => {
      const processingPayment = await setupPayment({
        stripeChargeId: `ch_${nanoid()}`,
        status: PaymentStatus.Processing,
        amount: 1000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
      })
      await adminTransaction(async ({ transaction }) => {
        const updatedPayment = await safelyUpdatePaymentStatus(
          processingPayment,
          PaymentStatus.Succeeded,
          transaction
        )

        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)

        // Verify the payment was actually updated in the database
        const fetchedPayment = await selectPaymentById(
          payment.id,
          transaction
        )
        expect(fetchedPayment?.status).toBe(PaymentStatus.Succeeded)
      })
    })

    it('returns existing payment when updating terminal state to same status', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in a terminal state
        const terminalPayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Failed,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        const result = await safelyUpdatePaymentStatus(
          terminalPayment,
          PaymentStatus.Failed,
          transaction
        )

        expect(result.id).toBe(terminalPayment.id)
        expect(result.status).toBe(PaymentStatus.Failed)
      })
    })

    it('throws error when payment is updated to different terminal state', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in a terminal state
        const terminalPayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Failed,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        await expect(
          safelyUpdatePaymentStatus(
            terminalPayment,
            PaymentStatus.Succeeded,
            transaction
          )
        ).rejects.toThrow(
          `Payment ${terminalPayment.id} is in a terminal state: ${terminalPayment.status}; cannot update to ${PaymentStatus.Succeeded}`
        )
      })
    })

    it('allows updating from pending to processing', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in pending state
        const pendingPayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Processing,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        const updatedPayment = await safelyUpdatePaymentStatus(
          pendingPayment,
          PaymentStatus.Processing,
          transaction
        )

        expect(updatedPayment.status).toBe(PaymentStatus.Processing)
      })
    })

    it('allows updating from processing to succeeded', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in processing state
        const processingPayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Processing,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        const updatedPayment = await safelyUpdatePaymentStatus(
          processingPayment,
          PaymentStatus.Succeeded,
          transaction
        )

        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)
      })
    })
  })
})

describe('selectRevenueDataForOrganization', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price
    pricingModel = orgData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
    })
  })

  it('Scenario 1: Basic operation with revenue data present', async () => {
    await adminTransaction(async ({ transaction }) => {
      const revenueChartIntervalUnit = RevenueChartIntervalUnit.Month

      const fromDate = new Date('2023-01-01T00:00:00.000Z')
      const toDate = new Date('2023-02-28T23:59:59.999Z')

      // --- Setup Invoices ---
      const invoiceJan = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      const invoiceFeb = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      const invoiceOutOfRange = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })

      // --- Payments for First Interval (January 2023 UTC) ---
      // Payment 1: Jan, 100 (10000 cents), no refund
      await setupPayment({
        stripeChargeId: `ch_jan1_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 10000,
        refundedAmount: 0,
        refunded: false,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceJan.id,
        chargeDate: new Date('2023-01-10T10:00:00.000Z').getTime(),
      })

      // Payment 2: Jan, 150 (15000 cents), 50 (5000 cents) refund
      await setupPayment({
        stripeChargeId: `ch_jan2_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 15000,
        refundedAmount: 5000,
        refunded: true,
        refundedAt: new Date('2023-01-16T00:00:00.000Z').getTime(),
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceJan.id,
        chargeDate: new Date('2023-01-15T10:00:00.000Z').getTime(),
      })

      // --- Payments for Second Interval (February 2023 UTC) ---
      // Payment 3: Feb, 200 (20000 cents), no refund
      await setupPayment({
        stripeChargeId: `ch_feb1_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 20000,
        refundedAmount: 0,
        refunded: false,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceFeb.id,
        chargeDate: new Date('2023-02-05T10:00:00.000Z').getTime(),
      })

      // --- Payments outside the date range ---
      // Payment 4: Dec 2022 (before fromDate)
      await setupPayment({
        stripeChargeId: `ch_dec22_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 5000, // Should not be included
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceOutOfRange.id,
        chargeDate: new Date('2022-12-20T10:00:00.000Z').getTime(),
      })

      // Payment 5: Mar 2023 (after toDate)
      await setupPayment({
        stripeChargeId: `ch_mar23_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 6000, // Should not be included
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceOutOfRange.id,
        chargeDate: new Date('2023-03-05T10:00:00.000Z').getTime(),
      })

      const revenueData = await selectRevenueDataForOrganization(
        {
          organizationId: organization.id,
          revenueChartIntervalUnit,
          fromDate: fromDate.getTime(),
          toDate: toDate.getTime(),
          productId: null,
        },
        transaction
      )

      expect(revenueData).toBeInstanceOf(Array)
      expect(revenueData.length).toBe(2) // Expecting Jan and Feb data

      // Verify January 2023 data
      // The date returned by the function might have a timezone offset in its string representation (e.g., T04:00:00.000Z)
      // but it should represent the start of the UTC month.
      const expectedJanDate = new Date(Date.UTC(2023, 0, 1)) // 2023-01-01T00:00:00.000Z
      const janRevenueItem = revenueData.find(
        (item) =>
          item.date.getUTCFullYear() === 2023 &&
          item.date.getUTCMonth() === 0 &&
          item.date.getUTCDate() === 1
      )
      expect(janRevenueItem).toBeDefined()
      expect(
        janRevenueItem?.date.toISOString().startsWith('2023-01-01T')
      ).toBe(true)
      expect(janRevenueItem?.revenue).toBe(20000) // (10000 - 0) + (15000 - 5000)

      // Verify February 2023 data
      const expectedFebDate = new Date(Date.UTC(2023, 1, 1)) // 2023-02-01T00:00:00.000Z
      const febRevenueItem = revenueData.find(
        (item) =>
          item.date.getUTCFullYear() === 2023 &&
          item.date.getUTCMonth() === 1 &&
          item.date.getUTCDate() === 1
      )
      expect(febRevenueItem).toBeDefined()
      expect(
        febRevenueItem?.date.toISOString().startsWith('2023-02-01T')
      ).toBe(true)
      expect(febRevenueItem?.revenue).toBe(20000) // 20000 - 0

      // Ensure chronological order if necessary, though find() doesn't rely on it.
      // If order matters for other assertions: expect(janRevenueItem.date.getTime()).toBeLessThan(febRevenueItem.date.getTime());
    })
  })

  it('Scenario 2: Filtering by `productId` with matching revenue data', async () => {
    await adminTransaction(async ({ transaction }) => {
      const targetDate = new Date('2023-03-15T00:00:00.000Z')
      const fromDate = new Date(
        Date.UTC(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate(),
          0,
          0,
          0,
          0
        )
      )
      const toDate = new Date(
        Date.UTC(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate(),
          23,
          59,
          59,
          999
        )
      )
      const revenueChartIntervalUnit = RevenueChartIntervalUnit.Day

      // Setup Products
      const productA = await setupProduct({
        organizationId: organization.id,
        name: 'Product A',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
      const productB = await setupProduct({
        organizationId: organization.id,
        name: 'Product B',
        pricingModelId: pricingModel.id,
        livemode: true,
      })

      // Setup Prices for Products
      const priceA = await setupPrice({
        productId: productA.id,
        name: 'Price for Product A',
        type: PriceType.SinglePayment,
        unitPrice: 100,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
      })
      const priceB = await setupPrice({
        productId: productB.id,
        name: 'Price for Product B',
        type: PriceType.SinglePayment,
        unitPrice: 200,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      // Setup Purchases
      const purchaseA1 = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: priceA.id,
        livemode: true,
      })
      // Create Invoice for PurchaseA1
      const invoiceA1 = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: priceA.id, // Needs a priceId to determine invoice type if not billingPeriod
        purchaseId: purchaseA1.id, // Link this invoice to purchaseA1
        livemode: true,
      })

      const purchaseA2 = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: priceA.id,
        livemode: true,
      })
      // Create Invoice for PurchaseA2
      const invoiceA2 = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: priceA.id,
        purchaseId: purchaseA2.id, // Link this invoice to purchaseA2
        livemode: true,
      })

      const purchaseB1 = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: priceB.id,
        livemode: true,
      })
      // Create Invoice for PurchaseB1
      const invoiceB1 = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: priceB.id,
        purchaseId: purchaseB1.id, // Link this invoice to purchaseB1
        livemode: true,
      })

      // Setup Payments linked to Purchases and Invoices
      // Payment 1 (Product A)
      await setupPayment({
        stripeChargeId: `ch_prodA1_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 10000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceA1.id,
        purchaseId: purchaseA1.id,
        chargeDate: new Date(
          Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            10,
            0,
            0,
            0
          )
        ).getTime(),
      })

      // Payment 2 (Product A), refunded
      await setupPayment({
        stripeChargeId: `ch_prodA2_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 5000,
        refundedAmount: 1000,
        refunded: true,
        refundedAt: Date.now(),
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceA2.id,
        purchaseId: purchaseA2.id,
        chargeDate: new Date(
          Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            11,
            0,
            0,
            0
          )
        ).getTime(),
      })

      // Payment 3 (Product B) - Should be excluded by productId filter
      await setupPayment({
        stripeChargeId: `ch_prodB1_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 20000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceB1.id,
        purchaseId: purchaseB1.id,
        chargeDate: new Date(
          Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            12,
            0,
            0,
            0
          )
        ).getTime(),
      })

      const revenueData = await selectRevenueDataForOrganization(
        {
          organizationId: organization.id,
          revenueChartIntervalUnit,
          fromDate: fromDate.getTime(),
          toDate: toDate.getTime(),
          productId: productA.id,
        },
        transaction
      )

      expect(revenueData).toBeInstanceOf(Array)
      expect(revenueData.length).toBe(1)

      const resultDate = revenueData[0].date
      expect(resultDate.getUTCFullYear()).toBe(
        targetDate.getUTCFullYear()
      )
      expect(resultDate.getUTCMonth()).toBe(targetDate.getUTCMonth())
      expect(resultDate.getUTCDate()).toBe(targetDate.getUTCDate())
      expect(
        resultDate
          .toISOString()
          .startsWith(targetDate.toISOString().substring(0, 10))
      ).toBe(true)

      const expectedRevenue = 10000 - 0 + (5000 - 1000)
      expect(revenueData[0].revenue).toBe(expectedRevenue)
    })
  })

  it('Scenario 3: Filtering by `productId` with no matching revenue data', async () => {
    await adminTransaction(async ({ transaction }) => {
      const targetDate = new Date('2023-04-10T00:00:00.000Z')
      const fromDate = new Date(
        Date.UTC(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate(),
          0,
          0,
          0,
          0
        )
      )
      const toDate = new Date(
        Date.UTC(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate(),
          23,
          59,
          59,
          999
        )
      )
      const revenueChartIntervalUnit = RevenueChartIntervalUnit.Day

      // Product A (will be filtered for, but has no payments)
      const productA = await setupProduct({
        organizationId: organization.id,
        name: 'Product A - No Revenue',
        pricingModelId: pricingModel.id,
        livemode: true,
      })

      // Product B (has payments, but we won't filter for it)
      const productB = await setupProduct({
        organizationId: organization.id,
        name: 'Product B - Has Revenue',
        pricingModelId: pricingModel.id,
        livemode: true,
      })

      const priceB = await setupPrice({
        productId: productB.id,
        name: 'Price for Product B',
        type: PriceType.SinglePayment,
        unitPrice: 3000,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      const purchaseB = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: priceB.id,
        livemode: true,
      })

      const invoiceForPurchaseB = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: priceB.id,
        purchaseId: purchaseB.id,
        livemode: true,
      })

      // Payment for Product B
      await setupPayment({
        stripeChargeId: `ch_prodB_only_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 30000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoiceForPurchaseB.id,
        purchaseId: purchaseB.id,
        chargeDate: new Date(
          Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            10,
            0,
            0,
            0
          )
        ).getTime(),
      })

      const revenueData = await selectRevenueDataForOrganization(
        {
          organizationId: organization.id,
          revenueChartIntervalUnit,
          fromDate: fromDate.getTime(),
          toDate: toDate.getTime(),
          productId: productA.id, // Filter by Product A (which has no payments)
        },
        transaction
      )

      expect(revenueData).toBeInstanceOf(Array)
      expect(revenueData.length).toBe(1) // One interval for the date range

      const resultDate = revenueData[0].date
      expect(resultDate.getUTCFullYear()).toBe(
        targetDate.getUTCFullYear()
      )
      expect(resultDate.getUTCMonth()).toBe(targetDate.getUTCMonth())
      expect(resultDate.getUTCDate()).toBe(targetDate.getUTCDate())
      expect(
        resultDate
          .toISOString()
          .startsWith(targetDate.toISOString().substring(0, 10))
      ).toBe(true)

      expect(revenueData[0].revenue).toBe(0) // Expect 0 revenue for Product A
    })
  })

  it('Scenario 4: No payments for the organization in the specified date range', async () => {
    await adminTransaction(async ({ transaction }) => {
      const fromDate = new Date('2023-05-01T00:00:00.000Z')
      const toDate = new Date('2023-05-31T23:59:59.999Z')
      const revenueChartIntervalUnit = RevenueChartIntervalUnit.Month

      // Setup an invoice (needed for setupPayment)
      const someInvoice = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id, // price is from the global beforeEach
        livemode: true,
      })

      // Payment outside the date range (e.g., April 2023)
      await setupPayment({
        stripeChargeId: `ch_outside_range_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 70000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: someInvoice.id,
        chargeDate: new Date('2023-04-15T10:00:00.000Z').getTime(),
      })

      const revenueData = await selectRevenueDataForOrganization(
        {
          organizationId: organization.id,
          revenueChartIntervalUnit,
          fromDate: fromDate.getTime(),
          toDate: toDate.getTime(),
          productId: null, // No product filter
        },
        transaction
      )

      expect(revenueData).toBeInstanceOf(Array)
      // generate_series will create one interval for May 2023
      expect(revenueData.length).toBe(1)

      const resultDate = revenueData[0].date
      const expectedDate = new Date(Date.UTC(2023, 4, 1)) // May 1st, 2023

      expect(resultDate.getUTCFullYear()).toBe(
        expectedDate.getUTCFullYear()
      )
      expect(resultDate.getUTCMonth()).toBe(
        expectedDate.getUTCMonth()
      ) // Month is 0-indexed
      expect(resultDate.getUTCDate()).toBe(expectedDate.getUTCDate())
      expect(resultDate.toISOString().startsWith('2023-05-01T')).toBe(
        true
      )

      expect(revenueData[0].revenue).toBe(0) // Expect 0 revenue as the payment is outside the range
    })
  })

  describe('Scenario 5: Different `revenueChartIntervalUnit` values', () => {
    it("should correctly aggregate for 'day' interval", async () => {
      await adminTransaction(async ({ transaction }) => {
        const fromDate = new Date('2023-01-01T00:00:00.000Z')
        const toDate = new Date('2023-01-05T23:59:59.999Z')
        const revenueChartIntervalUnit = RevenueChartIntervalUnit.Day

        const invoiceJan1 = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })
        const invoiceJan3 = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        // Payments on Jan 1
        await setupPayment({
          stripeChargeId: `ch_day1_1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJan1.id,
          chargeDate: new Date('2023-01-01T10:00:00.000Z').getTime(),
        })
        await setupPayment({
          stripeChargeId: `ch_day1_2_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 2000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJan1.id,
          chargeDate: new Date('2023-01-01T14:00:00.000Z').getTime(),
        })

        // Payment on Jan 3
        await setupPayment({
          stripeChargeId: `ch_day3_1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 3000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJan3.id,
          chargeDate: new Date('2023-01-03T12:00:00.000Z').getTime(),
        })

        const revenueData = await selectRevenueDataForOrganization(
          {
            organizationId: organization.id,
            revenueChartIntervalUnit,
            fromDate: fromDate.getTime(),
            toDate: toDate.getTime(),
            productId: null,
          },
          transaction
        )

        expect(revenueData).toBeInstanceOf(Array)
        expect(revenueData.length).toBe(5) // Jan 1, 2, 3, 4, 5

        const getRevenueForDate = (dateStr: string) => {
          const item = revenueData.find((d) =>
            d.date.toISOString().startsWith(dateStr)
          )
          return item ? item.revenue : undefined
        }

        expect(getRevenueForDate('2023-01-01T')).toBe(3000) // 1000 + 2000
        expect(getRevenueForDate('2023-01-02T')).toBe(0)
        expect(getRevenueForDate('2023-01-03T')).toBe(3000)
        expect(getRevenueForDate('2023-01-04T')).toBe(0)
        expect(getRevenueForDate('2023-01-05T')).toBe(0)

        // Check date objects are start of day UTC
        revenueData.forEach((item) => {
          expect(item.date.getUTCHours()).toBe(0)
          expect(item.date.getUTCMinutes()).toBe(0)
          expect(item.date.getUTCSeconds()).toBe(0)
          expect(item.date.getUTCMilliseconds()).toBe(0)
        })
      })
    })

    it("should correctly aggregate for 'week' interval", async () => {
      await adminTransaction(async ({ transaction }) => {
        // Jan 1, 2023 is a Sunday. date_trunc('week', timestamp) considers Monday as start of week.
        // We want to test for the week starting Jan 2nd and Jan 9th.
        const fromDate = new Date('2023-01-02T00:00:00.000Z') // Explicitly start from Monday, Jan 2nd
        const toDate = new Date('2023-01-15T23:59:59.999Z') // Sunday (covers up to week starting Jan 9th)
        const revenueChartIntervalUnit = RevenueChartIntervalUnit.Week

        const invoiceW_A = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })
        const invoiceW_B = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        // Payments for Week A (Jan 2 - Jan 8)
        await setupPayment({
          // Jan 2 (Mon)
          stripeChargeId: `ch_weekA1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceW_A.id,
          chargeDate: new Date('2023-01-02T10:00:00.000Z').getTime(),
        })
        await setupPayment({
          // Jan 4 (Wed)
          stripeChargeId: `ch_weekA2_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 2000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceW_A.id,
          chargeDate: new Date('2023-01-04T14:00:00.000Z').getTime(),
        })

        // Payment for Week B (Jan 9 - Jan 15)
        await setupPayment({
          // Jan 9 (Mon)
          stripeChargeId: `ch_weekB1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 3000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceW_B.id,
          chargeDate: new Date('2023-01-09T12:00:00.000Z').getTime(),
        })

        const revenueData = await selectRevenueDataForOrganization(
          {
            organizationId: organization.id,
            revenueChartIntervalUnit,
            fromDate: fromDate.getTime(),
            toDate: toDate.getTime(),
            productId: null,
          },
          transaction
        )

        expect(revenueData).toBeInstanceOf(Array)
        // 2023-01-02 (Mon of week containing Jan 1)
        // 2023-01-09 (Mon of next week)
        expect(revenueData.length).toBe(2)

        const getRevenueForDate = (dateStr: string) => {
          const item = revenueData.find((d) =>
            d.date.toISOString().startsWith(dateStr)
          )
          return item ? item.revenue : undefined
        }

        // Week A starts 2023-01-02
        expect(getRevenueForDate('2023-01-02T')).toBe(3000) // 1000 + 2000
        // Week B starts 2023-01-09
        expect(getRevenueForDate('2023-01-09T')).toBe(3000)

        revenueData.forEach((item) => {
          expect(item.date.getUTCHours()).toBe(0)
          expect(item.date.getUTCMinutes()).toBe(0)
          expect(item.date.getUTCSeconds()).toBe(0)
          expect(item.date.getUTCMilliseconds()).toBe(0)
          // Check if it's a Monday (1 for Monday in getUTCDay(), Sunday is 0)
          // This might be too strict if the definition of week start varies or for edge cases.
          // For simplicity, we trust date_trunc('week',...) to define the week start consistently.
        })
      })
    })

    it("should correctly aggregate for 'month' interval", async () => {
      await adminTransaction(async ({ transaction }) => {
        const fromDate = new Date('2023-01-01T00:00:00.000Z')
        const toDate = new Date('2023-03-01T23:59:59.999Z') // Covers Jan, Feb, and the first day of Mar
        const revenueChartIntervalUnit =
          RevenueChartIntervalUnit.Month

        const invoiceJan = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })
        const invoiceFeb = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        // Payments for January
        await setupPayment({
          stripeChargeId: `ch_monthJan1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJan.id,
          chargeDate: new Date('2023-01-05T10:00:00.000Z').getTime(),
        })
        await setupPayment({
          stripeChargeId: `ch_monthJan2_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 2000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJan.id,
          chargeDate: new Date('2023-01-20T14:00:00.000Z').getTime(),
        })

        // Payment for February
        await setupPayment({
          stripeChargeId: `ch_monthFeb1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 3000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceFeb.id,
          chargeDate: new Date('2023-02-10T12:00:00.000Z').getTime(),
        })

        const revenueData = await selectRevenueDataForOrganization(
          {
            organizationId: organization.id,
            revenueChartIntervalUnit,
            fromDate: fromDate.getTime(),
            toDate: toDate.getTime(),
            productId: null,
          },
          transaction
        )

        expect(revenueData).toBeInstanceOf(Array)
        // generate_series for month from 2023-01-01 to 2023-03-01 will produce: Jan, Feb, Mar
        expect(revenueData.length).toBe(3)

        const getRevenueForDate = (dateStr: string) => {
          const item = revenueData.find((d) =>
            d.date.toISOString().startsWith(dateStr)
          )
          return item ? item.revenue : undefined
        }

        expect(getRevenueForDate('2023-01-01T')).toBe(3000) // 1000 + 2000
        expect(getRevenueForDate('2023-02-01T')).toBe(3000)
        expect(getRevenueForDate('2023-03-01T')).toBe(0) // No payments in March within toDate

        revenueData.forEach((item) => {
          expect(item.date.getUTCHours()).toBe(0)
          expect(item.date.getUTCMinutes()).toBe(0)
          expect(item.date.getUTCSeconds()).toBe(0)
          expect(item.date.getUTCMilliseconds()).toBe(0)
          expect(item.date.getUTCDate()).toBe(1) // Should be start of the month
        })
      })
    })

    it("should correctly aggregate for 'year' interval", async () => {
      await adminTransaction(async ({ transaction }) => {
        const fromDate = new Date('2023-01-01T00:00:00.000Z')
        const toDate = new Date('2024-03-01T23:59:59.999Z') // Covers 2023, and part of 2024
        const revenueChartIntervalUnit = RevenueChartIntervalUnit.Year

        const invoice2023 = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })
        const invoice2024 = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        // Payments for 2023
        await setupPayment({
          stripeChargeId: `ch_year2023_1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice2023.id,
          chargeDate: new Date('2023-01-05T10:00:00.000Z').getTime(),
        })
        await setupPayment({
          stripeChargeId: `ch_year2023_2_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 2000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice2023.id,
          chargeDate: new Date('2023-11-20T14:00:00.000Z').getTime(),
        })

        // Payment for 2024
        await setupPayment({
          stripeChargeId: `ch_year2024_1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 3000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice2024.id,
          chargeDate: new Date('2024-02-10T12:00:00.000Z').getTime(),
        })

        const revenueData = await selectRevenueDataForOrganization(
          {
            organizationId: organization.id,
            revenueChartIntervalUnit,
            fromDate: fromDate.getTime(),
            toDate: toDate.getTime(),
            productId: null,
          },
          transaction
        )

        expect(revenueData).toBeInstanceOf(Array)
        // generate_series for year from 2023-01-01 to 2024-03-01 will produce: 2023, 2024
        expect(revenueData.length).toBe(2)

        const getRevenueForDate = (dateStr: string) => {
          const item = revenueData.find((d) =>
            d.date.toISOString().startsWith(dateStr)
          )
          return item ? item.revenue : undefined
        }

        expect(getRevenueForDate('2023-01-01T')).toBe(3000) // 1000 + 2000
        expect(getRevenueForDate('2024-01-01T')).toBe(3000)

        revenueData.forEach((item) => {
          expect(item.date.getUTCHours()).toBe(0)
          expect(item.date.getUTCMinutes()).toBe(0)
          expect(item.date.getUTCSeconds()).toBe(0)
          expect(item.date.getUTCMilliseconds()).toBe(0)
          expect(item.date.getUTCDate()).toBe(1)
          expect(item.date.getUTCMonth()).toBe(0) // January
        })
      })
    })
  })

  describe('Scenario 6: Edge cases for date ranges', () => {
    it('Sub-Scenario 6.1: `fromDate` and `toDate` are the same day', async () => {
      await adminTransaction(async ({ transaction }) => {
        const targetDayStr = '2023-07-15'
        const fromDate = new Date(`${targetDayStr}T00:00:00.000Z`)
        const toDate = new Date(`${targetDayStr}T23:59:59.999Z`)
        const revenueChartIntervalUnit = RevenueChartIntervalUnit.Day

        const invoice = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        await setupPayment({
          stripeChargeId: `ch_sameday1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          chargeDate: new Date(
            `${targetDayStr}T10:00:00.000Z`
          ).getTime(),
        })
        await setupPayment({
          stripeChargeId: `ch_sameday2_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1500,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          chargeDate: new Date(
            `${targetDayStr}T14:00:00.000Z`
          ).getTime(),
        })

        const revenueData = await selectRevenueDataForOrganization(
          {
            organizationId: organization.id,
            revenueChartIntervalUnit,
            fromDate: fromDate.getTime(),
            toDate: toDate.getTime(),
            productId: null,
          },
          transaction
        )

        expect(revenueData).toBeInstanceOf(Array)
        expect(revenueData.length).toBe(1)

        const resultItem = revenueData[0]
        expect(
          resultItem.date.toISOString().startsWith(targetDayStr)
        ).toBe(true)
        expect(resultItem.date.getUTCHours()).toBe(0) // Start of the day
        expect(resultItem.revenue).toBe(2500) // 1000 + 1500
      })
    })

    it('Sub-Scenario 6.2: Date range spans exactly one interval unit (month)', async () => {
      await adminTransaction(async ({ transaction }) => {
        const fromDate = new Date('2023-07-01T00:00:00.000Z')
        const toDate = new Date('2023-07-31T23:59:59.999Z') // Exactly July
        const revenueChartIntervalUnit =
          RevenueChartIntervalUnit.Month

        const invoiceJuly = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })
        const invoiceAug = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        // Payments within July
        await setupPayment({
          stripeChargeId: `ch_july1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJuly.id,
          chargeDate: new Date('2023-07-05T10:00:00.000Z').getTime(),
        })
        await setupPayment({
          stripeChargeId: `ch_july2_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 2000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJuly.id,
          chargeDate: new Date('2023-07-15T14:00:00.000Z').getTime(),
        })

        // Payment outside July (in August)
        await setupPayment({
          stripeChargeId: `ch_aug1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 500,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceAug.id,
          chargeDate: new Date('2023-08-01T10:00:00.000Z').getTime(),
        })

        const revenueData = await selectRevenueDataForOrganization(
          {
            organizationId: organization.id,
            revenueChartIntervalUnit,
            fromDate: fromDate.getTime(),
            toDate: toDate.getTime(),
            productId: null,
          },
          transaction
        )

        expect(revenueData).toBeInstanceOf(Array)
        expect(revenueData.length).toBe(1) // Expecting one item for July

        const resultItem = revenueData[0]
        expect(
          resultItem.date.toISOString().startsWith('2023-07-01T')
        ).toBe(true)
        expect(resultItem.revenue).toBe(3000) // 1000 + 2000
      })
    })

    it('Sub-Scenario 6.3: Date range covers a partial interval (month)', async () => {
      await adminTransaction(async ({ transaction }) => {
        const fromDate = new Date('2023-07-01T00:00:00.000Z')
        const toDate = new Date('2023-07-05T23:59:59.999Z') // Only first 5 days of July
        const revenueChartIntervalUnit =
          RevenueChartIntervalUnit.Month

        const invoiceJuly = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        // Payment within the fromDate-toDate partial interval
        await setupPayment({
          stripeChargeId: `ch_july_partial1_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJuly.id,
          chargeDate: new Date('2023-07-03T10:00:00.000Z').getTime(), // Falls within toDate
        })

        // Payment within the same month, but AFTER toDate
        await setupPayment({
          stripeChargeId: `ch_july_partial2_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 2000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoiceJuly.id,
          chargeDate: new Date('2023-07-10T14:00:00.000Z').getTime(), // Falls outside toDate, but in same month interval
        })

        const revenueData = await selectRevenueDataForOrganization(
          {
            organizationId: organization.id,
            revenueChartIntervalUnit,
            fromDate: fromDate.getTime(),
            toDate: toDate.getTime(),
            productId: null,
          },
          transaction
        )

        expect(revenueData).toBeInstanceOf(Array)
        // generate_series produces one interval starting 2023-07-01
        expect(revenueData.length).toBe(1)

        const resultItem = revenueData[0]
        expect(
          resultItem.date.toISOString().startsWith('2023-07-01T')
        ).toBe(true)
        // Only payment1 (1000) should be included as payment2 is after toDate.
        expect(resultItem.revenue).toBe(1000)
      })
    })
  })

  it('Scenario 7: Payments with various refund amounts', async () => {
    await adminTransaction(async ({ transaction }) => {
      const fromDate = new Date('2023-08-01T00:00:00.000Z')
      const toDate = new Date('2023-08-31T23:59:59.999Z')
      const revenueChartIntervalUnit = RevenueChartIntervalUnit.Month
      const chargeDate = new Date('2023-08-10T10:00:00.000Z')

      const invoice = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })

      // Payment 1: No refund
      await setupPayment({
        stripeChargeId: `ch_refundtest1_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 10000,
        refundedAmount: 0,
        refunded: false,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        chargeDate: chargeDate.getTime(),
      })

      // Payment 2: Full refund
      await setupPayment({
        stripeChargeId: `ch_refundtest2_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 15000,
        refundedAmount: 15000,
        refunded: true,
        refundedAt: Date.now(),
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        chargeDate: chargeDate.getTime(),
      })

      // Payment 3: Partial refund
      await setupPayment({
        stripeChargeId: `ch_refundtest3_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 20000,
        refundedAmount: 7000,
        refunded: true,
        refundedAt: Date.now(),
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        chargeDate: chargeDate.getTime(),
      })

      // Payment 4: refundedAmount is null/undefined (should be treated as 0 by COALESCE)
      await setupPayment({
        stripeChargeId: `ch_refundtest4_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 5000,
        // refundedAmount not set, should default to 0 or be handled by COALESCE
        refunded: false, // Explicitly false if not refunded
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        chargeDate: chargeDate.getTime(),
      })

      const revenueData = await selectRevenueDataForOrganization(
        {
          organizationId: organization.id,
          revenueChartIntervalUnit,
          fromDate: fromDate.getTime(),
          toDate: toDate.getTime(),
          productId: null,
        },
        transaction
      )

      expect(revenueData).toBeInstanceOf(Array)
      expect(revenueData.length).toBe(1) // One item for August

      const resultItem = revenueData[0]
      expect(
        resultItem.date.toISOString().startsWith('2023-08-01T')
      ).toBe(true)

      // Expected: (10000 - 0) + (15000 - 15000) + (20000 - 7000) + (5000 - 0)
      //           = 10000 + 0 + 13000 + 5000 = 28000
      expect(resultItem.revenue).toBe(28000)
    })
  })

  it('Scenario 8: `fromDate` is after `toDate`', async () => {
    await adminTransaction(async ({ transaction }) => {
      const fromDate = new Date('2023-08-01T00:00:00.000Z')
      const toDate = new Date('2023-07-01T00:00:00.000Z') // toDate is before fromDate
      const revenueChartIntervalUnit = RevenueChartIntervalUnit.Day

      const revenueData = await selectRevenueDataForOrganization(
        {
          organizationId: organization.id,
          revenueChartIntervalUnit,
          fromDate: fromDate.getTime(),
          toDate: toDate.getTime(),
          productId: null,
        },
        transaction
      )

      expect(revenueData).toBeInstanceOf(Array)
      expect(revenueData.length).toBe(0) // Expect an empty array
    })
  })
})
