import { beforeEach, describe, expect, it } from 'bun:test'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  InvoiceStatus,
  LedgerTransactionType,
  PaymentStatus,
  PriceType,
  SubscriptionStatus,
  UsageCreditStatus,
  UsageCreditType,
} from '@db-core/enums'
import type { BillingPeriodItem } from '@db-core/schema/billingPeriodItems'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { BillingRun } from '@db-core/schema/billingRuns'
import type { Customer } from '@db-core/schema/customers'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import { mockGetStripeCharge } from '@/../bun.stripe.mocks'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupInvoice,
  setupInvoiceLineItem,
  setupMemberships,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupProductFeature,
  setupSubscription,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { settleInvoiceUsageCostsLedgerCommandSchema } from '@/db/ledgerManager/ledgerManagerTypes'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import {
  selectBillingRunById,
  selectBillingRuns,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import { selectInvoiceLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import {
  aggregateBalanceForLedgerAccountFromEntries,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { NotFoundError } from '@/errors'
import {
  createMockPaymentIntentEventResponse,
  createMockStripeCharge,
} from '@/test/helpers/stripeMocks'
import {
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
  createProcessingEffectsContext,
  noopEmitEvent,
  noopInvalidateCache,
} from '@/test-utils/transactionCallbacks'
import core from '@/utils/core'
import { IntentMetadataType } from '@/utils/stripe'

import { isFirstPayment } from './billingRunHelpers'
import { createSubscriptionWorkflow } from './createSubscription/workflow'
import { processOutcomeForBillingRun } from './processBillingRunPaymentIntents'

/**
 * In our tests we assume that getStripeCharge (used inside processOutcomeForBillingRun)
 * is configured (or stubbed in the test environment) so that when called with a known charge id,
 * it returns a charge object with a predictable amount (for example, 1000 for 'ch_success', 500 for 'ch_failed', etc.).
 */

/**
 * Configure mockGetStripeCharge with pattern-based status determination.
 * Call this in beforeEach for any describe block that uses processOutcomeForBillingRun.
 */
function configureMockGetStripeCharge() {
  mockGetStripeCharge.mockImplementation(async (chargeId: string) => {
    // Determine status based on charge ID pattern
    let status: 'succeeded' | 'pending' | 'failed' = 'succeeded'
    let paid = true
    if (chargeId.includes('failed')) {
      status = 'failed'
      paid = false
    } else if (
      chargeId.includes('pending') ||
      chargeId.includes('processing')
    ) {
      status = 'pending'
      paid = false
    }

    return createMockStripeCharge({
      id: chargeId,
      status,
      amount: 1000,
      paid,
      captured: status === 'succeeded',
      payment_method_details: {
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2030,
          fingerprint: 'test_fingerprint',
          funding: 'credit',
          country: 'US',
          network: 'visa',
        },
      } as any,
    })
  })
}

describe('processOutcomeForBillingRun integration tests', async () => {
  const { organization, price, product, pricingModel } =
    await setupOrg()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let billingPeriodItem: BillingPeriodItem.Record
  let subscription: Subscription.Record
  beforeEach(async () => {
    configureMockGetStripeCharge()

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
      const result = (
        await processOutcomeForBillingRun(
          { input: event },
          createDiscardingEffectsContext(transaction)
        )
      ).unwrap()
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
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
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

      const result = (
        await processOutcomeForBillingRun({ input: event }, ctx)
      ).unwrap()

      const updatedBillingRun = (
        await selectBillingRunById(billingRun.id, transaction)
      ).unwrap()
      const updatedInvoice = (
        await selectInvoiceById(invoice.id, transaction)
      ).unwrap()

      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
      expect(updatedBillingRun.lastPaymentIntentEventTimestamp).toBe(
        event.created * 1000
      )
      expect(updatedInvoice.status).toBe(InvoiceStatus.Paid)

      expect(result.billingRun.id).toBe(billingRun.id)
      expect(result.invoice.id).toBe(invoice.id)

      expect(effects.ledgerCommands.length).toBeGreaterThan(0)
      const invoiceLedgerCommand =
        settleInvoiceUsageCostsLedgerCommandSchema.parse(
          effects.ledgerCommands.find(
            (cmd) =>
              cmd.type ===
              LedgerTransactionType.SettleInvoiceUsageCosts
          )
        )
      expect(invoiceLedgerCommand.type).toBe(
        LedgerTransactionType.SettleInvoiceUsageCosts
      )
      expect(invoiceLedgerCommand.payload.invoice.id).toBe(invoice.id)
      expect(
        Array.isArray(invoiceLedgerCommand.payload.invoiceLineItems)
      ).toBe(true)
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
      const { ctx: ctx1, effects: effects1 } =
        createCapturingEffectsContext(transaction)
      await processOutcomeForBillingRun({ input: event }, ctx1)

      expect(effects1.ledgerCommands.length).toBeGreaterThan(0)

      const { ctx: ctx2, effects: effects2 } =
        createCapturingEffectsContext(transaction)
      await processOutcomeForBillingRun({ input: event }, ctx2)

      expect(effects2.ledgerCommands.length).toBe(0)
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
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
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
      await processOutcomeForBillingRun({ input: event }, ctx)

      const updatedBillingRun = (
        await selectBillingRunById(failedBillingRun.id, transaction)
      ).unwrap()
      const updatedInvoice = (
        await selectInvoiceById(failedInvoice.id, transaction)
      ).unwrap()

      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
      expect(typeof updatedInvoice).toBe('object')
      expect(effects.ledgerCommands.length).toBe(0)
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
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      const canceledInvoice = await setupInvoice({
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

      await processOutcomeForBillingRun({ input: event }, ctx)

      const updatedBillingRun = (
        await selectBillingRunById(billingRun.id, transaction)
      ).unwrap()
      const updatedInvoice = (
        await selectInvoiceById(canceledInvoice.id, transaction)
      ).unwrap()
      const updatedPayment = (
        await selectPaymentById(payment.id, transaction)
      ).unwrap()
      const updatedSubscription = (
        await selectSubscriptionById(subscription.id, transaction)
      ).unwrap()

      expect(updatedBillingRun.status).toBe(BillingRunStatus.Aborted)
      expect(updatedInvoice.status).toBe(InvoiceStatus.Open)
      expect(updatedPayment.status).toBe(PaymentStatus.Failed)
      expect(updatedSubscription.status).toBe(
        SubscriptionStatus.PastDue
      )
      expect(effects.ledgerCommands.length).toBe(0)
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
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
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

      await processOutcomeForBillingRun({ input: event }, ctx)

      const updatedBillingRun = (
        await selectBillingRunById(billingRun.id, transaction)
      ).unwrap()
      const updatedInvoice = (
        await selectInvoiceById(invoice.id, transaction)
      ).unwrap()
      const updatedPayment = (
        await selectPaymentById(payment.id, transaction)
      ).unwrap()

      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.AwaitingPaymentConfirmation
      )
      expect(updatedInvoice.status).toBe(
        InvoiceStatus.AwaitingPaymentConfirmation
      )
      expect(updatedPayment.status).toBe(PaymentStatus.Processing)
      expect(effects.ledgerCommands.length).toBe(0)
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
      focusedPricingModelId: pricingModel.id,
    })
    await adminTransaction(async ({ transaction }) => {
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      const requiresActionInvoice = await setupInvoice({
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

      await processOutcomeForBillingRun({ input: event }, ctx)

      const updatedBillingRun = (
        await selectBillingRunById(billingRun.id, transaction)
      ).unwrap()
      const updatedInvoice = (
        await selectInvoiceById(requiresActionInvoice.id, transaction)
      ).unwrap()
      const updatedPayment = (
        await selectPaymentById(payment.id, transaction)
      ).unwrap()

      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.InProgress
      )
      expect(updatedInvoice.status).toBe(InvoiceStatus.Open)
      expect(updatedPayment.status).toBe(PaymentStatus.Processing)
      expect(effects.ledgerCommands.length).toBe(0)
    })
  })

  it('returns NotFoundError when no invoice is found for the billing period', async () => {
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

      const result = await processOutcomeForBillingRun(
        { input: event },
        createDiscardingEffectsContext(transaction)
      )
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error).toBeInstanceOf(NotFoundError)
        expect(result.error.message).toContain('Invoice not found')
      }
    })
  })

  it('returns Result.err when no latest charge is found in the event', async () => {
    const billingRun = await setupBillingRun({
      stripePaymentIntentId: 'pi_no_charge',
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })
    await adminTransaction(async ({ transaction }) => {
      await setupInvoice({
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

      const result = await processOutcomeForBillingRun(
        { input: event },
        createDiscardingEffectsContext(transaction)
      )
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.message).toMatch(
          /LatestCharge not found: pi_no_charge/
        )
      }
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
  //       processOutcomeForBillingRun(event, adjustmentParams, transaction)
  //     ).rejects.toThrow(
  //       `Payment record not found for stripe charge ${event.data.object.latest_charge}`
  //     )
  //   })
  // })

  it('should cancel subscription on first payment failure', async () => {
    // Setup a fresh subscription with no previous payments
    const testCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const testPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: testCustomer.id,
    })

    const testSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: testCustomer.id,
      priceId: price.id,
      paymentMethodId: testPaymentMethod.id,
    })

    const testBillingPeriod = await setupBillingPeriod({
      subscriptionId: testSubscription.id,
      startDate: testSubscription.currentBillingPeriodStart!,
      endDate: testSubscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })

    const testBillingRun = await setupBillingRun({
      billingPeriodId: testBillingPeriod.id,
      paymentMethodId: testPaymentMethod.id,
      subscriptionId: testSubscription.id,
      status: BillingRunStatus.Scheduled,
    })

    await setupBillingPeriodItem({
      billingPeriodId: testBillingPeriod.id,
      quantity: 1,
      unitPrice: 100, // Non-zero amount
    })

    const testInvoice = await setupInvoice({
      billingPeriodId: testBillingPeriod.id,
      customerId: testCustomer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: testBillingRun.id,
    })

    const stripePaymentIntentId = `pi_first_fail_${core.nanoid()}`
    const stripeChargeId = `ch_first_fail_${core.nanoid()}`

    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 100, // Non-zero amount
      customerId: testCustomer.id,
      organizationId: organization.id,
      invoiceId: testInvoice.id,
      stripePaymentIntentId,
      billingPeriodId: testBillingPeriod.id,
    })

    // Verify isFirstPayment returns true before processing
    await adminTransaction(async ({ transaction }) => {
      const isFirst = await isFirstPayment(
        testSubscription,
        transaction
      )
      expect(isFirst).toBe(true)
    })

    // Process the failed payment intent
    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'requires_payment_method',
        {
          id: stripePaymentIntentId,
          status: 'requires_payment_method',
          metadata: {
            billingRunId: testBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: testBillingPeriod.id,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: Date.now() / 1000,
          livemode: true,
        }
      )
      return await processOutcomeForBillingRun(
        { input: event },
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify subscription was canceled
    const canceledSubscription = await adminTransaction(
      async ({ transaction }) => {
        return (
          await selectSubscriptionById(
            testSubscription.id,
            transaction
          )
        ).unwrap()
      }
    )

    expect(canceledSubscription.status).toBe(
      SubscriptionStatus.Canceled
    )
    expect(typeof canceledSubscription.canceledAt).toBe('number')
    expect(canceledSubscription.canceledAt).toBeGreaterThan(0)

    // Verify no retry was scheduled (cancellation should abort scheduled runs)
    const scheduledBillingRuns = await adminTransaction(
      async ({ transaction }) => {
        return selectBillingRuns(
          {
            subscriptionId: testSubscription.id,
            status: BillingRunStatus.Scheduled,
          },
          transaction
        )
      }
    )
    expect(scheduledBillingRuns.length).toBe(0)
  })

  it('should NOT cancel free plan subscription on first payment failure', async () => {
    // Setup a fresh free plan subscription with no previous payments
    const testCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const testPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: testCustomer.id,
    })

    // Create a free price for this test
    const freeProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: product.pricingModelId,
      name: 'Free Plan Product',
      livemode: true,
    })
    const freePrice = await setupPrice({
      productId: freeProduct.id,
      name: 'Free Plan',
      type: PriceType.Subscription,
      unitPrice: 0, // Free plan
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: organization.defaultCurrency,
    })

    const testSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: testCustomer.id,
      priceId: freePrice.id,
      paymentMethodId: testPaymentMethod.id,
      isFreePlan: true, // Mark as free plan
      status: SubscriptionStatus.Active,
    })

    const testBillingPeriod = await setupBillingPeriod({
      subscriptionId: testSubscription.id,
      startDate: testSubscription.currentBillingPeriodStart!,
      endDate: testSubscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })

    const testBillingRun = await setupBillingRun({
      billingPeriodId: testBillingPeriod.id,
      paymentMethodId: testPaymentMethod.id,
      subscriptionId: testSubscription.id,
      status: BillingRunStatus.Scheduled,
    })

    // Create billing period item with usage charges (free plan with usage)
    // This simulates a free base plan that has accumulated usage charges
    await setupBillingPeriodItem({
      billingPeriodId: testBillingPeriod.id,
      quantity: 1,
      unitPrice: 50, // Usage charges on free plan
    })

    const testInvoice = await setupInvoice({
      billingPeriodId: testBillingPeriod.id,
      customerId: testCustomer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: freePrice.id,
      billingRunId: testBillingRun.id,
    })

    const stripePaymentIntentId = `pi_free_first_fail_${core.nanoid()}`
    const stripeChargeId = `ch_free_first_fail_${core.nanoid()}`

    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 50, // Usage charges amount
      customerId: testCustomer.id,
      organizationId: organization.id,
      invoiceId: testInvoice.id,
      stripePaymentIntentId,
      billingPeriodId: testBillingPeriod.id,
    })

    // Verify isFirstPayment returns true before processing
    await adminTransaction(async ({ transaction }) => {
      const isFirst = await isFirstPayment(
        testSubscription,
        transaction
      )
      expect(isFirst).toBe(true)
    })

    // Process the failed payment intent
    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'requires_payment_method',
        {
          id: stripePaymentIntentId,
          status: 'requires_payment_method',
          metadata: {
            billingRunId: testBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: testBillingPeriod.id,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: Date.now() / 1000,
          livemode: true,
        }
      )
      return await processOutcomeForBillingRun(
        { input: event },
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify subscription was NOT canceled (unlike paid plans)
    const updatedSubscription = await adminTransaction(
      async ({ transaction }) => {
        return (
          await selectSubscriptionById(
            testSubscription.id,
            transaction
          )
        ).unwrap()
      }
    )
    expect(updatedSubscription.canceledAt).toBeNull()
    // Verify subscription entered PastDue state (like nth payment failures)
    expect(updatedSubscription.status).toBe(
      SubscriptionStatus.PastDue
    )

    // Verify retry was scheduled (unlike paid plans which get canceled)
    const scheduledBillingRuns = await adminTransaction(
      async ({ transaction }) => {
        return selectBillingRuns(
          {
            subscriptionId: testSubscription.id,
            status: BillingRunStatus.Scheduled,
          },
          transaction
        )
      }
    )
    expect(scheduledBillingRuns.length).toBeGreaterThan(0)
  })

  it('should fail silently for adjustment billing run payment failures - no retry, no state changes, invoice line items deleted', async () => {
    // Setup fresh subscription for this test to avoid interference from existing scheduled runs
    const testCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const testPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: testCustomer.id,
    })
    const testSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: testCustomer.id,
      priceId: price.id,
      paymentMethodId: testPaymentMethod.id,
    })
    const testBillingPeriod = await setupBillingPeriod({
      subscriptionId: testSubscription.id,
      startDate: testSubscription.currentBillingPeriodStart!,
      endDate: testSubscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })

    // Setup adjustment billing run
    const adjustmentBillingRun = await setupBillingRun({
      billingPeriodId: testBillingPeriod.id,
      paymentMethodId: testPaymentMethod.id,
      subscriptionId: testSubscription.id,
      status: BillingRunStatus.Scheduled,
      isAdjustment: true, // Mark as adjustment
      livemode: true,
    })

    const adjustmentInvoice = await setupInvoice({
      billingPeriodId: testBillingPeriod.id,
      customerId: testCustomer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: adjustmentBillingRun.id,
    })

    // Create invoice line items for the adjustment (simulating what executeBillingRun would create)
    await setupInvoiceLineItem({
      invoiceId: adjustmentInvoice.id,
      priceId: price.id,
      quantity: 1,
      price: 500, // Adjustment amount
      billingRunId: adjustmentBillingRun.id, // Link to adjustment billing run
      livemode: true,
    })

    const stripePaymentIntentId = `pi_adjustment_fail_${core.nanoid()}`
    const stripeChargeId = `ch_adjustment_fail_${core.nanoid()}`

    // Update billing run with payment intent ID
    await adminTransaction(async ({ transaction }) => {
      await updateBillingRun(
        {
          id: adjustmentBillingRun.id,
          stripePaymentIntentId,
        },
        transaction
      )
    })

    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 500,
      customerId: testCustomer.id,
      organizationId: organization.id,
      invoiceId: adjustmentInvoice.id,
      stripePaymentIntentId,
      billingPeriodId: testBillingPeriod.id,
    })

    // Store initial state for comparison
    const initialInvoiceStatus = adjustmentInvoice.status
    const initialSubscriptionStatus = testSubscription.status

    const result = await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'requires_payment_method',
        {
          id: stripePaymentIntentId,
          status: 'requires_payment_method',
          metadata: {
            billingRunId: adjustmentBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: testBillingPeriod.id,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: Date.now() / 1000,
          livemode: true,
        }
      )

      return (
        await processOutcomeForBillingRun(
          { input: event },
          createDiscardingEffectsContext(transaction)
        )
      ).unwrap()
    })

    // Assertions after transaction
    await adminTransaction(async ({ transaction }) => {
      const updatedBillingRun = (
        await selectBillingRunById(
          adjustmentBillingRun.id,
          transaction
        )
      ).unwrap()
      const updatedInvoice = (
        await selectInvoiceById(adjustmentInvoice.id, transaction)
      ).unwrap()
      const updatedSubscription = (
        await selectSubscriptionById(testSubscription.id, transaction)
      ).unwrap()

      const remainingLineItems = await selectInvoiceLineItems(
        {
          invoiceId: adjustmentInvoice.id,
          billingRunId: adjustmentBillingRun.id,
        },
        transaction
      )

      // Billing Run Changes
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
      expect(
        updatedBillingRun.lastPaymentIntentEventTimestamp
      ).toBeGreaterThan(0)

      // Invoice Changes - line items should be deleted
      expect(remainingLineItems.length).toBe(0)
      expect(updatedInvoice.status).toBe(initialInvoiceStatus) // Status unchanged

      // Subscription Status - should remain unchanged
      expect(updatedSubscription.status).toBe(
        initialSubscriptionStatus
      )
    })

    // Return value should have empty invoice line items (deleted in early exit)
    expect(result.invoiceLineItems.length).toBe(0)

    // Verify no overages/ledger entries were created
    await adminTransaction(async ({ transaction }) => {
      const ledgerEntries = await selectLedgerEntries(
        {
          claimedByBillingRunId: adjustmentBillingRun.id,
        },
        transaction
      )
      expect(ledgerEntries.length).toBe(0)
    })

    // Verify no retry was scheduled
    const scheduledRetries = await adminTransaction(
      async ({ transaction }) => {
        return selectBillingRuns(
          {
            subscriptionId: testSubscription.id,
            status: BillingRunStatus.Scheduled,
          },
          transaction
        )
      }
    )
    expect(scheduledRetries.length).toBe(0)
  })
})

