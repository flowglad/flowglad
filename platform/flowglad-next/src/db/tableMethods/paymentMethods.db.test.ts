import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPrice,
  setupProduct,
  setupPurchase,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  NotFoundError,
  TerminalStateError,
  ValidationError,
} from '@/errors'
import {
  CurrencyCode,
  IntervalUnit,
  InvoiceStatus,
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
import type { Purchase } from '../schema/purchases'
import type { Subscription } from '../schema/subscriptions'
import {
  insertPayment,
  isPaymentInTerminalState,
  safelyUpdatePaymentForRefund,
  safelyUpdatePaymentStatus,
  selectPaymentById,
  selectPaymentsCursorPaginatedWithTableRowData,
  selectRevenueDataForOrganization,
  upsertPaymentByStripeChargeId,
} from './paymentMethods'

describe('paymentMethods.ts', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let payment: Payment.Record

  beforeEach(async () => {
    const setup = (await setupOrg()).unwrap()
    organization = setup.organization

    // Setup customer
    customer = (
      await setupCustomer({
        organizationId: organization.id,
        livemode: true,
      })
    ).unwrap()

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
        const updatedPaymentResult =
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
        const updatedPayment = updatedPaymentResult.unwrap()

        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(payment.amount)
        expect(typeof updatedPayment.refundedAt).toBe('number')
        return Result.ok(undefined)
      })
    })
    it('fails if refund status is not explicitly set', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await safelyUpdatePaymentForRefund(
          { id: payment.id, refunded: true },
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toContain(
            `Failed to update payment ${payment.id}: Only refund or succeeded status is supported`
          )
        }
        return Result.ok(undefined)
      })
    })

    it('fails if refund is for more than the payment amount', async () => {
      await adminTransaction(async ({ transaction }) => {
        const refundAmount = 1001
        const result = await safelyUpdatePaymentForRefund(
          {
            id: payment.id,
            refunded: true,
            refundedAt: Date.now(),
            refundedAmount: refundAmount,
            status: PaymentStatus.Refunded,
          },
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toContain(
            `Failed to update payment ${payment.id}: Refunded amount cannot exceed the original payment amount`
          )
        }
        return Result.ok(undefined)
      })
    })

    it('updates payment for partial refund and keeps payment amount unchanged', async () => {
      await adminTransaction(async ({ transaction }) => {
        const partialRefundAmount = 500 // 50% refund
        const refundedAt = Date.now()
        const updatedPaymentResult =
          await safelyUpdatePaymentForRefund(
            {
              id: payment.id,
              refunded: false,
              refundedAt,
              refundedAmount: partialRefundAmount,
              status: PaymentStatus.Succeeded,
            },
            transaction
          )
        const updatedPayment = updatedPaymentResult.unwrap()

        expect(updatedPayment.refunded).toBe(false)
        expect(updatedPayment.refundedAmount).toBe(
          partialRefundAmount
        )
        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)
        expect(updatedPayment.amount).toBe(payment.amount)
        expect(updatedPayment.refundedAt).toBeGreaterThan(
          refundedAt - 5_000
        )
        expect(updatedPayment.refundedAt).toBeLessThanOrEqual(
          Date.now()
        )
        return Result.ok(undefined)
      })
    })

    it('fails if refunded amount is not positive', async () => {
      await adminTransaction(async ({ transaction }) => {
        for (const refundedAmount of [0, -1]) {
          const result = await safelyUpdatePaymentForRefund(
            {
              id: payment.id,
              refunded: false,
              refundedAt: Date.now(),
              refundedAmount,
              status: PaymentStatus.Succeeded,
            },
            transaction
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error).toBeInstanceOf(ValidationError)
            expect(result.error.message).toContain(
              `Failed to update payment ${payment.id}: Refunded amount must be greater than 0`
            )
          }
        }
        return Result.ok(undefined)
      })
    })

    it('returns error when payment is not found', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentPaymentId = nanoid()

        const result = await safelyUpdatePaymentForRefund(
          {
            id: nonExistentPaymentId,
            refunded: true,
            refundedAt: Date.now(),
            refundedAmount: 500,
          },
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(NotFoundError)
          expect(result.error.message).toBe(
            `Payment not found: ${nonExistentPaymentId}`
          )
        }
        return Result.ok(undefined)
      })
    })

    it('returns error when payment is not in a valid state for refund', async () => {
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

        const result = await safelyUpdatePaymentForRefund(
          {
            id: nonRefundablePayment.id,
            refunded: true,
            refundedAt: Date.now(),
            refundedAmount: 500,
          },
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toContain(
            `Payment ${nonRefundablePayment.id} is not in a state to be updated. Its status: ${nonRefundablePayment.status})`
          )
        }
        return Result.ok(undefined)
      })
    })

    it('allows updating an already refunded payment', async () => {
      await adminTransaction(async ({ transaction }) => {
        // First refund the payment
        const firstRefundResult = await safelyUpdatePaymentForRefund(
          {
            id: payment.id,
            refunded: true,
            refundedAt: Date.now(),
            refundedAmount: payment.amount,
            status: PaymentStatus.Refunded,
          },
          transaction
        )
        firstRefundResult.unwrap()

        // Then update it again
        const updatedPaymentResult =
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
        const updatedPayment = updatedPaymentResult.unwrap()

        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(1000)
        return Result.ok(undefined)
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
        const updatedPaymentResult = await safelyUpdatePaymentStatus(
          processingPayment,
          PaymentStatus.Succeeded,
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)

        // Verify the payment was actually updated in the database
        const fetchedPayment = (
          await selectPaymentById(processingPayment.id, transaction)
        ).unwrap()
        expect(fetchedPayment.status).toBe(PaymentStatus.Succeeded)
        return Result.ok(undefined)
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

        const paymentResult = await safelyUpdatePaymentStatus(
          terminalPayment,
          PaymentStatus.Failed,
          transaction
        )
        const result = paymentResult.unwrap()

        expect(result.id).toBe(terminalPayment.id)
        expect(result.status).toBe(PaymentStatus.Failed)
        return Result.ok(undefined)
      })
    })

    it('returns error when payment is updated to different terminal state', async () => {
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
          PaymentStatus.Succeeded,
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(TerminalStateError)
          expect(result.error.message).toBe(
            `Payment ${terminalPayment.id} is in terminal state: ${terminalPayment.status}`
          )
        }
        return Result.ok(undefined)
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

        const updatedPaymentResult = await safelyUpdatePaymentStatus(
          pendingPayment,
          PaymentStatus.Processing,
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        expect(updatedPayment.status).toBe(PaymentStatus.Processing)
        return Result.ok(undefined)
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

        const updatedPaymentResult = await safelyUpdatePaymentStatus(
          processingPayment,
          PaymentStatus.Succeeded,
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)
        return Result.ok(undefined)
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
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price
    pricingModel = orgData.pricingModel

    customer = (
      await setupCustomer({
        organizationId: organization.id,
        livemode: true,
      })
    ).unwrap()
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
      expect(janRevenueItem).toMatchObject({ revenue: 20000 }) // (10000 - 0) + (15000 - 5000)
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
      expect(febRevenueItem).toMatchObject({ revenue: 20000 })
      expect(
        febRevenueItem?.date.toISOString().startsWith('2023-02-01T')
      ).toBe(true)
      expect(febRevenueItem?.revenue).toBe(20000) // 20000 - 0

      // Ensure chronological order if necessary, though find() doesn't rely on it.
      // If order matters for other assertions: expect(janRevenueItem.date.getTime()).toBeLessThan(febRevenueItem.date.getTime());
      return Result.ok(undefined)
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
      return Result.ok(undefined)
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
      return Result.ok(undefined)
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
      return Result.ok(undefined)
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
        return Result.ok(undefined)
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
        return Result.ok(undefined)
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
        return Result.ok(undefined)
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
        return Result.ok(undefined)
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
        return Result.ok(undefined)
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
        return Result.ok(undefined)
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
        return Result.ok(undefined)
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
      return Result.ok(undefined)
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
      return Result.ok(undefined)
    })
  })

  describe('Scenario 9: Payment status filtering', () => {
    it('should only include Succeeded and Refunded payments in revenue calculations', async () => {
      await adminTransaction(async ({ transaction }) => {
        const fromDate = new Date('2023-09-01T00:00:00.000Z')
        const toDate = new Date('2023-09-30T23:59:59.999Z')
        const revenueChartIntervalUnit =
          RevenueChartIntervalUnit.Month
        const chargeDate = new Date('2023-09-15T10:00:00.000Z')

        const invoice = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        // Payment 1: Succeeded - SHOULD be included ($100)
        await setupPayment({
          stripeChargeId: `ch_status_succeeded_${nanoid()}`,
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

        // Payment 2: Refunded - SHOULD be included ($50 - $50 refund = $0 net)
        await setupPayment({
          stripeChargeId: `ch_status_refunded_${nanoid()}`,
          status: PaymentStatus.Refunded,
          amount: 5000,
          refundedAmount: 5000,
          refunded: true,
          refundedAt: Date.now(),
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          chargeDate: chargeDate.getTime(),
        })

        // Payment 3: Failed - should NOT be included
        await setupPayment({
          stripeChargeId: `ch_status_failed_${nanoid()}`,
          status: PaymentStatus.Failed,
          amount: 20000, // $200 - should be excluded
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          chargeDate: chargeDate.getTime(),
        })

        // Payment 4: Processing - should NOT be included
        await setupPayment({
          stripeChargeId: `ch_status_processing_${nanoid()}`,
          status: PaymentStatus.Processing,
          amount: 15000, // $150 - should be excluded
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          chargeDate: chargeDate.getTime(),
        })

        // Payment 5: Canceled - should NOT be included
        await setupPayment({
          stripeChargeId: `ch_status_canceled_${nanoid()}`,
          status: PaymentStatus.Canceled,
          amount: 8000, // $80 - should be excluded
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
        expect(revenueData.length).toBe(1) // One item for September

        const resultItem = revenueData[0]
        expect(
          resultItem.date.toISOString().startsWith('2023-09-01T')
        ).toBe(true)

        // Expected: Only Succeeded ($100) + Refunded ($50 - $50 = $0) = $100
        // Failed ($200), Processing ($150), Canceled ($80) should all be excluded
        expect(resultItem.revenue).toBe(10000) // 10000 cents = $100
        return Result.ok(undefined)
      })
    })

    it('should include partial refunds correctly with Succeeded status', async () => {
      await adminTransaction(async ({ transaction }) => {
        const fromDate = new Date('2023-10-01T00:00:00.000Z')
        const toDate = new Date('2023-10-31T23:59:59.999Z')
        const revenueChartIntervalUnit =
          RevenueChartIntervalUnit.Month
        const chargeDate = new Date('2023-10-15T10:00:00.000Z')

        const invoice = await setupInvoice({
          customerId: customer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        // Payment with partial refund (still Succeeded status)
        // $100 payment with $30 refund = $70 net revenue
        await setupPayment({
          stripeChargeId: `ch_partial_refund_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 10000,
          refundedAmount: 3000,
          refunded: false, // Partial refund keeps refunded=false
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          chargeDate: chargeDate.getTime(),
        })

        // Failed payment should not be included
        await setupPayment({
          stripeChargeId: `ch_failed_payment_${nanoid()}`,
          status: PaymentStatus.Failed,
          amount: 50000, // $500 - should be excluded
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

        expect(revenueData.length).toBe(1)
        // Expected: $100 - $30 = $70 net (Failed payment excluded)
        expect(revenueData[0].revenue).toBe(7000) // 7000 cents = $70
        return Result.ok(undefined)
      })
    })
  })
})

describe('selectPaymentsCursorPaginatedWithTableRowData', () => {
  let organization: Organization.Record
  let organization2: Organization.Record
  let customer1: Customer.Record
  let customer2: Customer.Record
  let customer3: Customer.Record
  let customerOtherOrg: Customer.Record
  let invoice1: Invoice.Record
  let invoice2: Invoice.Record
  let invoice3: Invoice.Record
  let invoiceOtherOrg: Invoice.Record
  let payment1: Payment.Record
  let payment2: Payment.Record
  let payment3: Payment.Record
  let paymentOtherOrg: Payment.Record
  let price: Price.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    price = orgData.price

    // Setup customers with different names for search testing
    customer1 = (
      await setupCustomer({
        organizationId: organization.id,
        name: 'Alice Smith',
        email: 'alice@example.com',
        livemode: true,
      })
    ).unwrap()

    customer2 = (
      await setupCustomer({
        organizationId: organization.id,
        name: 'Bob Jones',
        email: 'bob@example.com',
        livemode: true,
      })
    ).unwrap()

    customer3 = (
      await setupCustomer({
        organizationId: organization.id,
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        livemode: true,
      })
    ).unwrap()

    // Setup invoices
    invoice1 = await setupInvoice({
      customerId: customer1.id,
      organizationId: organization.id,
      priceId: price.id,
      livemode: true,
    })

    invoice2 = await setupInvoice({
      customerId: customer2.id,
      organizationId: organization.id,
      priceId: price.id,
      livemode: true,
    })

    invoice3 = await setupInvoice({
      customerId: customer3.id,
      organizationId: organization.id,
      priceId: price.id,
      livemode: true,
    })

    // Setup payments
    payment1 = await setupPayment({
      stripeChargeId: `ch_${nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000,
      livemode: true,
      customerId: customer1.id,
      organizationId: organization.id,
      invoiceId: invoice1.id,
      paymentMethod: PaymentMethodType.Card,
    })

    payment2 = await setupPayment({
      stripeChargeId: `ch_${nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 2000,
      livemode: true,
      customerId: customer2.id,
      organizationId: organization.id,
      invoiceId: invoice2.id,
      paymentMethod: PaymentMethodType.Card,
    })

    payment3 = await setupPayment({
      stripeChargeId: `ch_${nanoid()}`,
      status: PaymentStatus.Failed,
      amount: 3000,
      livemode: true,
      customerId: customer3.id,
      organizationId: organization.id,
      invoiceId: invoice3.id,
      paymentMethod: PaymentMethodType.Card,
    })

    // Setup second organization for isolation tests
    const orgData2 = (await setupOrg()).unwrap()
    organization2 = orgData2.organization

    customerOtherOrg = (
      await setupCustomer({
        organizationId: organization2.id,
        name: 'Alice Smith', // Same name as customer1 to test isolation
        email: 'alice-other@example.com',
        livemode: true,
      })
    ).unwrap()

    invoiceOtherOrg = await setupInvoice({
      customerId: customerOtherOrg.id,
      organizationId: organization2.id,
      priceId: orgData2.price.id,
      livemode: true,
    })

    paymentOtherOrg = await setupPayment({
      stripeChargeId: `ch_${nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 5000,
      livemode: true,
      customerId: customerOtherOrg.id,
      organizationId: organization2.id,
      invoiceId: invoiceOtherOrg.id,
      paymentMethod: PaymentMethodType.Card,
    })
  })

  describe('search functionality', () => {
    it('should search by payment ID or customer name (case-insensitive, trims whitespace)', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Test payment ID search
        const resultById =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: payment1.id,
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultById.items.length).toBe(1)
        expect(resultById.items[0].payment.id).toBe(payment1.id)
        expect(resultById.total).toBe(1)

        // Test partial customer name search (case-insensitive)
        const resultByName =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultByName.items.length).toBe(1)
        expect(resultByName.items[0].payment.id).toBe(payment1.id)
        expect(resultByName.items[0].customer.name).toBe(
          'Alice Smith'
        )

        // Test case-insensitive search
        const resultCaseInsensitive =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'CHARLIE',
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultCaseInsensitive.items.length).toBe(1)
        expect(resultCaseInsensitive.items[0].customer.name).toBe(
          'Charlie Brown'
        )

        // Test whitespace trimming
        const resultTrimmed =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '  alice  ',
              filters: { organizationId: organization.id },
            },
            transaction,
          })
        expect(resultTrimmed.items.length).toBe(1)
        expect(resultTrimmed.items[0].payment.id).toBe(payment1.id)
        return Result.ok(undefined)
      })
    })

    it('should ignore empty or whitespace-only search queries', async () => {
      await adminTransaction(async ({ transaction }) => {
        const resultEmpty =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        const resultWhitespace =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '   ',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        const resultUndefined =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: undefined,
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        // All should return all 3 payments
        expect(resultEmpty.items.length).toBe(3)
        expect(resultEmpty.total).toBe(3)
        expect(resultWhitespace.items.length).toBe(3)
        expect(resultWhitespace.total).toBe(3)
        expect(resultUndefined.items.length).toBe(3)
        expect(resultUndefined.total).toBe(3)
        return Result.ok(undefined)
      })
    })

    it('should only return payments for the specified organization', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Search for "Alice" - should only return payment1, not paymentOtherOrg
        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        expect(result.items.length).toBe(1)
        expect(result.items[0].payment.id).toBe(payment1.id)
        expect(result.items[0].payment.organizationId).toBe(
          organization.id
        )
        expect(result.total).toBe(1)
        return Result.ok(undefined)
      })
    })

    it('should work with status filters', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Search with status filter
        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'charlie',
              filters: {
                organizationId: organization.id,
                status: PaymentStatus.Failed,
              },
            },
            transaction,
          })

        expect(result.items.length).toBe(1)
        expect(result.items[0].payment.id).toBe(payment3.id)
        expect(result.items[0].payment.status).toBe(
          PaymentStatus.Failed
        )
        expect(result.total).toBe(1)

        // Search with different status - should return no results
        const resultNoMatch =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: {
                organizationId: organization.id,
                status: PaymentStatus.Failed,
              },
            },
            transaction,
          })

        expect(resultNoMatch.items.length).toBe(0)
        expect(resultNoMatch.total).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should work with customerId filters', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Search with customerId filter
        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: {
                organizationId: organization.id,
                customerId: customer1.id,
              },
            },
            transaction,
          })

        expect(result.items.length).toBe(1)
        expect(result.items[0].payment.id).toBe(payment1.id)
        expect(result.items[0].payment.customerId).toBe(customer1.id)
        expect(result.total).toBe(1)

        // Search with different customerId - should return no results
        const resultNoMatch =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: {
                organizationId: organization.id,
                customerId: customer2.id,
              },
            },
            transaction,
          })

        expect(resultNoMatch.items.length).toBe(0)
        expect(resultNoMatch.total).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should return empty results when no payments match search query', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'David',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        expect(result.items.length).toBe(0)
        expect(result.total).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should return empty results when payment ID does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentId = `pay_${nanoid()}`
        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: nonExistentId,
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        expect(result.items.length).toBe(0)
        expect(result.total).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should handle multiple payments with same customer name', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create another payment for customer1
        const payment1b = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1500,
          livemode: true,
          customerId: customer1.id,
          organizationId: organization.id,
          invoiceId: invoice1.id,
          paymentMethod: PaymentMethodType.Card,
        })

        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        expect(result.items.length).toBe(2)
        expect(result.total).toBe(2)
        const paymentIds = result.items.map((item) => item.payment.id)
        expect(paymentIds).toContain(payment1.id)
        expect(paymentIds).toContain(payment1b.id)
        return Result.ok(undefined)
      })
    })

    it('should return correct total count when searching', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create additional payments for Alice
        await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1500,
          livemode: true,
          customerId: customer1.id,
          organizationId: organization.id,
          invoiceId: invoice1.id,
          paymentMethod: PaymentMethodType.Card,
        })

        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        expect(result.items.length).toBe(2)
        expect(result.total).toBe(2)
        return Result.ok(undefined)
      })
    })

    it('should maintain pagination when searching', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create multiple payments for Alice to test pagination
        const payments = []
        for (let i = 0; i < 5; i++) {
          payments.push(
            await setupPayment({
              stripeChargeId: `ch_${nanoid()}`,
              status: PaymentStatus.Succeeded,
              amount: 1000 + i * 100,
              livemode: true,
              customerId: customer1.id,
              organizationId: organization.id,
              invoiceId: invoice1.id,
              paymentMethod: PaymentMethodType.Card,
            })
          )
        }

        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 3,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        expect(result.items.length).toBe(3)
        expect(result.total).toBeGreaterThanOrEqual(3)
        expect(typeof result.endCursor).toBe('string')
        return Result.ok(undefined)
      })
    })

    it('should return enriched data (payment + customer) when searching', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        expect(result.items.length).toBe(1)
        expect(result.items[0].payment.id).toBe(payment1.id)
        expect(result.items[0].customer.id).toBe(customer1.id)
        expect(result.items[0].customer.name).toBe('Alice Smith')
        return Result.ok(undefined)
      })
    })

    it('should find payments by customer name with special characters', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a customer with special characters in the name
        const specialCustomer = (
          await setupCustomer({
            organizationId: organization.id,
            name: "O'Brien & Co.",
            email: 'special@example.com',
            livemode: true,
          })
        ).unwrap()

        const specialInvoice = await setupInvoice({
          customerId: specialCustomer.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })

        const specialPayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          livemode: true,
          customerId: specialCustomer.id,
          organizationId: organization.id,
          invoiceId: specialInvoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        // Search for the customer by name with special characters
        const result =
          await selectPaymentsCursorPaginatedWithTableRowData({
            input: {
              pageSize: 10,
              searchQuery: "O'Brien",
              filters: { organizationId: organization.id },
            },
            transaction,
          })

        // Should find the payment for the customer with special characters
        expect(result.items.length).toBe(1)
        expect(result.items[0].payment.id).toBe(specialPayment.id)
        expect(result.items[0].customer.name).toBe("O'Brien & Co.")
        return Result.ok(undefined)
      })
    })
  })
})

