import { describe, it, expect, beforeEach, vi } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupBillingPeriod,
  setupBillingRun,
  setupBillingPeriodItems,
  setupInvoice,
  setupSubscription,
} from '../../seedDatabase'
import {
  calculateFeeAndTotalAmountDueForBillingPeriod,
  processOutstandingBalanceForBillingPeriod,
  processNoMoreDueForBillingPeriod,
  executeBillingRunCalculationAndBookkeepingSteps,
  executeBillingRun,
  scheduleBillingRunRetry,
  constructBillingRunRetryInsert,
  createInvoiceInsertForBillingRun,
  billingPeriodItemsToInvoiceLineItemInserts,
  calculateTotalAmountToCharge,
} from './billingRunHelpers'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  InvoiceStatus,
} from '@/types'
import { BillingRun } from '@/db/schema/billingRuns'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Customer } from '@/db/schema/customers'
import {
  selectBillingRunById,
  selectBillingRuns,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { updateBillingPeriod } from '@/db/tableMethods/billingPeriodMethods'
import { Payment } from '@/db/schema/payments'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import {
  safelyUpdatePaymentMethod,
  updatePaymentMethod,
} from '@/db/tableMethods/paymentMethodMethods'

describe('billingRunHelpers', async () => {
  const { organization, price } = await setupOrg()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let billingPeriodItems: BillingPeriodItem.Record[]
  let subscription: Subscription.Record
  beforeEach(async () => {
    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
    })
    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart,
      endDate: subscription.currentBillingPeriodEnd,
      status: BillingPeriodStatus.Active,
    })
    billingRun = await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
      status: BillingRunStatus.Scheduled,
    })
    billingPeriodItems = await setupBillingPeriodItems({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: 100,
    })
  })

  describe('Billing Period State Management', () => {
    it('should mark billing period as PastDue when current date is after end date', async () => {
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(
          subscription.currentBillingPeriodStart.getTime() -
            30 * 24 * 60 * 60 * 1000
        ),
        endDate: new Date(
          subscription.currentBillingPeriodEnd.getTime() -
            30 * 24 * 60 * 60 * 1000
        ),
        status: BillingPeriodStatus.Active,
      })
      const updatedBillingPeriod = await adminTransaction(
        ({ transaction }) =>
          processOutstandingBalanceForBillingPeriod(
            billingPeriod,
            transaction
          )
      )
      expect(updatedBillingPeriod.status).toBe(
        BillingPeriodStatus.PastDue
      )
    })

    it('should mark billing period as Completed when all payments are settled', async () => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Paid,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
      })
      const result = await adminTransaction(
        async ({ transaction }) => {
          const updatedBillingPeriod = await updateBillingPeriod(
            {
              id: billingPeriod.id,
              endDate: new Date(Date.now() - 180 * 1000),
            },
            transaction
          )
          return processNoMoreDueForBillingPeriod(
            {
              billingRun,
              billingPeriod: updatedBillingPeriod,
              invoice,
            },
            transaction
          )
        }
      )
      expect(result.billingPeriod.status).toBe(
        BillingPeriodStatus.Completed
      )
    })
  })

  describe('Payment Intent Creation and Confirmation', () => {
    it('should create a payment intent for the correct amount', async () => {
      const { totalDueAmount } = await adminTransaction(
        ({ transaction }) =>
          calculateFeeAndTotalAmountDueForBillingPeriod(
            {
              billingPeriod,
              billingPeriodItems,
              organization,
              paymentMethod,
            },
            transaction
          )
      )
      expect(totalDueAmount).toBeGreaterThan(0)
    })

    it('should not create a payment intent if the invoice is in a terminal state', async () => {
      await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Paid,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
      })
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)
    })
    it('should calculate the correct amount to charge based on total due and amount paid', async () => {
      const totalDueAmount = 1000
      const totalAmountPaid = 400
      const payments: Payment.Record[] = []

      const amountToCharge = calculateTotalAmountToCharge({
        totalDueAmount,
        totalAmountPaid,
        payments,
      })

      expect(amountToCharge).toBe(600)
    })

    it('should return 0 when amount paid equals or exceeds total due', async () => {
      const totalDueAmount = 1000
      const totalAmountPaid = 1000
      const payments: Payment.Record[] = []

      const amountToCharge = calculateTotalAmountToCharge({
        totalDueAmount,
        totalAmountPaid,
        payments,
      })

      expect(amountToCharge).toBe(0)

      const overpaidAmount = calculateTotalAmountToCharge({
        totalDueAmount: 1000,
        totalAmountPaid: 1200,
        payments: [],
      })

      expect(overpaidAmount).toBe(0)
    })
  })

  describe('Fee Calculation and Total Due Amount', () => {
    it('should calculate the correct fee and total due amount', async () => {
      const { feeCalculation, totalDueAmount } =
        await adminTransaction(({ transaction }) =>
          calculateFeeAndTotalAmountDueForBillingPeriod(
            {
              billingPeriod,
              billingPeriodItems,
              organization,
              paymentMethod,
            },
            transaction
          )
        )
      expect(feeCalculation).toBeDefined()
      expect(totalDueAmount).toBeGreaterThan(0)
    })
  })

  describe('Invoice Creation and Line Items', () => {
    it('should create an invoice with the correct invoice number', async () => {
      const invoiceInsert = await adminTransaction(
        ({ transaction }) =>
          createInvoiceInsertForBillingRun(
            {
              billingPeriod,
              organization,
              customer,
              currency: price.currency,
            },
            transaction
          )
      )
      expect(invoiceInsert.invoiceNumber).toBeDefined()
    })

    it('should generate invoice line items from billing period items', async () => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
      })
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: invoice.id,
        billingPeriodItems,
      })
      expect(lineItems.length).toBe(billingPeriodItems.length)
    })
  })

  describe('Billing Run Retry Logic', () => {
    it('should schedule a billing run retry 3 days after the initial attempt', async () => {
      const retryBillingRun = await adminTransaction(
        ({ transaction }) =>
          scheduleBillingRunRetry(billingRun, transaction)
      )
      expect(retryBillingRun).toBeDefined()
      expect(retryBillingRun?.scheduledFor.getTime()).toBeGreaterThan(
        new Date().getTime() + 3 * 24 * 60 * 60 * 1000 - 60 * 1000
      )
    })

    it('should not schedule a retry after the maximum number of retries', async () => {
      const allBillingRuns = await adminTransaction(
        ({ transaction }) =>
          selectBillingRuns(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
      )
      const retryBillingRun = constructBillingRunRetryInsert(
        billingRun,
        Array.from({ length: 4 }, (_, i) => {
          return billingRun
        })
      )
      expect(retryBillingRun).toBeUndefined()
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should throw an error if the customer does not have a Stripe customer ID', async () => {
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          {
            id: customer.id,
            stripeCustomerId: null,
          },
          transaction
        )
      })
      await executeBillingRun(billingRun.id)
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
    })

    it('should throw an error if the payment method does not have a Stripe payment method ID', async () => {
      await adminTransaction(async ({ transaction }) => {
        await safelyUpdatePaymentMethod(
          {
            id: paymentMethod.id,
            stripePaymentMethodId: null,
          },
          transaction
        )
      })
      await executeBillingRun(billingRun.id)
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
    })
  })
  it('should silently return when trying to execute a billing run that is not in Scheduled status', async () => {
    // Test each billing run status
    const billingRunStatuses = Object.values(BillingRunStatus).filter(
      (status) => status !== BillingRunStatus.Scheduled
    )

    for (const status of billingRunStatuses) {
      const testBillingRun = await setupBillingRun({
        status,
        livemode: false,
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
      })

      await expect(
        executeBillingRun(testBillingRun.id)
      ).resolves.toBeUndefined()
    }
    await adminTransaction(async ({ transaction }) => {
      await updateBillingRun(
        {
          id: billingRun.id,
          status: BillingRunStatus.Failed,
        },
        transaction
      )
    })

    await expect(
      executeBillingRun(billingRun.id)
    ).resolves.toBeUndefined()
  })
})