describe('processOutcomeForBillingRun - usage credit grants', async () => {
  const { organization: orgForGrants, pricingModel } =
    await setupOrg()

  beforeEach(() => {
    configureMockGetStripeCharge()
  })

  it('should grant a "Once" usage credit after payment confirmation', async () => {
    // Create fresh product and price for this test to ensure isolation
    const product = await setupProduct({
      organizationId: orgForGrants.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product for Once Grant',
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price for Once Grant',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
    })

    // Create fresh customer and payment method for this test
    const testCustomer = await setupCustomer({
      organizationId: orgForGrants.id,
    })
    const testPaymentMethod = await setupPaymentMethod({
      organizationId: orgForGrants.id,
      customerId: testCustomer.id,
    })
    // Setup
    const grantAmount = 5000
    const usageMeter = await setupUsageMeter({
      organizationId: orgForGrants.id,
      pricingModelId: pricingModel.id,
      name: 'Test Meter for Once Grant',
    })
    const feature = await setupUsageCreditGrantFeature({
      organizationId: orgForGrants.id,
      name: 'One-time Credits',
      usageMeterId: usageMeter.id,
      renewalFrequency: FeatureUsageGrantFrequency.Once,
      amount: grantAmount,
      livemode: true,
    })
    await setupProductFeature({
      organizationId: orgForGrants.id,
      productId: product.id,
      featureId: feature.id,
      livemode: true,
    })

    // Create subscription with autoStart (creates billing run)
    const workflowResult = await comprehensiveAdminTransaction(
      async (params) => {
        const stripeSetupIntentId = `setupintent_once_grant_${core.nanoid()}`
        return await createSubscriptionWorkflow(
          {
            organization: orgForGrants,
            product,
            price: price,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: testPaymentMethod,
            customer: testCustomer,
            stripeSetupIntentId,
            autoStart: true,
          },
          createProcessingEffectsContext(params)
        )
      }
    )
    const testSubscription = workflowResult.subscription

    // Get the billing run that was created
    const billingRuns = await adminTransaction(
      async ({ transaction }) => {
        return selectBillingRuns(
          { subscriptionId: testSubscription.id },
          transaction
        )
      }
    )

    expect(billingRuns.length).toBe(1)
    const testBillingRun = billingRuns[0]
    expect(testBillingRun.status).toBe(BillingRunStatus.Scheduled)

    // Get the billing period
    const testBillingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return (
          await selectBillingPeriodById(
            testBillingRun.billingPeriodId,
            transaction
          )
        ).unwrap()
      }
    )

    // Create invoice and payment
    const testInvoice = await setupInvoice({
      billingPeriodId: testBillingPeriod.id,
      customerId: testCustomer.id,
      organizationId: orgForGrants.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: testBillingRun.id,
    })

    const stripePaymentIntentId = `pi_once_grant_${core.nanoid()}`
    const stripeChargeId = `ch_once_grant_${core.nanoid()}`

    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: testCustomer.id,
      organizationId: orgForGrants.id,
      invoiceId: testInvoice.id,
    })

    // Process payment intent event (this should grant credits)
    // Use comprehensiveAdminTransaction so ledger commands are processed
    await comprehensiveAdminTransaction(async (params) => {
      const event = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: stripePaymentIntentId,
          status: 'succeeded',
          metadata: {
            billingRunId: testBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: testBillingPeriod.id,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: 3000,
          livemode: true,
        }
      )

      const result = (
        await processOutcomeForBillingRun(
          { input: event },
          createProcessingEffectsContext(params)
        )
      ).unwrap()
      return Result.ok(result)
    })

    // Assertions
    await adminTransaction(async ({ transaction }) => {
      const ledgerAccounts = await selectLedgerAccounts(
        {
          subscriptionId: testSubscription.id,
          usageMeterId: usageMeter.id,
        },
        transaction
      )
      expect(ledgerAccounts.length).toBe(1)
      const ledgerAccount = ledgerAccounts[0]

      const usageCredits = await selectUsageCredits(
        { subscriptionId: testSubscription.id },
        transaction
      )
      expect(usageCredits.length).toBe(1)
      const usageCredit = usageCredits[0]
      expect(usageCredit.issuedAmount).toBe(grantAmount)
      expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
      expect(usageCredit.creditType).toBe(UsageCreditType.Grant)
      expect(usageCredit.expiresAt).toBeNull()
      expect(usageCredit.paymentId).toBeNull()

      // Remaining assertion is to checks for correct grant amount in the ledger
      const balance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      expect(balance).toBe(grantAmount)
    })
  })

  it('should grant an "EveryBillingPeriod" usage credit after payment confirmation', async () => {
    // Create fresh product and price for this test to ensure isolation
    const product = await setupProduct({
      organizationId: orgForGrants.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product for Recurring Grant',
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price for Recurring Grant',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
    })

    // Create fresh customer and payment method for this test
    const testCustomer = await setupCustomer({
      organizationId: orgForGrants.id,
    })
    const testPaymentMethod = await setupPaymentMethod({
      organizationId: orgForGrants.id,
      customerId: testCustomer.id,
    })

    // Setup
    const grantAmount = 3000
    const usageMeter = await setupUsageMeter({
      organizationId: orgForGrants.id,
      pricingModelId: pricingModel.id,
      name: 'Test Meter for Recurring Grant',
    })
    const feature = await setupUsageCreditGrantFeature({
      organizationId: orgForGrants.id,
      name: 'Recurring Credits',
      usageMeterId: usageMeter.id,
      renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
      amount: grantAmount,
      livemode: true,
      pricingModelId: pricingModel.id,
    })
    await setupProductFeature({
      organizationId: orgForGrants.id,
      productId: product.id,
      featureId: feature.id,
      livemode: true,
    })

    // Create subscription with autoStart (creates billing run)
    const workflowResult = await comprehensiveAdminTransaction(
      async (params) => {
        const stripeSetupIntentId = `setupintent_recurring_grant_${core.nanoid()}`
        return await createSubscriptionWorkflow(
          {
            organization: orgForGrants,
            product,
            price: price,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: testPaymentMethod,
            customer: testCustomer,
            stripeSetupIntentId,
            autoStart: true,
          },
          createProcessingEffectsContext(params)
        )
      }
    )
    const testSubscription = workflowResult.subscription

    // Get the billing run that was created
    const billingRuns = await adminTransaction(
      async ({ transaction }) => {
        return selectBillingRuns(
          { subscriptionId: testSubscription.id },
          transaction
        )
      }
    )

    expect(billingRuns.length).toBe(1)
    const testBillingRun = billingRuns[0]

    // Get the billing period
    const testBillingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return (
          await selectBillingPeriodById(
            testBillingRun.billingPeriodId,
            transaction
          )
        ).unwrap()
      }
    )

    // Create invoice and payment
    const testInvoice = await setupInvoice({
      billingPeriodId: testBillingPeriod.id,
      customerId: testCustomer.id,
      organizationId: orgForGrants.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: testBillingRun.id,
    })

    const stripePaymentIntentId = `pi_recurring_grant_${core.nanoid()}`
    const stripeChargeId = `ch_recurring_grant_${core.nanoid()}`

    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: testCustomer.id,
      organizationId: orgForGrants.id,
      invoiceId: testInvoice.id,
    })

    // Process payment intent event (this should grant credits)
    // Use comprehensiveAdminTransaction so ledger commands are processed
    await comprehensiveAdminTransaction(async (params) => {
      const event = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: stripePaymentIntentId,
          status: 'succeeded',
          metadata: {
            billingRunId: testBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: testBillingPeriod.id,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: 3000,
          livemode: true,
        }
      )

      const result = (
        await processOutcomeForBillingRun(
          { input: event },
          createProcessingEffectsContext(params)
        )
      ).unwrap()
      return Result.ok(result)
    })

    // Assertions: similar to "Once" grant, as the first grant is always issued.
    await adminTransaction(async ({ transaction }) => {
      const ledgerAccounts = await selectLedgerAccounts(
        {
          subscriptionId: testSubscription.id,
          usageMeterId: usageMeter.id,
        },
        transaction
      )
      expect(ledgerAccounts.length).toBe(1)
      const ledgerAccount = ledgerAccounts[0]

      const usageCredits = await selectUsageCredits(
        { subscriptionId: testSubscription.id },
        transaction
      )
      expect(usageCredits.length).toBe(1)
      const usageCredit = usageCredits[0]
      expect(usageCredit.issuedAmount).toBe(grantAmount)
      expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
      expect(usageCredit.creditType).toBe(UsageCreditType.Grant)
      expect(usageCredit.expiresAt).toBe(
        testSubscription.currentBillingPeriodEnd
      )
      expect(usageCredit.paymentId).toBeNull()

      const balance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      expect(balance).toBe(grantAmount)
    })
  })

  it('should grant usage credits on first successful payment and not revoke them if subsequent payments fail', async () => {
    const product = await setupProduct({
      organizationId: orgForGrants.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product for Idempotent Grant',
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price for Idempotent Grant',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
    })

    const testCustomer = await setupCustomer({
      organizationId: orgForGrants.id,
    })
    const testPaymentMethod = await setupPaymentMethod({
      organizationId: orgForGrants.id,
      customerId: testCustomer.id,
    })

    const grantAmount = 5000
    const usageMeter = await setupUsageMeter({
      organizationId: orgForGrants.id,
      pricingModelId: pricingModel.id,
      name: 'Test Meter for Idempotent Grant',
    })
    const feature = await setupUsageCreditGrantFeature({
      organizationId: orgForGrants.id,
      name: 'One-time Credits',
      usageMeterId: usageMeter.id,
      renewalFrequency: FeatureUsageGrantFrequency.Once,
      amount: grantAmount,
      livemode: true,
    })
    await setupProductFeature({
      organizationId: orgForGrants.id,
      productId: product.id,
      featureId: feature.id,
      livemode: true,
    })

    const workflowResult = await comprehensiveAdminTransaction(
      async (params) => {
        const stripeSetupIntentId = `setupintent_idempotent_${core.nanoid()}`
        return await createSubscriptionWorkflow(
          {
            organization: orgForGrants,
            product,
            price: price,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: testPaymentMethod,
            customer: testCustomer,
            stripeSetupIntentId,
            autoStart: true,
          },
          createProcessingEffectsContext(params)
        )
      }
    )
    const testSubscription = workflowResult.subscription

    const billingRuns = await adminTransaction(
      async ({ transaction }) => {
        return selectBillingRuns(
          { subscriptionId: testSubscription.id },
          transaction
        )
      }
    )

    expect(billingRuns.length).toBe(1)
    const testBillingRun = billingRuns[0]

    const testBillingPeriod = await adminTransaction(
      async ({ transaction }) => {
        return (
          await selectBillingPeriodById(
            testBillingRun.billingPeriodId,
            transaction
          )
        ).unwrap()
      }
    )

    // Create invoice and first payment
    const testInvoice = await setupInvoice({
      billingPeriodId: testBillingPeriod.id,
      customerId: testCustomer.id,
      organizationId: orgForGrants.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: testBillingRun.id,
    })

    const firstStripePaymentIntentId = `pi_first_${core.nanoid()}`
    const firstStripeChargeId = `ch_first_${core.nanoid()}`

    await setupPayment({
      stripeChargeId: firstStripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: testCustomer.id,
      organizationId: orgForGrants.id,
      invoiceId: testInvoice.id,
      stripePaymentIntentId: firstStripePaymentIntentId,
    })

    // Verify isFirstPayment returns true before processing first payment
    await adminTransaction(async ({ transaction }) => {
      const isFirst = await isFirstPayment(
        testSubscription,
        transaction
      )
      expect(isFirst).toBe(true)
    })

    // 1. First payment succeeds - should grant credits and create transition
    // Use comprehensiveAdminTransaction so ledger commands are processed
    await comprehensiveAdminTransaction(async (params) => {
      const firstEvent = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: firstStripePaymentIntentId,
          status: 'succeeded',
          metadata: {
            billingRunId: testBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: testBillingPeriod.id,
          },
          latest_charge: firstStripeChargeId,
          livemode: true,
        },
        {
          created: 3000,
          livemode: true,
        }
      )

      const result = (
        await processOutcomeForBillingRun(
          { input: firstEvent },
          createProcessingEffectsContext(params)
        )
      ).unwrap()
      return Result.ok(result)
    })

    // Verify credits were granted after first payment
    const creditsAfterFirst = await adminTransaction(
      async ({ transaction }) => {
        return selectUsageCredits(
          { subscriptionId: testSubscription.id },
          transaction
        )
      }
    )
    expect(creditsAfterFirst.length).toBe(1)
    expect(creditsAfterFirst[0].issuedAmount).toBe(grantAmount)
    expect(creditsAfterFirst[0].status).toBe(UsageCreditStatus.Posted)

    // 2. Second payment fails - should NOT create new transition or revoke credits
    const secondStripePaymentIntentId = `pi_second_${core.nanoid()}`
    const secondStripeChargeId = `ch_second_${core.nanoid()}`

    await setupPayment({
      stripeChargeId: secondStripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: testCustomer.id,
      organizationId: orgForGrants.id,
      invoiceId: testInvoice.id,
      stripePaymentIntentId: secondStripePaymentIntentId,
    })

    // 2. Second payment fails - should NOT create new transition or revoke credits
    await adminTransaction(async ({ transaction }) => {
      const secondEvent = createMockPaymentIntentEventResponse(
        'requires_payment_method',
        {
          id: secondStripePaymentIntentId,
          status: 'requires_payment_method',
          metadata: {
            billingRunId: testBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: testBillingPeriod.id,
          },
          latest_charge: secondStripeChargeId,
          livemode: true,
        },
        {
          created: 4000,
          livemode: true,
        }
      )

      return await processOutcomeForBillingRun(
        { input: secondEvent },
        createDiscardingEffectsContext(transaction)
      )
    })

    // 3. Verify credits still exist (not revoked)
    const creditsAfterSecond = await adminTransaction(
      async ({ transaction }) => {
        return selectUsageCredits(
          { subscriptionId: testSubscription.id },
          transaction
        )
      }
    )
    expect(creditsAfterSecond.length).toBe(1)
    expect(creditsAfterSecond[0].issuedAmount).toBe(grantAmount)
    expect(creditsAfterSecond[0].status).toBe(
      UsageCreditStatus.Posted
    )

    // Verify no duplicate transition was created
    const allTransitions = await adminTransaction(
      async ({ transaction }) => {
        return selectLedgerTransactions(
          {
            subscriptionId: testSubscription.id,
            type: LedgerTransactionType.BillingPeriodTransition,
            initiatingSourceId: testBillingPeriod.id,
          },
          transaction
        )
      }
    )

    // Ensure correct Billing Period Transition Ledger Command was created
    expect(allTransitions.length).toBe(1)
    const transition = allTransitions[0]
    expect(transition.type).toBe(
      LedgerTransactionType.BillingPeriodTransition
    )
    expect(transition.initiatingSourceId).toBe(testBillingPeriod.id)
    expect(transition.subscriptionId).toBe(testSubscription.id)
  })
})