// Tests for pricingModelId derivation functionality added in Wave 4
describe('pricingModelId derivation', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let subscription: Subscription.Record
  let purchase: Purchase.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.Subscription,
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
    })

    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: InvoiceStatus.Open,
    })
  })

  describe('insertPayment', () => {
    it('should derive pricingModelId from subscription', async () => {
      await adminTransaction(async ({ transaction }) => {
        const payment = (
          await insertPayment(
            {
              organizationId: organization.id,
              customerId: customer.id,
              invoiceId: invoice.id,
              subscriptionId: subscription.id,
              amount: 1000,
              paymentMethod: PaymentMethodType.Card,
              currency: CurrencyCode.USD,
              status: PaymentStatus.Succeeded,
              chargeDate: Date.now(),
              stripePaymentIntentId: `pi_${nanoid()}`,
              livemode: true,
            },
            transaction
          )
        ).unwrap()

        expect(payment.pricingModelId).toBe(
          subscription.pricingModelId
        )
        expect(payment.pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    })

    it('should derive pricingModelId from purchase', async () => {
      await adminTransaction(async ({ transaction }) => {
        const payment = (
          await insertPayment(
            {
              organizationId: organization.id,
              customerId: customer.id,
              invoiceId: invoice.id,
              purchaseId: purchase.id,
              amount: 1000,
              paymentMethod: PaymentMethodType.Card,
              currency: CurrencyCode.USD,
              status: PaymentStatus.Succeeded,
              chargeDate: Date.now(),
              stripePaymentIntentId: `pi_${nanoid()}`,
              livemode: true,
            },
            transaction
          )
        ).unwrap()

        expect(payment.pricingModelId).toBe(purchase.pricingModelId)
        expect(payment.pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    })

    it('should derive pricingModelId from invoice', async () => {
      await adminTransaction(async ({ transaction }) => {
        const payment = (
          await insertPayment(
            {
              organizationId: organization.id,
              customerId: customer.id,
              invoiceId: invoice.id,
              amount: 1000,
              paymentMethod: PaymentMethodType.Card,
              currency: CurrencyCode.USD,
              status: PaymentStatus.Succeeded,
              chargeDate: Date.now(),
              stripePaymentIntentId: `pi_${nanoid()}`,
              livemode: true,
            },
            transaction
          )
        ).unwrap()

        expect(payment.pricingModelId).toBe(invoice.pricingModelId)
        expect(payment.pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const payment = (
          await insertPayment(
            {
              organizationId: organization.id,
              customerId: customer.id,
              invoiceId: invoice.id,
              amount: 1000,
              paymentMethod: PaymentMethodType.Card,
              currency: CurrencyCode.USD,
              status: PaymentStatus.Succeeded,
              chargeDate: Date.now(),
              stripePaymentIntentId: `pi_${nanoid()}`,
              livemode: true,
              pricingModelId: pricingModel.id,
            },
            transaction
          )
        ).unwrap()

        expect(payment.pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    })
  })

  describe('upsertPaymentByStripeChargeId', () => {
    it('should derive pricingModelId when upserting payment', async () => {
      await adminTransaction(async ({ transaction }) => {
        const stripeChargeId = `ch_${nanoid()}`
        const paymentResult = await upsertPaymentByStripeChargeId(
          {
            organizationId: organization.id,
            customerId: customer.id,
            invoiceId: invoice.id,
            amount: 1000,
            paymentMethod: PaymentMethodType.Card,
            currency: CurrencyCode.USD,
            status: PaymentStatus.Succeeded,
            chargeDate: Date.now(),
            stripePaymentIntentId: `pi_${nanoid()}`,
            stripeChargeId,
            livemode: true,
          },
          transaction
        )
        const payment = paymentResult.unwrap()

        expect(payment.pricingModelId).toBe(invoice.pricingModelId)
        expect(payment.pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    })
  })
})

describe('isPaymentInTerminalState', () => {
  const createMockPayment = (
    status: PaymentStatus
  ): Payment.Record => ({
    id: 'pay_test',
    organizationId: 'org_test',
    customerId: 'cust_test',
    invoiceId: 'inv_test',
    subscriptionId: null,
    purchaseId: null,
    paymentMethodId: null,
    amount: 1000,
    refundedAmount: null,
    refundedAt: null,
    refunded: false,
    currency: CurrencyCode.USD,
    status,
    chargeDate: Date.now(),
    stripePaymentIntentId: 'pi_test',
    stripeChargeId: 'ch_test',
    paymentMethod: PaymentMethodType.Card,
    livemode: true,
    pricingModelId: 'pm_test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  it('returns true for terminal statuses (Succeeded, Refunded, Canceled, Failed)', () => {
    const terminalStatuses = [
      PaymentStatus.Succeeded,
      PaymentStatus.Refunded,
      PaymentStatus.Canceled,
      PaymentStatus.Failed,
    ]
    for (const status of terminalStatuses) {
      const payment = createMockPayment(status)
      expect(isPaymentInTerminalState(payment)).toBe(true)
    }
  })

  it('returns false for non-terminal statuses (Processing, RequiresConfirmation, RequiresAction)', () => {
    const nonTerminalStatuses = [
      PaymentStatus.Processing,
      PaymentStatus.RequiresConfirmation,
      PaymentStatus.RequiresAction,
    ]
    for (const status of nonTerminalStatuses) {
      const payment = createMockPayment(status)
      expect(isPaymentInTerminalState(payment)).toBe(false)
    }
  })
})
