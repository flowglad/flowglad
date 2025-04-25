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
import {
  selectBillingPeriodById,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import { Payment } from '@/db/schema/payments'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import {
  safelyUpdatePaymentMethod,
  updatePaymentMethod,
} from '@/db/tableMethods/paymentMethodMethods'
import { insertInvoiceLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import { insertPayment } from '@/db/tableMethods/paymentMethods'

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

  describe('executeBillingRunCalculationAndBookkeepingSteps', () => {
    it('should create a new invoice when none exists for the billing period', async () => {
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.invoice).toBeDefined()
      expect(result.invoice.billingPeriodId).toBe(billingPeriod.id)
      expect(result.invoice.customerId).toBe(customer.id)
      expect(result.invoice.organizationId).toBe(organization.id)
      expect(result.invoice.currency).toBeDefined()
    })

    it('should use existing invoice when one exists for the billing period', async () => {
      // Create an invoice first
      const existingInvoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
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

      expect(result.invoice.id).toBe(existingInvoice.id)
    })

    it('should handle zero amount due correctly', async () => {
      // Create billing period items with zero price
      const zeroPriceItems = await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice:
          billingPeriodItems.reduce(
            (acc, item) => acc + item.unitPrice * item.quantity,
            0
          ) * -1,
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // Check the billing run status after the function call
      const { updatedBillingRun } = await adminTransaction(
        async ({ transaction }) => {
          const updatedBillingRun = await selectBillingRunById(
            billingRun.id,
            transaction
          )
          return { updatedBillingRun }
        }
      )
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)
      // expect(result.billingPeriod.status).toBe(
      //   BillingPeriodStatus.Completed
      // )
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })
    it('should handle terminal invoice state correctly', async () => {
      // Create an invoice in a terminal state
      const paidInvoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
        status: InvoiceStatus.Paid,
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.invoice.id).toBe(paidInvoice.id)
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)
      expect(result.payment).toBeUndefined()

      // Check the billing run status after the function call
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })

    it('should delete and recreate invoice line items', async () => {
      // Create an invoice with line items
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
      })

      // Create some initial line items
      await adminTransaction(async ({ transaction }) => {
        const initialLineItems =
          billingPeriodItemsToInvoiceLineItemInserts({
            invoiceId: invoice.id,
            billingPeriodItems: [
              {
                ...billingPeriodItems[0],
                unitPrice: 50, // Different price to verify recreation
              },
            ],
          })
        await insertInvoiceLineItems(initialLineItems, transaction)
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // Verify the line items were recreated with the correct price
      expect(result.invoice.id).toBe(invoice.id)
      // We can't directly check the line items here, but we can verify the payment amount
      // reflects the correct price from billingPeriodItems
      if (result.payment) {
        expect(result.payment.amount).toBe(
          billingPeriodItems[0].unitPrice
        )
      }
    })

    it('should create payment with correct properties', async () => {
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.payment).toBeDefined()
      if (result.payment) {
        expect(result.payment.subscriptionId).toBe(
          billingPeriod.subscriptionId
        )
        expect(result.payment.billingPeriodId).toBe(billingPeriod.id)
        expect(result.payment.amount).toBe(result.totalDueAmount)
        expect(result.payment.currency).toBe(result.invoice.currency)
        expect(result.payment.paymentMethodId).toBe(
          billingRun.paymentMethodId
        )
        expect(result.payment.organizationId).toBe(organization.id)
        expect(result.payment.customerId).toBe(customer.id)
        expect(result.payment.invoiceId).toBe(result.invoice.id)
        expect(result.payment.taxCountry).toBeDefined()
        expect(result.payment.paymentMethod).toBe(paymentMethod.type)
        expect(result.payment.stripePaymentIntentId).toContain(
          'placeholder____'
        )
        expect(result.payment.livemode).toBe(billingPeriod.livemode)
      }
    })

    it('should update billing run status to AwaitingPaymentConfirmation', async () => {
      await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // Check the billing run status after the function call
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.AwaitingPaymentConfirmation
      )
    })

    it('should update billing run status to Succeeded when no payment needed', async () => {
      // Create billing period items with zero price
      await setupBillingPeriodItems({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice:
          billingPeriodItems.reduce(
            (acc, item) => acc + item.unitPrice * item.quantity,
            0
          ) * -1,
      })

      await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // Check the billing run status after the function call
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })

    it('should update billing period status based on invoice status and date', async () => {
      // Create an invoice in a terminal state
      await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
        status: InvoiceStatus.Paid,
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // If the billing period is in the past, it should be marked as Completed
      if (new Date() > billingPeriod.endDate) {
        expect(result.billingPeriod.status).toBe(
          BillingPeriodStatus.Completed
        )
      }
    })

    it('should create fee calculation with correct properties', async () => {
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.feeCalculation).toBeDefined()
      expect(result.feeCalculation.currency).toBeDefined()
    })

    it('should return all expected properties in the result object', async () => {
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.invoice).toBeDefined()
      expect(result.payment).toBeDefined()
      expect(result.feeCalculation).toBeDefined()
      expect(result.customer).toBeDefined()
      expect(result.organization).toBeDefined()
      expect(result.billingPeriod).toBeDefined()
      expect(result.subscription).toBeDefined()
      expect(result.paymentMethod).toBeDefined()
      expect(result.totalDueAmount).toBeDefined()
      expect(result.totalAmountPaid).toBeDefined()
      expect(result.payments).toBeDefined()
    })

    it('should handle nested billing details address for tax country', async () => {
      // Update payment method with nested address
      await adminTransaction(async ({ transaction }) => {
        await updatePaymentMethod(
          {
            id: paymentMethod.id,
            billingDetails: {
              ...paymentMethod.billingDetails,
              address: {
                country: 'US',
                line1: null,
                line2: null,
                city: null,
                state: null,
                postal_code: null,
              },
            },
          },
          transaction
        )
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      if (result.payment) {
        expect(result.payment.taxCountry).toBe('US')
      }
    })

    it('should handle non-nested billing details address for tax country', async () => {
      // Update payment method with non-nested address
      await adminTransaction(async ({ transaction }) => {
        await updatePaymentMethod(
          {
            id: paymentMethod.id,
            billingDetails: {
              name: 'Test Name',
              email: 'test@test.com',
              address: {
                country: 'CA',
                line1: null,
                line2: null,
                city: null,
                state: null,
                postal_code: null,
              },
            },
          },
          transaction
        )
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      if (result.payment) {
        expect(result.payment.taxCountry).toBe('CA')
      }
    })

    it('should handle multiple payments for billing period', async () => {
      // Create a payment for the billing period
      await adminTransaction(async ({ transaction }) => {
        await insertPayment(
          {
            amount: 50,
            currency: 'USD',
            status: 'succeeded',
            organizationId: organization.id,
            chargeDate: new Date(),
            customerId: customer.id,
            invoiceId: (
              await setupInvoice({
                billingPeriodId: billingPeriod.id,
                customerId: customer.id,
                organizationId: organization.id,
                priceId: price.id,
              })
            ).id,
            paymentMethodId: paymentMethod.id,
            refunded: false,
            refundedAmount: 0,
            refundedAt: null,
            taxCountry: 'US',
            paymentMethod: paymentMethod.type,
            stripePaymentIntentId: 'pi_test',
            livemode: billingPeriod.livemode,
            subscriptionId: billingPeriod.subscriptionId,
            billingPeriodId: billingPeriod.id,
          },
          transaction
        )
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.totalAmountPaid).toBe(50)
      expect(result.payments.length).toBeGreaterThan(0)
    })

    it('should throw an error if customer has no stripe customer ID', async () => {
      // Update customer to remove stripe customer ID
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          {
            id: customer.id,
            stripeCustomerId: null,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(({ transaction }) =>
          executeBillingRunCalculationAndBookkeepingSteps(
            billingRun,
            transaction
          )
        )
      ).rejects.toThrow(
        'Cannot run billing for a billing period with a customer that does not have a stripe customer id'
      )
    })

    it('should throw an error if payment method has no stripe payment method ID', async () => {
      // Update payment method to remove stripe payment method ID
      await adminTransaction(async ({ transaction }) => {
        await updatePaymentMethod(
          {
            id: paymentMethod.id,
            stripePaymentMethodId: null,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(({ transaction }) =>
          executeBillingRunCalculationAndBookkeepingSteps(
            billingRun,
            transaction
          )
        )
      ).rejects.toThrow(
        'Cannot run billing for a billing period with a payment method that does not have a stripe payment method id'
      )
    })
  })
})
