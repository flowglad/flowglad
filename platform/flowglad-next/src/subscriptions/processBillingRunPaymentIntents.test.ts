import { describe, it, expect, beforeEach } from 'vitest'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { BillingPeriodStatus } from '@/types'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupMemberships,
  setupProduct,
  setupPrice,
} from '@/../seedDatabase'

import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { processPaymentIntentEventForBillingRun } from './processBillingRunPaymentIntents'
import {
  BillingRunStatus,
  InvoiceStatus,
  LedgerTransactionType,
  PaymentStatus,
  SubscriptionStatus,
  FeatureUsageGrantFrequency,
  LedgerEntryType,
  IntervalUnit,
  PriceType,
  SubscriptionItemType,
} from '@/types'
import Stripe from 'stripe'
import { BillingRun } from '@/db/schema/billingRuns'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import {
  selectBillingRunById,
  updateBillingRun,
  selectBillingRuns,
} from '@/db/tableMethods/billingRunMethods'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { IntentMetadataType } from '@/utils/stripe'
import core from '@/utils/core'
import { settleInvoiceUsageCostsLedgerCommandSchema } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  setupUsageMeter,
  setupUsageCreditGrantFeature,
  setupProductFeature,
  setupSubscriptionItem,
  setupSubscriptionItemFeatureUsageCreditGrant,
} from '@/../seedDatabase'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  selectLedgerEntries,
  aggregateBalanceForLedgerAccountFromEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { createSubscriptionWorkflow } from './createSubscription/workflow'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import { setupLedgerTransaction } from '@/../seedDatabase'
import { updateInvoice } from '@/db/tableMethods/invoiceMethods'
import { Invoice } from '@/db/schema/invoices'
import {
  createMockPaymentIntentEventResponse,
  createMockPaymentIntent,
} from '@/test/helpers/stripeMocks'

/**
 * In our tests we assume that getStripeCharge (used inside processPaymentIntentEventForBillingRun)
 * is configured (or stubbed in the test environment) so that when called with a known charge id,
 * it returns a charge object with a predictable amount (for example, 1000 for 'ch_success', 500 for 'ch_failed', etc.).
 */