describe('processOutcomeForBillingRun - effects callbacks', async () => {
  const { organization, price, product } = await setupOrg()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let subscription: Subscription.Record

  beforeEach(async () => {
    configureMockGetStripeCharge()
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
  })

  it('calls enqueueLedgerCommand with SettleInvoiceUsageCostsLedgerCommand for usage-based billing', async () => {
    // Setup usage meter and price
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
    })
    const usagePrice = await setupPrice({
      name: 'Usage Price',
      type: PriceType.Usage,
      unitPrice: 10,
      usageMeterId: usageMeter.id,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: organization.defaultCurrency,
    })

    const usageSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: usagePrice.id,
      paymentMethodId: paymentMethod.id,
      status: SubscriptionStatus.Active,
    })

    const usageBillingPeriod = await setupBillingPeriod({
      subscriptionId: usageSubscription.id,
      startDate: usageSubscription.currentBillingPeriodStart!,
      endDate: usageSubscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })

    const stripePaymentIntentId = `pi_usage_test_${core.nanoid()}`
    const stripeChargeId = `ch_usage_test_${core.nanoid()}`
    const usageBillingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: usageBillingPeriod.id,
      subscriptionId: usageSubscription.id,
      livemode: true,
    })

    const usageInvoice = await setupInvoice({
      billingPeriodId: usageBillingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: usagePrice.id,
      billingRunId: usageBillingRun.id,
    })

    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: usageInvoice.id,
    })

    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: stripePaymentIntentId,
          status: 'succeeded',
          metadata: {
            billingRunId: usageBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: usageBillingPeriod.id,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: 3000,
          livemode: true,
        }
      )

      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      await processOutcomeForBillingRun({ input: event }, ctx)

      // Verify enqueueLedgerCommand was called with SettleInvoiceUsageCosts command
      expect(effects.ledgerCommands.length).toBeGreaterThan(0)
      const settleInvoiceCommand = effects.ledgerCommands.find(
        (cmd: { type: string }) =>
          cmd.type === LedgerTransactionType.SettleInvoiceUsageCosts
      )

      // Validate the command structure using the schema
      const parsedCommand =
        settleInvoiceUsageCostsLedgerCommandSchema.safeParse(
          settleInvoiceCommand
        )
      expect(parsedCommand.success).toBe(true)

      // Assert parsed command has expected structure using type narrowing
      if (!parsedCommand.success) {
        throw new Error('Expected parsedCommand to be successful')
      }
      expect(parsedCommand.data.payload.invoice.id).toBe(
        usageInvoice.id
      )
      expect(parsedCommand.data.livemode).toBe(true)
      expect(parsedCommand.data.organizationId).toBe(organization.id)
    })
  })

  it('calls invalidateCache with customerSubscriptions after subscription status change to PastDue', async () => {
    // Setup a subscription that will be updated to PastDue on payment failure
    const testCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const testPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: testCustomer.id,
    })
    const testSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: testCustomer.id,
      priceId: price.id,
      paymentMethodId: testPaymentMethod.id,
      status: SubscriptionStatus.Active,
    })

    const testBillingPeriod = await setupBillingPeriod({
      subscriptionId: testSubscription.id,
      startDate: testSubscription.currentBillingPeriodStart!,
      endDate: testSubscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })

    // Create a succeeded billing run first so this isn't considered "first payment"
    await setupBillingRun({
      billingPeriodId: testBillingPeriod.id,
      paymentMethodId: testPaymentMethod.id,
      subscriptionId: testSubscription.id,
      status: BillingRunStatus.Succeeded,
    })

    // Now create the billing run that will fail
    const stripePaymentIntentId = `pi_cache_test_${core.nanoid()}`
    const stripeChargeId = `ch_cache_test_${core.nanoid()}`
    const failingBillingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: testPaymentMethod.id,
      billingPeriodId: testBillingPeriod.id,
      subscriptionId: testSubscription.id,
      livemode: true,
    })

    const testInvoice = await setupInvoice({
      billingPeriodId: testBillingPeriod.id,
      customerId: testCustomer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: failingBillingRun.id,
    })

    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: testCustomer.id,
      organizationId: organization.id,
      invoiceId: testInvoice.id,
    })

    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'canceled',
        {
          id: stripePaymentIntentId,
          status: 'canceled',
          metadata: {
            billingRunId: failingBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: testBillingPeriod.id,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: Date.now() / 1000,
          livemode: true,
        }
      )

      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      await processOutcomeForBillingRun({ input: event }, ctx)

      // Verify subscription is now PastDue
      const updatedSubscription = (
        await selectSubscriptionById(testSubscription.id, transaction)
      ).unwrap()
      expect(updatedSubscription.status).toBe(
        SubscriptionStatus.PastDue
      )

      // Verify invalidateCache was called with customerSubscriptions for the customer
      const customerSubscriptionsKey = `customerSubscriptions:${testCustomer.id}`
      expect(effects.cacheInvalidations).toContain(
        customerSubscriptionsKey
      )
    })
  })

  it('calls invalidateCache with customerSubscriptions after successful payment', async () => {
    const stripePaymentIntentId =
      `pi_cache_success_${Date.now()}` + core.nanoid()
    const stripeChargeId =
      `ch_${Date.now()}__cache_success` + core.nanoid()
    const successBillingRun = await setupBillingRun({
      stripePaymentIntentId,
      lastPaymentIntentEventTimestamp: 0,
      paymentMethodId: paymentMethod.id,
      billingPeriodId: billingPeriod.id,
      subscriptionId: subscription.id,
      livemode: true,
    })

    const successInvoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Open,
      priceId: price.id,
      billingRunId: successBillingRun.id,
    })
    await setupPayment({
      stripeChargeId,
      status: PaymentStatus.Processing,
      amount: 1000,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: successInvoice.id,
    })
    await adminTransaction(async ({ transaction }) => {
      const event = createMockPaymentIntentEventResponse(
        'succeeded',
        {
          id: stripePaymentIntentId,
          status: 'succeeded',
          metadata: {
            billingRunId: successBillingRun.id,
            type: IntentMetadataType.BillingRun,
            billingPeriodId: successBillingRun.billingPeriodId,
          },
          latest_charge: stripeChargeId,
          livemode: true,
        },
        {
          created: 3000,
          livemode: true,
        }
      )

      const { ctx, effects } =
        createCapturingEffectsContext(transaction)
      await processOutcomeForBillingRun({ input: event }, ctx)

      // Verify invalidateCache was called with customerSubscriptions
      const customerSubscriptionsKey = `customerSubscriptions:${customer.id}`
      expect(effects.cacheInvalidations).toContain(
        customerSubscriptionsKey
      )
    })
  })
})