describe('processPaymentIntentEventForBillingRun integration tests', async () => {
  const { organization, price, product } = await setupOrg()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let billingPeriodItem: BillingPeriodItem.Record
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
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })
    billingRun = await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
      status: BillingRunStatus.Scheduled,
    })
    billingPeriodItem = await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: 100,
    })
  })

  it('skips processing for out-of-order event', async () => {
    const stripePaymentIntentId =
      `pi_outoforder_${Date.now()}` + core.nanoid()
    const stripeChargeId =
      `ch_outoforder_${Date.now()}` + core.nanoid()
    // Seed a billing run whose lastPaymentIntentEventTimestamp is in the future
    const newBillingRun = await setupBillingRun({
      stripePaymentIntentId,
      // Set the last event timestamp to a time later than the event's created time.
      lastPaymentIntentEventTimestamp: new Date(200000).getTime(),
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })

    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: newBillingRun.id,
    })

    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
    })

    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: stripePaymentIntentId,
          latest_charge: stripeChargeId,
          metadata: {
            billingRunId: newBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: newBillingRun.billingPeriodId,
          },
          livemode: true,
        },
        {
          created: 1,
          livemode: true,
        }
      )

      // The function should simply skip processing and return undefined.
      const { result } = await processPaymentIntentEventForBillingRun(
        event,
        transaction
      )
      expect(result?.processingSkipped).toBe(true)
    })
  })

  it('processes a PaymentIntentSucceeded event correctly', async () => {
    const stripePaymentIntentId =
      `pi_succeeded_${Date.now()}` + core.nanoid()
    const stripeChargeId =
      `ch_${Date.now()}__succeeded` + core.nanoid()
    const billingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })

    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: billingRun.id,
    })
    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
    })
    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: stripePaymentIntentId,
          status: 'succeeded',
          metadata: {
            billingRunId: billingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: billingRun.billingPeriodId,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: 3000,
          livemode: true,
        }
      )

      const { result, ledgerCommand } =
        await processPaymentIntentEventForBillingRun(
          event,
          transaction
        )

      const updatedBillingRun = await selectBillingRunById(
        billingRun.id,
        transaction
      )
      const updatedInvoice = await selectInvoiceById(
        invoice.id,
        transaction
      )

      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
      expect(updatedBillingRun.lastPaymentIntentEventTimestamp).toBe(
        event.created * 1000
      )
      expect(updatedInvoice.status).toBe(InvoiceStatus.Paid)

      expect(result?.billingRun.id).toBe(billingRun.id)
      expect(result?.invoice.id).toBe(invoice.id)

      expect(ledgerCommand).toBeDefined()
      const invoiceLedgerCommand =
        settleInvoiceUsageCostsLedgerCommandSchema.parse(
          ledgerCommand
        )
      expect(invoiceLedgerCommand.type).toBe(
        LedgerTransactionType.SettleInvoiceUsageCosts
      )
      expect(invoiceLedgerCommand.payload.invoice.id).toBe(invoice.id)
      expect(
        invoiceLedgerCommand.payload.invoiceLineItems
      ).toBeDefined()
    })
  })

  it('processes the same PaymentIntentSucceededEvent twice and issues command only once', async () => {
    const stripePaymentIntentId =
      `pi_succeeded_idem_${Date.now()}` + core.nanoid()
    const stripeChargeId =
      `ch_idem_${Date.now()}__succeeded` + core.nanoid()
    const billingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })

    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: billingRun.id,
    })
    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
    })

    const event = createMockPaymentIntentEventResponse(
      'succeeded',
      {
        id: stripePaymentIntentId,
        status: 'succeeded',
        metadata: {
          billingRunId: billingRun.id,
          type: IntentMetadataType.BillingRun,
          billingPeriodId: billingRun.billingPeriodId,
        },
        latest_charge: stripeChargeId,
        livemode: true,
      },
      {
        created: 3000,
        livemode: true,
      }
    )

    await adminTransaction(async ({ transaction }) => {
      const { ledgerCommand: firstLedgerCommand } =
        await processPaymentIntentEventForBillingRun(
          event,
          transaction
        )

      expect(firstLedgerCommand).toBeDefined()

      const { ledgerCommand: secondLedgerCommand } =
        await processPaymentIntentEventForBillingRun(
          event,
          transaction
        )

      expect(secondLedgerCommand).toBeUndefined()
    })
  })

  it('processes a PaymentIntentPaymentFailed event correctly', async () => {
    const stripePaymentIntentId =
      `pi_${Date.now()}___canceled` + core.nanoid()
    const stripeChargeId = `ch_${Date.now()}___failed` + core.nanoid()
    const failedBillingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: Math.floor(Date.now() / 1000),
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })

    const failedInvoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: failedBillingRun.id,
    })
    const payment = await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: failedInvoice.id,
    })
    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'requires_payment_method',
        {
          id: stripePaymentIntentId,
          status: 'requires_payment_method',
          metadata: {
            billingRunId: failedBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: failedBillingRun.billingPeriodId,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          livemode: true,
        }
      )
      const { ledgerCommand } =
        await processPaymentIntentEventForBillingRun(
          event,
          transaction
        )

      const updatedBillingRun = await selectBillingRunById(
        failedBillingRun.id,
        transaction
      )
      const updatedInvoice = await selectInvoiceById(
        failedInvoice.id,
        transaction
      )

      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
      expect(updatedInvoice).toBeDefined()
      expect(ledgerCommand).toBeUndefined()
    })
  })

  it('processes a PaymentIntentCanceled event correctly', async () => {
    const stripePaymentIntentId = `pi_${Date.now()}__canceled`
    const billingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })
    await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: billingRun.id,
    })
    const stripeChargeId = `ch_${invoice.id}___failed`
    const payment = await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
    })

    await adminTransaction(async ({ transaction }) => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Open,
        priceId: price.id,
        billingRunId: billingRun.id,
      })

      const event = createMockPaymentIntentEventResponse(
        'canceled',
        {
          id: stripePaymentIntentId,
          status: 'canceled',
          metadata: {
            billingRunId: billingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: billingRun.billingPeriodId,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: 5000,
          livemode: true,
        }
      )

      const { ledgerCommand } =
        await processPaymentIntentEventForBillingRun(
          event,
          transaction
        )

      const updatedBillingRun = await selectBillingRunById(
        billingRun.id,
        transaction
      )
      const updatedInvoice = await selectInvoiceById(
        invoice.id,
        transaction
      )
      const updatedPayment = await selectPaymentById(
        payment.id,
        transaction
      )
      const updatedSubscription = await selectSubscriptionById(
        subscription.id,
        transaction
      )

      expect(updatedBillingRun.status).toBe(BillingRunStatus.Aborted)
      expect(updatedInvoice.status).toBe(InvoiceStatus.Open)
      expect(updatedPayment.status).toBe(PaymentStatus.Failed)
      expect(updatedSubscription.status).toBe(
        SubscriptionStatus.PastDue
      )
      expect(ledgerCommand).toBeUndefined()
    })
  })

  it('processes a PaymentIntentProcessing event correctly', async () => {
    const stripePaymentIntentId = `pi_${Date.now()}___processing`
    const billingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })
    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: billingRun.id,
    })
    const payment = await setupPayment({
      stripeChargeId: `ch_${billingRun.id}___processing`,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
    })
    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'processing',
        {
          id: stripePaymentIntentId,
          status: 'processing',
          metadata: {
            billingRunId: billingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: billingRun.billingPeriodId,
          },
          latest_charge: `ch_${billingRun.id}__processing`,
          livemode: true,
        },
        {
          created: 6000,
          livemode: true,
        }
      )

      const { ledgerCommand } =
        await processPaymentIntentEventForBillingRun(
          event,
          transaction
        )

      const updatedBillingRun = await selectBillingRunById(
        billingRun.id,
        transaction
      )
      const updatedInvoice = await selectInvoiceById(
        invoice.id,
        transaction
      )
      const updatedPayment = await selectPaymentById(
        payment.id,
        transaction
      )

      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.AwaitingPaymentConfirmation
      )
      expect(updatedInvoice.status).toBe(
        InvoiceStatus.AwaitingPaymentConfirmation
      )
      expect(updatedPayment.status).toBe(PaymentStatus.Processing)
      expect(ledgerCommand).toBeUndefined()
    })
  })

  it('processes a PaymentIntentRequiresAction event correctly', async () => {
    const stripePaymentIntentId = `pi_${Date.now()}___requires_action`
    const stripeChargeId = `ch_${Date.now()}___processing`
    const billingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      livemode: true,
      subscriptionId: subscription.id,
    })
    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: billingRun.id,
    })
    const payment = await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
    })
    await setupMemberships({
      organizationId: organization.id,
    })
    await adminTransaction(async ({ transaction }) => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Open,
        priceId: price.id,
        billingRunId: billingRun.id,
      })

      const event = createMockPaymentIntentEventResponse(
        'requires_action',
        {
          id: stripePaymentIntentId,
          status: 'requires_action',
          metadata: {
            billingRunId: billingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: billingPeriod.id,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: 7000,
          livemode: true,
        }
      )

      const { ledgerCommand } =
        await processPaymentIntentEventForBillingRun(
          event,
          transaction
        )

      const updatedBillingRun = await selectBillingRunById(
        billingRun.id,
        transaction
      )
      const updatedInvoice = await selectInvoiceById(
        invoice.id,
        transaction
      )
      const updatedPayment = await selectPaymentById(
        payment.id,
        transaction
      )

      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.InProgress
      )
      expect(updatedInvoice.status).toBe(InvoiceStatus.Open)
      expect(updatedPayment.status).toBe(PaymentStatus.Processing)
      expect(ledgerCommand).toBeUndefined()
    })
  })

  it('throws an error if no invoice is found for the billing period', async () => {
    const paymentIntentId = `pi_${Date.now()}_no_invoice`
    const billingRun = await setupBillingRun({
      stripePaymentIntentId: paymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })
    await adminTransaction(async ({ transaction }) => {
      // Do not seed any invoice for billingPeriodId 'bp_no_invoice'
      const event = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: paymentIntentId,
          status: 'succeeded',
          metadata: {
            billingRunId: billingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: billingRun.billingPeriodId,
          },
          latest_charge: `ch_no_invoice_${billingRun.id}`,
          livemode: true,
        },
        {
          created: 8000,
          livemode: true,
        }
      )

      await expect(
        processPaymentIntentEventForBillingRun(event, transaction)
      ).rejects.toThrow(
        `Invoice for billing period ${billingRun.billingPeriodId} not found.`
      )
    })
  })

  it('throws an error if no latest charge is found in the event', async () => {
    const billingRun = await setupBillingRun({
      stripePaymentIntentId: 'pi_no_charge',
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })
    await adminTransaction(async ({ transaction }) => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Open,
        priceId: price.id,
        billingRunId: billingRun.id,
      })

      const event = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: 'pi_no_charge',
          status: 'succeeded',
          metadata: {
            billingRunId: billingRun.id,
            billingPeriodId: billingRun.billingPeriodId,
            type: IntentMetadataType.BillingRun,
          },
          latest_charge: null,
          livemode: true,
        },
        {
          created: 9000,
          livemode: true,
        }
      )

      await expect(
        processPaymentIntentEventForBillingRun(event, transaction)
      ).rejects.toThrow(
        /No latest charge found for payment intent pi_no_charge/
      )
    })
  })
  // FIXME: restore this test once we have a way to set up payment intents with associated charges
  // in pre-determined states.

  // it('throws an error if no payment record is found for the latest charge', async () =>
  //   const paymentIntentId = `pi_no_payment_${Date.now()}`
  //   const billingRun = await setupBillingRun({
  //     stripePaymentIntentId: paymentIntentId,
  //     lastPaymentIntentEventTimestamp: new Date(0),
  //     paymentMethodId: paymentMethod.id,
  //     billingPeriodId: billingPeriod.id,
  //     subscriptionId: subscription.id,
  //     livemode: true,
  //   })

  //   await setupInvoice({
  //     billingPeriodId: billingRun.billingPeriodId,
  //     status: InvoiceStatus.Open,
  //     organizationId: organization.id,
  //     customerId: customer.id,
  //     priceId: price.id,
  //   })
  //   await adminTransaction(async ({ transaction }) => {
  //     // Do NOT seed a payment record for stripe charge 'ch_no_payment'
  //     const event: Stripe.PaymentIntentSucceededEvent = {
  //       created: 10000,
  //       data: {
  //         object: {
  //           id: paymentIntentId,
  //           status: 'succeeded',
  //           metadata: {
  //             billingRunId: billingRun.id,
  //             billingPeriodId: billingRun.billingPeriodId,
  //             type: IntentMetadataType.BillingRun,
  //           },
  //           latest_charge: `ch_no_payment_${billingRun.id}`,
  //           livemode: true,
  //         },
  //       },
  //     } as any

  //     await expect(
  //       processPaymentIntentEventForBillingRun(event, transaction)
  //     ).rejects.toThrow(
  //       `Payment record not found for stripe charge ${event.data.object.latest_charge}`
  //     )
  //   })
  // })
})
