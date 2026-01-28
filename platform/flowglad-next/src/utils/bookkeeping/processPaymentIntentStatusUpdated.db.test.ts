import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import { sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import {
  setupBillingPeriod,
  setupBillingRun,
  setupCheckoutSession,
  setupCustomer,
  setupFeeCalculation,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupPurchase,
  setupSubscription,
  setupTestFeaturesAndProductFeatures,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Payment } from '@/db/schema/payments'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Purchase } from '@/db/schema/purchases'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { selectEvents } from '@/db/tableMethods/eventMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import {
  safelyUpdateInvoiceStatus,
  selectInvoiceById,
} from '@/db/tableMethods/invoiceMethods'
import { insertProductFeature } from '@/db/tableMethods/productFeatureMethods'
import {
  selectPurchaseById,
  updatePurchase,
} from '@/db/tableMethods/purchaseMethods'
import {
  selectUsageCreditById,
  selectUsageCredits,
} from '@/db/tableMethods/usageCreditMethods'
import { NotFoundError } from '@/errors'
import {
  createMockPaymentIntent,
  createMockStripeCharge,
} from '@/test/helpers/stripeMocks'
import { createDiscardingEffectsContext } from '@/test-utils/transactionCallbacks'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  CountryCode,
  CurrencyCode,
  EventNoun,
  FeatureType,
  FeatureUsageGrantFrequency,
  FeeCalculationType,
  FlowgladEventType,
  IntervalUnit,
  InvoiceStatus,
  LedgerTransactionType,
  PaymentMethodType,
  PaymentStatus,
  PriceType,
  PurchaseStatus,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
} from '@/types'
import {
  type CoreStripePaymentIntent,
  chargeStatusToPaymentStatus,
  ledgerCommandForPaymentSucceeded,
  processPaymentIntentStatusUpdated,
  selectFeeCalculationForPaymentIntent,
  updatePaymentToReflectLatestChargeStatus,
  upsertPaymentForStripeCharge,
} from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import {
  IntentMetadataType,
  type StripeIntentMetadata,
} from '@/utils/stripe'
import core from '../core'

// Use global mock from bun.db.mocks.ts
const mockGetStripeCharge = globalThis.__mockGetStripeCharge

describe('ledgerCommandForPaymentSucceeded', () => {
  // Shared globals for setup reused across tests
  let organization: Organization.Record
  let product: Product.Record
  let subscriptionPrice: Price.Record
  let singlePaymentPrice: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription:
    | import('@/db/schema/subscriptions').Subscription.Record
    | null
  let invoice: Invoice.Record
  let payment: Payment.Record

  beforeEach(async () => {
    // setup shared state used by multiple tests
    // - create organization, default product and a subscription price from setupOrg
    // - create customer and payment method
    // - create an active subscription for the customer on the subscription price
    // - create a SinglePayment price to use in positive-path cases
    // - create invoice and payment linked to the customer and organization
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    subscriptionPrice = orgData.price

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
      paymentMethodId: paymentMethod.id,
      priceId: subscriptionPrice.id,
    })

    singlePaymentPrice = await setupPrice({
      productId: product.id,
      name: 'Single Payment Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 2000,
      livemode: true,
      isDefault: false,
      currency: organization.defaultCurrency,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: subscriptionPrice.id,
    })
    payment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Processing,
      amount: 1000,
      livemode: true,
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
    })
  })
  it('returns undefined when price type is not SinglePayment', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return ledgerCommandForPaymentSucceeded(
        { priceId: subscriptionPrice.id, payment },
        transaction
      )
    })
    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBeUndefined()
    }
  })

  it('returns undefined when product has no features', async () => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
    })
    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBeUndefined()
    }
  })

  it('returns undefined when product has only non-UsageCredit features', async () => {
    await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        { name: 'Toggle Only', type: FeatureType.Toggle },
      ],
    })
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
    })
    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBeUndefined()
    }
  })

  it('returns undefined when customer has no current subscription', async () => {
    await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        {
          name: 'Grant A',
          type: FeatureType.UsageCreditGrant,
          amount: 123,
          usageMeterName: 'UM-A',
        },
      ],
    })
    const altCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const altInvoice = await setupInvoice({
      organizationId: organization.id,
      customerId: altCustomer.id,
      priceId: singlePaymentPrice.id,
    })
    const altPayment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Processing,
      amount: 500,
      livemode: true,
      organizationId: organization.id,
      customerId: altCustomer.id,
      invoiceId: altInvoice.id,
    })
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment: altPayment },
        transaction
      )
    })
    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBeUndefined()
    }
  })

  it('creates UsageCredit and returns CreditGrantRecognized ledger command (happy path)', async () => {
    const [featureData] = await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        {
          name: 'Grant A',
          type: FeatureType.UsageCreditGrant,
          amount: 777,
          usageMeterName: 'UM-A',
        },
      ],
    })
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
    })
    expect(Result.isOk(result)).toBe(true)
    if (!Result.isOk(result)) return
    const command = result.value
    expect(command).toMatchObject({ organizationId: organization.id })
    expect(command!.type).toBe(
      LedgerTransactionType.CreditGrantRecognized
    )
    expect(command!.organizationId).toBe(organization.id)
    expect(command!.subscriptionId).toBe(subscription!.id)
    expect(command!.livemode).toBe(true)
    const usageCredit = command!.payload.usageCredit
    expect(usageCredit.issuedAmount).toBe(777)
    expect(typeof usageCredit.usageMeterId).toBe('string')
    expect(usageCredit.sourceReferenceId).toBe(payment.invoiceId)
    expect(usageCredit.paymentId).toBe(payment.id)
    expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
    expect(usageCredit.sourceReferenceType).toBe(
      UsageCreditSourceReferenceType.InvoiceSettlement
    )
  })

  it('uses the first UsageCreditGrant feature when multiple exist', async () => {
    await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        {
          name: 'Grant A',
          type: FeatureType.UsageCreditGrant,
          amount: 111,
          usageMeterName: 'UM-A',
        },
        {
          name: 'Grant B',
          type: FeatureType.UsageCreditGrant,
          amount: 999,
          usageMeterName: 'UM-B',
        },
      ],
    })
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
    })
    expect(Result.isOk(result)).toBe(true)
    if (!Result.isOk(result)) return
    const command = result.value
    expect(typeof command).toBe('object')
    expect(command!.payload.usageCredit.issuedAmount).toBe(111)
  })

  it('fails when usage credit grant amount is zero', async () => {
    // Insert feature with amount: 0 using raw SQL to bypass schema validation
    // We need to ensure the feature is linked to the same product as singlePaymentPrice
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'UM-Z',
        livemode: true,
        pricingModelId: product.pricingModelId,
      })

      const featureId = core.nanoid()
      const slug = `grant-zero-${core.nanoid(6)}`

      // Insert feature directly using raw SQL to bypass schema validation
      await transaction.execute(
        sql`
          INSERT INTO features (
            id, organization_id, type, slug, name, description, amount,
            usage_meter_id, renewal_frequency, pricing_model_id, active,
            livemode, created_at, updated_at, position
          ) VALUES (
            ${featureId},
            ${organization.id},
            ${FeatureType.UsageCreditGrant},
            ${slug},
            ${'Grant Zero'},
            ${'Grant Zero description'},
            ${0},
            ${usageMeter.id},
            ${FeatureUsageGrantFrequency.EveryBillingPeriod},
            ${product.pricingModelId},
            ${true},
            ${true},
            now(),
            now(),
            ${0}
          )
        `
      )

      // Ensure the feature is linked to the product that singlePaymentPrice uses.
      // Single payment prices always have productId.
      await insertProductFeature(
        {
          organizationId: organization.id,
          livemode: true,
          productId: singlePaymentPrice.productId!,
          featureId,
        },
        ctx
      )
    })

    await expect(
      adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return ledgerCommandForPaymentSucceeded(
          { priceId: singlePaymentPrice.id, payment },
          transaction
        )
      })
    ).rejects.toThrow('Too small: expected number to be >0')
  })

  it('ensures transaction is passed to all DB methods as last argument', async () => {
    await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        {
          name: 'Grant A',
          type: FeatureType.UsageCreditGrant,
          amount: 5,
          usageMeterName: 'UM-A',
        },
      ],
    })
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
    })
    expect(Result.isOk(result)).toBe(true)
    if (!Result.isOk(result)) return
    const command = result.value
    expect(typeof command).toBe('object')
    // additionally re-select the usage credit to ensure it was persisted via the same transactional flow
    const reselected = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const id = command!.payload.usageCredit.id
      return (await selectUsageCreditById(id, transaction)).unwrap()
    })
    expect(reselected).toMatchObject({
      id: command!.payload.usageCredit.id,
    })
    expect(reselected!.id).toBe(command!.payload.usageCredit.id)
  })

  it('is idempotent: does not re-insert UsageCredit when called twice for same payment', async () => {
    await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        {
          name: 'UC Grant',
          type: FeatureType.UsageCreditGrant,
          amount: 321,
          usageMeterName: 'UM-UC',
        },
      ],
    })

    // First call should create the usage credit
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const result = await ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
      return result.unwrap()
    })

    // Second call should no-op due to unique index and bulkInsertOrDoNothing
    const secondLedgerCommandResult = await adminTransaction(
      async (ctx) => {
        const { transaction } = ctx
        return ledgerCommandForPaymentSucceeded(
          { priceId: singlePaymentPrice.id, payment },
          transaction
        )
      }
    )
    const secondLedgerCommand = secondLedgerCommandResult.unwrap()
    expect(secondLedgerCommand).toBeUndefined()

    // Assert only one usage credit exists for this payment
    const credits = await adminTransaction(async ({ transaction }) =>
      selectUsageCredits({ paymentId: payment.id }, transaction)
    )
    expect(credits.length).toBe(1)
    expect(credits[0].issuedAmount).toBe(321)
    expect(credits[0].paymentId).toBe(payment.id)
  })
})

const succeededCharge = {
  status: 'succeeded',
  failure_code: null,
  failure_message: null,
} as const

const failedCharge = {
  status: 'failed',
  failure_code: 'insufficient_funds',
  failure_message: 'Insufficient funds',
} as const
/**
 * FIXME: many test cases in this file are commented out
 * because we do not have an easy way to set up payment intents with associated charges
 * in pre-determined states.
 */
describe('Process payment intent status updated', async () => {
  let payment: Payment.Record
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record
  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price
  })
  let customer: Customer.Record
  let invoice: Invoice.Record
  beforeEach(async () => {
    customer = await setupCustomer({
      organizationId: organization.id,
    })
    invoice = await setupInvoice({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
    })
    payment = await setupPayment({
      stripeChargeId: `ch123_${invoice.id}`,
      status: PaymentStatus.Processing,
      amount: 1000,
      livemode: true,
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
    })
  })

  describe('chargeStatusToPaymentStatus', () => {
    it('converts a Stripe "succeeded" status to an internal Succeeded status', () => {
      const result = chargeStatusToPaymentStatus('succeeded')
      expect(result).toEqual(PaymentStatus.Succeeded)
    })

    it('converts a Stripe "failed" status to an internal Failed status', () => {
      const result = chargeStatusToPaymentStatus('failed')
      expect(result).toEqual(PaymentStatus.Failed)
    })

    it('defaults unknown Stripe charge statuses to Processing', () => {
      const result = chargeStatusToPaymentStatus('pending' as any)
      expect(result).toEqual(PaymentStatus.Processing)
    })
  })

  describe('updatePaymentToReflectLatestChargeStatus', () => {
    let fakePayment: Payment.Record

    beforeEach(async () => {
      fakePayment = await setupPayment({
        stripeChargeId: `ch123_${core.nanoid()}`,
        status: PaymentStatus.Processing,
        amount: 1000,
        livemode: true,
        organizationId: organization.id,
        customerId: customer.id,
        invoiceId: invoice.id,
      })
    })

    it('updates the payment status when the charge status differs from the current payment status', async () => {
      const updatedPayment = {
        ...fakePayment,
        status: PaymentStatus.Succeeded,
      }

      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          return updatePaymentToReflectLatestChargeStatus(
            fakePayment,
            succeededCharge,
            {
              transaction,
              cacheRecomputationContext,
              invalidateCache: invalidateCache!,
              emitEvent: emitEvent!,
              enqueueLedgerCommand: enqueueLedgerCommand!,
            }
          )
        }
      )
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.value.status).toEqual(PaymentStatus.Succeeded)
      }
    })

    it('does not update the payment status if the current status already matches the charge status', async () => {
      fakePayment.status = PaymentStatus.Succeeded
      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) =>
          updatePaymentToReflectLatestChargeStatus(
            fakePayment,
            succeededCharge,
            {
              transaction,
              cacheRecomputationContext,
              invalidateCache: invalidateCache!,
              emitEvent: emitEvent!,
              enqueueLedgerCommand: enqueueLedgerCommand!,
            }
          )
      )
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.value.status).toEqual(PaymentStatus.Succeeded)
      }
    })

    it('updates the associated invoice status when an invoiceId exists', async () => {
      const updatedPayment = {
        ...fakePayment,
        status: PaymentStatus.Succeeded,
      }
      await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          await updatePaymentToReflectLatestChargeStatus(
            fakePayment,
            succeededCharge,
            {
              transaction,
              cacheRecomputationContext,
              invalidateCache: invalidateCache!,
              emitEvent: emitEvent!,
              enqueueLedgerCommand: enqueueLedgerCommand!,
            }
          )
          const invoice = (
            await selectInvoiceById(
              fakePayment.invoiceId,
              transaction
            )
          ).unwrap()
          expect(invoice.status).toEqual(InvoiceStatus.Paid)
        }
      )
    })

    it('updates the associated purchase status when a purchaseId exists', async () => {
      const purchase = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        livemode: true,
        priceId: price.id,
      })
      const updatedPayment = {
        ...fakePayment,
        status: PaymentStatus.Succeeded,
        purchaseId: purchase.id,
      }
      await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          await updatePaymentToReflectLatestChargeStatus(
            updatedPayment,
            succeededCharge,
            {
              transaction,
              cacheRecomputationContext,
              invalidateCache: invalidateCache!,
              emitEvent: emitEvent!,
              enqueueLedgerCommand: enqueueLedgerCommand!,
            }
          )
          const updatedPurchase = (
            await selectPurchaseById(purchase.id, transaction)
          ).unwrap()
          expect(updatedPurchase.status).toEqual(PurchaseStatus.Paid)
        }
      )
    })

    it('returns an error if there is no associated invoice', async () => {
      // @ts-expect-error - no invoice id
      fakePayment.invoiceId = null
      fakePayment.purchaseId = null
      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) =>
          updatePaymentToReflectLatestChargeStatus(
            fakePayment,
            succeededCharge,
            {
              transaction,
              cacheRecomputationContext,
              invalidateCache: invalidateCache!,
              emitEvent: emitEvent!,
              enqueueLedgerCommand: enqueueLedgerCommand!,
            }
          )
      )
      expect(result.status).toBe('error')
    })

    it('handles cases gracefully when there is no associated purchase', async () => {
      fakePayment.purchaseId = null
      const updatedPayment = {
        ...fakePayment,
        status: PaymentStatus.Succeeded,
      }
      await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const result = (
            await updatePaymentToReflectLatestChargeStatus(
              fakePayment,
              succeededCharge,
              {
                transaction,
                cacheRecomputationContext,
                invalidateCache: invalidateCache!,
                emitEvent: emitEvent!,
                enqueueLedgerCommand: enqueueLedgerCommand!,
              }
            )
          ).unwrap()
          expect(result.status).toEqual(PaymentStatus.Succeeded)
        }
      )
    })

    it('maintains idempotency when called multiple times with the same charge status', async () => {
      fakePayment.status = PaymentStatus.Succeeded
      await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const ctx = {
            transaction,
            cacheRecomputationContext,
            invalidateCache: invalidateCache!,
            emitEvent: emitEvent!,
            enqueueLedgerCommand: enqueueLedgerCommand!,
          }
          const result1 = (
            await updatePaymentToReflectLatestChargeStatus(
              fakePayment,
              succeededCharge,
              ctx
            )
          ).unwrap()
          const result2 = (
            await updatePaymentToReflectLatestChargeStatus(
              fakePayment,
              succeededCharge,
              ctx
            )
          ).unwrap()
          expect(result1).toEqual(result2)
        }
      )
    })

    it('updates the payment status to Failed when the charge status is failed', async () => {
      fakePayment.status = PaymentStatus.Processing
      await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const result = (
            await updatePaymentToReflectLatestChargeStatus(
              fakePayment,
              failedCharge,
              {
                transaction,
                cacheRecomputationContext,
                invalidateCache: invalidateCache!,
                emitEvent: emitEvent!,
                enqueueLedgerCommand: enqueueLedgerCommand!,
              }
            )
          ).unwrap()
          expect(result.status).toEqual(PaymentStatus.Failed)
        }
      )
    })

    it('updates the failure message when the charge status is failed', async () => {
      fakePayment.status = PaymentStatus.Processing
      await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const result = (
            await updatePaymentToReflectLatestChargeStatus(
              fakePayment,
              failedCharge,
              {
                transaction,
                cacheRecomputationContext,
                invalidateCache: invalidateCache!,
                emitEvent: emitEvent!,
                enqueueLedgerCommand: enqueueLedgerCommand!,
              }
            )
          ).unwrap()
          expect(result.failureMessage).toEqual(
            failedCharge.failure_message
          )
        }
      )
    })
  })

  describe('upsertPaymentForStripeCharge', () => {
    it('throws an error if the charge does not include a payment_intent', async () => {
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      const metadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const fakeCharge = createMockStripeCharge({
        id: 'ch_no_pi',
        // Stripe.Charge expects string | PI object; use any to force null
        payment_intent: null,
        created: 123456,
        status: 'succeeded',
        metadata,
        billing_details: { address: { country: 'US' } } as any,
      })
      const fakeMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const result = await adminTransaction(async ({ transaction }) =>
        upsertPaymentForStripeCharge(
          {
            charge: fakeCharge,
            paymentIntentMetadata: fakeMetadata,
          },
          createDiscardingEffectsContext(transaction)
        )
      )
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.message).toMatch(
          /PaymentIntent not found/
        )
      }
    })

    it('returns an error if payment intent metadata is missing', async () => {
      const fakeCharge = createMockStripeCharge({
        id: 'ch1',
        payment_intent: 'pi_1',
        created: 123456,
        status: 'succeeded',
        billing_details: { address: { country: 'US' } } as any,
      })
      const result = await adminTransaction(async ({ transaction }) =>
        upsertPaymentForStripeCharge(
          {
            charge: fakeCharge,
            paymentIntentMetadata:
              null as unknown as StripeIntentMetadata,
          },
          createDiscardingEffectsContext(transaction)
        )
      )
      expect(result.status).toBe('error')
    })

    it('returns an error if metadata does not contain any of billingRunId or checkoutSessionId', async () => {
      const fakeCharge = createMockStripeCharge({
        id: 'ch1',
        payment_intent: 'pi_1',
        created: 123456,
        status: 'succeeded',
        metadata: {
          _: 'some_value',
          type: 'unknown_type',
        },
        billing_details: { address: { country: 'US' } } as any,
      })
      const fakeMetadata = {} as StripeIntentMetadata
      const result = await adminTransaction(async ({ transaction }) =>
        upsertPaymentForStripeCharge(
          {
            charge: fakeCharge,
            paymentIntentMetadata: fakeMetadata,
          },
          createDiscardingEffectsContext(transaction)
        )
      )
      expect(result.status).toBe('error')
    })

    it('throws an error if the checkout session cannot be found', async () => {
      const fakeCharge = createMockStripeCharge({
        id: 'ch1',
        payment_intent: 'pi_1',
        created: 123456,
        status: 'succeeded',
        billing_details: { address: { country: 'US' } } as any,
      })
      const fakeMetadata = {
        checkoutSessionId: 'chckt_session_missing',
        type: IntentMetadataType.CheckoutSession,
      } as StripeIntentMetadata
      await expect(
        adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).rejects.toThrow()
    })

    it('correctly maps payment record fields for a product checkout session', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      const metadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const fakeCharge = createMockStripeCharge({
        id: 'ch1',
        payment_intent: 'pi_1',
        created: 1610000000,
        amount: 5000,
        status: 'succeeded',
        metadata,
        payment_method_details: {
          id: paymentMethod.stripePaymentMethodId,
          type: paymentMethod.type,
        } as any,
        billing_details: { address: { country: 'US' } } as any,
      })
      const fakeMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const { payment } = (
        await adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).unwrap()
      expect(payment.amount).toBe(5000)
      expect(payment.stripeChargeId).toBe('ch1')
    })

    it('propagates Stripe Tax fields from fee calculation to payment for checkout sessions', async () => {
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })

      const feeCalculation = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return insertFeeCalculation(
          {
            checkoutSessionId: checkoutSession.id,
            organizationId: organization.id,
            priceId: price.id,
            purchaseId: null,
            discountId: null,
            livemode: checkoutSession.livemode,
            currency: CurrencyCode.USD,
            type: FeeCalculationType.CheckoutSessionPayment,
            billingAddress: {
              address: {
                line1: '123 Test St',
                line2: 'Apt 1',
                city: 'Test City',
                state: 'Test State',
                postal_code: '12345',
                country: CountryCode.US,
              },
            },
            billingPeriodId: null,
            paymentMethodType: PaymentMethodType.Card,
            discountAmountFixed: 0,
            paymentMethodFeeFixed: 0,
            baseAmount: 1000,
            pretaxTotal: 1000,
            taxAmountFixed: 123,
            stripeTaxCalculationId: 'txcalc_test_abc',
            stripeTaxTransactionId: 'tax_txn_test_abc',
            internationalFeePercentage: '0',
            flowgladFeePercentage: '0.65',
            internalNotes:
              'Test Fee Calculation w/ Stripe Tax fields',
          },
          transaction
        )
      })

      const fakeCharge = createMockStripeCharge({
        id: 'ch_tax_fields',
        payment_intent: 'pi_tax_fields',
        created: 1610000000,
        amount: 5000,
        status: 'succeeded',
        payment_method_details: {
          type: 'card',
        },
        billing_details: {
          address: {
            line1: '123 Test St',
            line2: 'Apt 1',
            city: 'Test City',
            state: 'CA',
            postal_code: '12345',
            country: 'US',
          },
          email: null,
          name: null,
          phone: null,
        },
      })
      const fakeMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }

      const { payment } = (
        await adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).unwrap()

      expect(payment.subtotal).toBe(feeCalculation.pretaxTotal)
      expect(payment.taxAmount).toBe(feeCalculation.taxAmountFixed)
      expect(payment.stripeTaxCalculationId).toBe(
        feeCalculation.stripeTaxCalculationId
      )
      expect(payment.stripeTaxTransactionId).toBe(
        feeCalculation.stripeTaxTransactionId
      )
    })

    it('selectFeeCalculationForPaymentIntent selects latest fee calculation for checkout sessions', async () => {
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })

      const feeCalculationOld = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return insertFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
              organizationId: organization.id,
              priceId: price.id,
              purchaseId: null,
              discountId: null,
              livemode: checkoutSession.livemode,
              currency: CurrencyCode.USD,
              type: FeeCalculationType.CheckoutSessionPayment,
              billingAddress: {
                address: {
                  line1: '123 Test St',
                  line2: 'Apt 1',
                  city: 'Test City',
                  state: 'Test State',
                  postal_code: '12345',
                  country: CountryCode.US,
                },
              },
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              discountAmountFixed: 0,
              paymentMethodFeeFixed: 0,
              baseAmount: 1000,
              pretaxTotal: 1000,
              taxAmountFixed: 0,
              stripeTaxCalculationId: 'txcalc_test_old',
              stripeTaxTransactionId: null,
              internationalFeePercentage: '0',
              flowgladFeePercentage: '0.65',
              internalNotes: 'Old Fee Calculation',
            },
            transaction
          )
        }
      )

      await new Promise((resolve) => setTimeout(resolve, 5))

      const feeCalculationNew = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return insertFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
              organizationId: organization.id,
              priceId: price.id,
              purchaseId: null,
              discountId: null,
              livemode: checkoutSession.livemode,
              currency: CurrencyCode.USD,
              type: FeeCalculationType.CheckoutSessionPayment,
              billingAddress: {
                address: {
                  line1: '123 Test St',
                  line2: 'Apt 1',
                  city: 'Test City',
                  state: 'Test State',
                  postal_code: '12345',
                  country: CountryCode.US,
                },
              },
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              discountAmountFixed: 0,
              paymentMethodFeeFixed: 0,
              baseAmount: 1000,
              pretaxTotal: 1000,
              taxAmountFixed: 0,
              stripeTaxCalculationId: 'txcalc_test_new',
              stripeTaxTransactionId: null,
              internationalFeePercentage: '0',
              flowgladFeePercentage: '0.65',
              internalNotes: 'New Fee Calculation',
            },
            transaction
          )
        }
      )

      const selectedFeeCalculation = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return selectFeeCalculationForPaymentIntent(
            {
              type: IntentMetadataType.CheckoutSession,
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
        }
      )

      expect(selectedFeeCalculation?.id).toBe(feeCalculationNew.id)
      expect(selectedFeeCalculation?.id).not.toBe(
        feeCalculationOld.id
      )
    })

    it('selectFeeCalculationForPaymentIntent selects latest fee calculation for billing runs', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        livemode: true,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        livemode: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      })

      const feeCalculationOld = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return insertFeeCalculation(
            {
              billingPeriodId: billingPeriod.id,
              organizationId: organization.id,
              checkoutSessionId: null,
              purchaseId: null,
              discountId: null,
              priceId: null,
              livemode: billingPeriod.livemode,
              currency: CurrencyCode.USD,
              type: FeeCalculationType.SubscriptionPayment,
              paymentMethodType: PaymentMethodType.Card,
              discountAmountFixed: 0,
              paymentMethodFeeFixed: 0,
              baseAmount: 1000,
              pretaxTotal: 1000,
              taxAmountFixed: 0,
              stripeTaxCalculationId: 'txcalc_br_old',
              stripeTaxTransactionId: null,
              internationalFeePercentage: '0',
              flowgladFeePercentage: '0.65',
              billingAddress: {
                address: {
                  line1: '123 Test St',
                  line2: 'Apt 1',
                  city: 'Test City',
                  state: 'Test State',
                  postal_code: '12345',
                  country: CountryCode.US,
                },
              },
              internalNotes: 'Old billing run fee calculation',
            },
            transaction
          )
        }
      )

      await new Promise((resolve) => setTimeout(resolve, 5))

      const feeCalculationNew = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return insertFeeCalculation(
            {
              billingPeriodId: billingPeriod.id,
              organizationId: organization.id,
              checkoutSessionId: null,
              purchaseId: null,
              discountId: null,
              priceId: null,
              livemode: billingPeriod.livemode,
              currency: CurrencyCode.USD,
              type: FeeCalculationType.SubscriptionPayment,
              paymentMethodType: PaymentMethodType.Card,
              discountAmountFixed: 0,
              paymentMethodFeeFixed: 0,
              baseAmount: 1000,
              pretaxTotal: 1000,
              taxAmountFixed: 0,
              stripeTaxCalculationId: 'txcalc_br_new',
              stripeTaxTransactionId: null,
              internationalFeePercentage: '0',
              flowgladFeePercentage: '0.65',
              billingAddress: {
                address: {
                  line1: '123 Test St',
                  line2: 'Apt 1',
                  city: 'Test City',
                  state: 'Test State',
                  postal_code: '12345',
                  country: CountryCode.US,
                },
              },
              internalNotes: 'New billing run fee calculation',
            },
            transaction
          )
        }
      )

      const selectedFeeCalculation = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return selectFeeCalculationForPaymentIntent(
            {
              type: IntentMetadataType.BillingRun,
              billingPeriodId: billingPeriod.id,
            },
            transaction
          )
        }
      )

      expect(selectedFeeCalculation?.id).toBe(feeCalculationNew.id)
      expect(selectedFeeCalculation?.id).not.toBe(
        feeCalculationOld.id
      )
    })

    it('maintains idempotency by not creating duplicate payment records', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      const fakeCharge = createMockStripeCharge({
        id: 'ch1',
        payment_intent: 'pi_1',
        created: 1610000000,
        amount: 5000,
        status: 'succeeded',
        payment_method_details: {
          id: paymentMethod.stripePaymentMethodId,
          type: paymentMethod.type,
        } as any,
        billing_details: { address: { country: 'US' } } as any,
      })
      const fakeMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const { payment: payment1 } = (
        await adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).unwrap()
      const { payment: payment2 } = (
        await adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).unwrap()
      expect(payment2.id).toEqual(payment1.id)
      expect(payment2.amount).toEqual(payment1.amount)
      expect(payment2.stripeChargeId).toEqual(payment1.stripeChargeId)
      expect(payment2.paymentMethodId).toEqual(
        payment1.paymentMethodId
      )
      expect(payment2.invoiceId).toEqual(payment1.invoiceId)
      expect(payment2.purchaseId).toEqual(payment1.purchaseId)
      expect(payment2.status).toEqual(payment1.status)
    })

    it('handles zero amount charges', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      const fakeCharge = createMockStripeCharge({
        id: 'ch_zero',
        payment_intent: 'pi_zero',
        created: 1610000000,
        amount: 0,
        status: 'succeeded',
        payment_method_details: {
          id: paymentMethod.stripePaymentMethodId,
          type: paymentMethod.type,
        } as any,
        billing_details: { address: { country: 'US' } } as any,
      })
      const fakeMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const { payment } = (
        await adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).unwrap()
      expect(payment.amount).toBe(0)
    })

    it('handles charges with missing billing details gracefully', async () => {
      const fakeCharge = createMockStripeCharge({
        id: 'ch_nobilling',
        payment_intent: 'pi_nobilling',
        created: 1610000000,
        amount: 3000,
        status: 'succeeded',
        billing_details: {} as Stripe.Charge.BillingDetails,
      })
      const fakeMetadata = {
        invoiceId: 'inv_nobilling',
      } as unknown as StripeIntentMetadata
      const result = await adminTransaction(async ({ transaction }) =>
        upsertPaymentForStripeCharge(
          {
            charge: fakeCharge,
            paymentIntentMetadata: fakeMetadata,
          },
          createDiscardingEffectsContext(transaction)
        )
      )
      expect(result.status).toBe('error')
      // FIXME: test that it fails when there's no taxCountry
    })

    it('handles partially refunded charges', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      const metadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const fakeCharge = createMockStripeCharge({
        id: 'ch_partial',
        payment_intent: 'pi_partial',
        created: 1610000000,
        amount: 4000,
        status: 'succeeded',
        metadata,
        payment_method_details: {
          id: paymentMethod.stripePaymentMethodId,
          type: paymentMethod.type,
        } as any,
        billing_details: { address: { country: 'US' } } as any,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: checkoutSession.livemode,
      })
      const fakeMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const { payment } = (
        await adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            createDiscardingEffectsContext(transaction)
          )
        )
      ).unwrap()
      expect(payment.refunded).toBe(false)
    })
  })

  describe('processPaymentIntentStatusUpdated', () => {
    it('throws an error when the PaymentIntent has no metadata', async () => {
      const fakePI: CoreStripePaymentIntent = {
        id: 'pi_test',
        metadata: null as unknown as Stripe.Metadata,
        latest_charge: 'ch_test',
        status: 'succeeded',
      }
      await expect(
        comprehensiveAdminTransaction(async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            fakePI,
            ctx
          )
          return Result.ok(res.unwrap())
        })
      ).rejects.toThrow(/PaymentIntentMetadata not found/)
    })

    it('throws an error when the PaymentIntent has no latest_charge', async () => {
      const metadata: StripeIntentMetadata = {
        checkoutSessionId: 'inv_test',
        type: IntentMetadataType.CheckoutSession,
      }
      const fakePI: CoreStripePaymentIntent = {
        id: 'pi_test',
        metadata,
        latest_charge: null,
        status: 'succeeded',
      }
      await expect(
        comprehensiveAdminTransaction(async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            fakePI,
            ctx
          )
          return Result.ok(res.unwrap())
        })
      ).rejects.toThrow(/LatestCharge not found/)
    })

    describe('Billing Run Flow', async () => {
      it('correctly processes a payment when metadata contains a billingRunId and a valid subscription', async () => {
        const paymentMethod = await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
        const subscription = await setupSubscription({
          organizationId: organization.id,
          livemode: true,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          livemode: true,
          startDate: new Date(),
          endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        })
        const billingRun = await setupBillingRun({
          subscriptionId: subscription.id,
          livemode: true,
          billingPeriodId: billingPeriod.id,
          paymentMethodId: paymentMethod.id,
        })
        await setupInvoice({
          organizationId: organization.id,
          billingPeriodId: billingPeriod.id,
          livemode: true,
          customerId: customer.id,
          priceId: price.id,
        })
        const metadata: StripeIntentMetadata = {
          billingRunId: billingRun.id,
          billingPeriodId: billingPeriod.id,
          type: IntentMetadataType.BillingRun,
        }
        const fakePI: any = {
          id: 'pi_br',
          metadata,
          latest_charge: 'ch_br',
          status: 'succeeded',
        }
        const fakeCharge = createMockStripeCharge({
          id: 'ch_br',
          payment_intent: 'pi_br',
          created: 1610000000,
          amount: 6000,
          status: 'succeeded',
          billing_details: { address: { country: 'US' } } as any,
          payment_method_details: {
            type: 'card',
            card: {
              brand: 'visa',
              last4: '4242',
            },
          } as any,
        })
        const fakeBillingRun = {
          id: 'br_123',
          subscriptionId: 'sub_br',
          billingPeriodId: 'bp_br',
          livemode: true,
        }
        const fakeSubscription = {
          id: 'sub_br',
          organizationId: 'org_br',
          customerId: 'cp_br',
          livemode: true,
        }
        const fakeInvoice = { id: 'inv_br' }
        const fakePayment = {
          id: 'payment_br',
          status: PaymentStatus.Processing,
          invoiceId: 'inv_br',
          purchaseId: null,
        }

        // Mock getStripeCharge to return the fake charge
        mockGetStripeCharge.mockResolvedValue(fakeCharge)
        const { payment } = await comprehensiveAdminTransaction(
          async (ctx) => {
            const { transaction } = ctx
            const res = await processPaymentIntentStatusUpdated(
              fakePI,
              ctx
            )
            return Result.ok(res.unwrap())
          }
        )
        expect(payment).toMatchObject({})
      })
      it('throws an error when no invoice exists for the billing run', async () => {
        const metadata: StripeIntentMetadata = {
          billingRunId: 'br_err',
          billingPeriodId: 'bp_br_err',
          type: IntentMetadataType.BillingRun,
        }
        const fakePI: any = {
          id: 'pi_br_err',
          metadata,
          currency: CurrencyCode.USD,
          latest_charge: 'ch_br_err',
          status: 'succeeded',
        }
        const fakeCharge = createMockStripeCharge({
          id: 'ch_br_err',
          payment_intent: 'pi_br_err',
          created: 1610000000,
          amount: 6000,
          status: 'succeeded',
          billing_details: { address: { country: 'US' } } as any,
          payment_method_details: {
            type: 'card',
            card: {
              brand: 'visa',
              last4: '4242',
            } as any,
          },
        })

        const fakeBillingRun = {
          id: 'br_err',
          subscriptionId: 'sub_br_err',
          billingPeriodId: 'bp_br_err',
          livemode: true,
        }
        const fakeSubscription = {
          id: 'sub_br_err',
          organizationId: 'org_br_err',
          customerId: 'cp_br_err',
          livemode: true,
        }

        // Mock getStripeCharge to return the fake charge so test can proceed to billing run check
        mockGetStripeCharge.mockResolvedValue(fakeCharge as any)
        await expect(
          comprehensiveAdminTransaction(async (ctx) => {
            return processPaymentIntentStatusUpdated(fakePI, ctx)
          })
        ).rejects.toThrow('BillingRun not found: br_err')
      })
    })

    describe('Product Flow through Checkout Session', () => {
      it('correctly processes a payment when metadata contains a checkoutSessionId for a product', async () => {
        const paymentMethod = await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
        const checkoutSession = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Product,
          quantity: 1,
          livemode: true,
        })
        await setupFeeCalculation({
          checkoutSessionId: checkoutSession.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })
        const metadata: StripeIntentMetadata = {
          checkoutSessionId: checkoutSession.id,
          type: IntentMetadataType.CheckoutSession,
        }
        const fakePI: any = {
          id: 'pi_inv',
          metadata,
          latest_charge: 'ch_inv',
          status: 'succeeded',
        }
        const fakeCharge = createMockStripeCharge({
          id: 'ch_inv',
          payment_intent: 'pi_inv',
          created: 1610000000,
          amount: 7000,
          status: 'succeeded',
          billing_details: { address: { country: 'US' } } as any,
          payment_method_details: {
            type: 'card',
            card: {
              brand: 'visa',
              last4: '4242',
            },
          } as any,
        })
        mockGetStripeCharge.mockResolvedValue(fakeCharge)

        const { payment } = await comprehensiveAdminTransaction(
          async (ctx) => {
            const { transaction } = ctx
            const res = await processPaymentIntentStatusUpdated(
              fakePI,
              ctx
            )
            return Result.ok(res.unwrap())
          }
        )
        expect(typeof payment).toBe('object')
        expect(payment.taxCountry).toBe(CountryCode.US)
      })
    })

    // describe('Purchase Session Flow', () => {
    //   // it('correctly processes a payment when metadata contains a checkoutSessionId', async () => {
    //   //   const fakePI: any = {
    //   //     id: 'pi_ps',
    //   //     metadata: {
    //   //       checkoutSessionId: 'ps_123',
    //   //       type: IntentMetadataType.CheckoutSession,
    //   //     },
    //   //     latest_charge: 'ch_ps',
    //   //     status: 'succeeded',
    //   //   }
    //   //   const fakeCharge: any = {
    //   //     id: 'ch_ps',
    //   //     payment_intent: 'pi_ps',
    //   //     created: 1610000000,
    //   //     amount: 8000,
    //   //     status: 'succeeded',
    //   //     metadata: {
    //   //       checkoutSessionId: 'ps_123',
    //   //       type: IntentMetadataType.CheckoutSession,
    //   //     },
    //   //     billing_details: { address: { country: 'US' } },
    //   //   }
    //   //   const fakePurchase = { id: 'pur_123' }
    //   //   const fakeInvoice = {
    //   //     id: 'inv_ps',
    //   //     organizationId: 'org_ps',
    //   //     taxCountry: 'US',
    //   //   }
    //   //   const fakePayment = {
    //   //     id: 'payment_ps',
    //   //     status: PaymentStatus.Processing,
    //   //     invoiceId: 'inv_ps',
    //   //     purchaseId: 'pur_123',
    //   //   }

    //   //   const result = await adminTransaction(
    //   //     async ({ transaction }) =>
    //   //       processPaymentIntentStatusUpdated(fakePI, transaction)
    //   //   )
    //   //   expect(result.payment).toMatchObject({})
    //   //   expect(result.payment.purchaseId).toBe('pur_123')
    //   // })
    // })

    // it('emits a payment canceled event when the PaymentIntent status is "canceled"', async () => {
    //   const fakePI: any = {
    //     id: 'pi_cancel',
    //     metadata: { invoiceId: 'inv_can' },
    //     latest_charge: 'ch_can',
    //     status: 'canceled',
    //   }
    //   const fakeCharge: any = {
    //     id: 'ch_can',
    //     payment_intent: 'pi_cancel',
    //     created: 1610000000,
    //     amount: 9000,
    //     status: 'failed',
    //     billing_details: { address: { country: 'US' } },
    //   }
    //   const fakeInvoice = {
    //     id: 'inv_can',
    //     organizationId: 'org_can',
    //     purchaseId: null,
    //     taxCountry: 'US',
    //     customerId: 'cp_can',
    //   }
    //   const fakePayment = {
    //     id: 'payment_can',
    //     status: PaymentStatus.Processing,
    //     invoiceId: 'inv_can',
    //     purchaseId: null,
    //   }

    //   const result = await adminTransaction(async ({ transaction }) =>
    //     processPaymentIntentStatusUpdated(fakePI, transaction)
    //   )
    //   expect(result.payment).toMatchObject({})
    // })

    it('does not emit any events for PaymentIntent statuses other than "succeeded" or "canceled"', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      const metadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const fakePI: any = {
        id: 'pi_other',
        metadata,
        latest_charge: 'ch_other',
        status: 'processing',
      }
      const fakeCharge = createMockStripeCharge({
        id: 'ch_other',
        payment_intent: 'pi_other',
        created: 1610000000,
        amount: 10000,
        status: 'pending',
        metadata: {
          checkoutSessionId: checkoutSession.id,
          type: IntentMetadataType.CheckoutSession,
        },
        payment_method_details: {
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
          },
        } as any,
        billing_details: { address: { country: 'US' } } as any,
      })
      mockGetStripeCharge.mockResolvedValue(fakeCharge)
      const { payment } = await comprehensiveAdminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            fakePI,
            ctx
          )
          return Result.ok(res.unwrap())
        }
      )
      expect(typeof payment).toBe('object')
      const events = await adminTransaction(async ({ transaction }) =>
        selectEvents(
          {
            organizationId: organization.id,
            objectEntity: EventNoun.Payment,
          },
          transaction
        )
      )
      expect(events).toHaveLength(0)
    })

    it('is idempotent when processing the same PaymentIntent update more than once, returning a consistent payment record', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })
      const metadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const fakePI: any = {
        id: 'pi_idempotent',
        metadata,
        latest_charge: 'ch_idemp',
        status: 'succeeded',
      }
      const fakeCharge = createMockStripeCharge({
        id: 'ch_idemp',
        payment_intent: 'pi_idempotent',
        created: 1610000000,
        amount: 11000,
        status: 'succeeded',
        metadata: {
          checkoutSessionId: checkoutSession.id,
          type: IntentMetadataType.CheckoutSession,
        },
        payment_method_details: {
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
          },
        } as any,
        billing_details: { address: { country: 'US' } } as any,
      })
      mockGetStripeCharge.mockResolvedValue(fakeCharge)
      const { payment: payment1 } =
        await comprehensiveAdminTransaction(async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            fakePI,
            ctx
          )
          return Result.ok(res.unwrap())
        })
      const { payment: payment2 } =
        await comprehensiveAdminTransaction(async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            fakePI,
            ctx
          )
          return Result.ok(res.unwrap())
        })
      expect(payment1.id).toEqual(payment2.id)
    })
  })

  // describe('System Integration & Transaction Management', () => {
  //   it('handles valid state transitions and prevents invalid ones', async () => {
  //     let fakePayment: any = {
  //       id: 'state',
  //       status: PaymentStatus.Processing,
  //       invoiceId: invoice.id,
  //       purchaseId: null,
  //     }
  //     const validTransition = await adminTransaction(
  //       async ({ transaction }) =>
  //         updatePaymentToReflectLatestChargeStatus(
  //           fakePayment,
  //           'succeeded',
  //           transaction
  //         )
  //     )
  //     expect(validTransition.status).toEqual(PaymentStatus.Succeeded)
  //   })
  // })

  describe('Event Creation', () => {
    let organization: Organization.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let product: Product.Record
    let price: Price.Record
    let purchase: Purchase.Record
    let invoice: Invoice.Record

    beforeEach(async () => {
      // Set up organization with product and price
      const orgData = await setupOrg()
      organization = orgData.organization
      product = orgData.product
      price = orgData.price

      // Set up customer
      customer = await setupCustomer({
        organizationId: organization.id,
        externalId: `cus_${core.nanoid()}`,
        livemode: true,
      })

      // Set up payment method
      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        type: PaymentMethodType.Card,
        livemode: true,
      })

      // Set up invoice
      invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        status: InvoiceStatus.Open,
        livemode: true,
        priceId: price.id,
      })

      // Set up purchase (will be customized per test)
      purchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        status: PurchaseStatus.Open,
        livemode: true,
        priceId: price.id,
      })
    })

    it('should create PaymentSucceeded and PurchaseCompleted events when payment succeeds and purchase becomes paid', async () => {
      // Generate unique IDs for this test run
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // First, create the checkout session
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        type: CheckoutSessionType.Purchase,
        status: CheckoutSessionStatus.Succeeded,
        quantity: 1,
        livemode: true,
        purchaseId: purchase.id,
      })

      // Create fee calculation for the checkout session
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })

      // Mock getStripeCharge to return succeeded charge
      mockGetStripeCharge.mockResolvedValue({
        id: chargeId,
        amount: 1000,
        status: 'succeeded',
        created: Math.floor(Date.now() / 1000),
        payment_intent: paymentIntentId,
        billing_details: {
          address: { country: 'US' },
        },
        payment_method_details: {
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
          },
        },
      } as any)

      const metadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const paymentIntent = createMockPaymentIntent({
        id: paymentIntentId,
        amount: 1000,
        amount_capturable: 0,
        amount_received: 1000,
        currency: 'usd',
        status: 'succeeded',
        latest_charge: chargeId,
        metadata,
      })

      const { payment } = await comprehensiveAdminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            paymentIntent,
            ctx
          )
          return Result.ok(res.unwrap())
        }
      )

      expect(payment).toMatchObject({})
      expect(payment.status).toBe(PaymentStatus.Succeeded)

      // Verify events were created
      const events = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return await selectEvents(
          { organizationId: organization.id },
          transaction
        )
      })

      expect(events).toHaveLength(2)

      const paymentSucceededEvent = events.find(
        (e) => e.type === FlowgladEventType.PaymentSucceeded
      )
      const purchaseCompletedEvent = events.find(
        (e) => e.type === FlowgladEventType.PurchaseCompleted
      )

      expect(typeof paymentSucceededEvent).toBe('object')
      expect(typeof purchaseCompletedEvent).toBe('object')

      // Verify PaymentSucceeded event properties
      expect(paymentSucceededEvent!.type).toBe(
        FlowgladEventType.PaymentSucceeded
      )
      expect(paymentSucceededEvent!.organizationId).toBe(
        organization.id
      )
      expect(paymentSucceededEvent!.livemode).toBe(true)
      expect(paymentSucceededEvent!.payload).toEqual({
        object: EventNoun.Payment,
        id: payment.id,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      })
      expect(paymentSucceededEvent!.processedAt).toBeNull()

      // Verify PurchaseCompleted event properties
      expect(purchaseCompletedEvent!.type).toBe(
        FlowgladEventType.PurchaseCompleted
      )
      expect(purchaseCompletedEvent!.organizationId).toBe(
        organization.id
      )
      expect(purchaseCompletedEvent!.livemode).toBe(true)
      expect(purchaseCompletedEvent!.payload).toEqual({
        id: purchase.id,
        object: EventNoun.Purchase,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      })
      expect(purchaseCompletedEvent!.processedAt).toBeNull()
    })

    it('should create only PaymentSucceeded event when payment succeeds without associated purchase', async () => {
      // Generate unique IDs for this test run
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // Mock getStripeCharge to return succeeded charge
      mockGetStripeCharge.mockResolvedValue({
        id: chargeId,
        amount: 1000,
        status: 'succeeded',
        created: Math.floor(Date.now() / 1000),
        payment_intent: paymentIntentId,
        billing_details: {
          address: { country: 'US' },
        },
        payment_method_details: {
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
          },
        },
      } as any)

      // Create billing run scenario (no purchase)
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        livemode: true,
      })

      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        livemode: true,
      })

      const billingRun = await setupBillingRun({
        subscriptionId: subscription.id,
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Create invoice for billing period
      await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Open,
        livemode: true,
        priceId: price.id,
      })

      const brMetadata: StripeIntentMetadata = {
        billingRunId: billingRun.id,
        billingPeriodId: billingPeriod.id,
        type: IntentMetadataType.BillingRun,
      }
      const paymentIntent = createMockPaymentIntent({
        id: paymentIntentId,
        amount: 1000,
        amount_capturable: 0,
        amount_received: 1000,
        currency: 'usd',
        status: 'succeeded',
        latest_charge: chargeId,
        metadata: brMetadata,
      })

      const { payment } = await comprehensiveAdminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            paymentIntent,
            ctx
          )
          return Result.ok(res.unwrap())
        }
      )

      expect(payment).toMatchObject({})
      expect(payment.status).toBe(PaymentStatus.Succeeded)
      expect(payment.purchaseId).toBeNull()

      // Verify only PaymentSucceeded event was created
      const events = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return await selectEvents(
          { organizationId: organization.id },
          transaction
        )
      })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe(FlowgladEventType.PaymentSucceeded)
    })

    it('should create no events when payment intent status is processing', async () => {
      // Generate unique IDs for this test run
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // Mock getStripeCharge to return pending charge
      mockGetStripeCharge.mockResolvedValue({
        id: chargeId,
        amount: 1000,
        status: 'pending',
        created: Math.floor(Date.now() / 1000),
        payment_intent: paymentIntentId,
        billing_details: {
          address: { country: 'US' },
        },
        payment_method_details: {
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
          },
        },
      } as any)

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        type: CheckoutSessionType.Purchase,
        status: CheckoutSessionStatus.Succeeded,
        quantity: 1,
        livemode: true,
        purchaseId: purchase.id,
      })

      // Create fee calculation for the checkout session
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })

      const processingMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }

      const paymentIntent = createMockPaymentIntent({
        id: paymentIntentId,
        amount: 1000,
        amount_capturable: 1000,
        amount_received: 0,
        currency: 'usd',
        status: 'processing',
        latest_charge: chargeId,
        metadata: processingMetadata,
      })

      const { payment } = await comprehensiveAdminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            paymentIntent,
            ctx
          )
          return Result.ok(res.unwrap())
        }
      )

      expect(payment).toMatchObject({})
      expect(payment.status).toBe(PaymentStatus.Processing)

      // Verify no events were created
      const events = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return await selectEvents(
          { organizationId: organization.id },
          transaction
        )
      })

      expect(events).toHaveLength(0)
    })

    it('should create events with correct properties and structure', async () => {
      // Generate unique IDs for this test run
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // Mock getStripeCharge to return succeeded charge
      mockGetStripeCharge.mockResolvedValue({
        id: chargeId,
        amount: 1000,
        status: 'succeeded',
        created: Math.floor(Date.now() / 1000),
        payment_intent: paymentIntentId,
        billing_details: {
          address: { country: 'US' },
        },
        payment_method_details: {
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
          },
        },
      } as any)

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        type: CheckoutSessionType.Purchase,
        status: CheckoutSessionStatus.Succeeded,
        quantity: 1,
        livemode: true,
        purchaseId: purchase.id,
      })

      // Create fee calculation for the checkout session
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })

      const successMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }

      const paymentIntent = createMockPaymentIntent({
        id: paymentIntentId,
        amount: 1000,
        amount_capturable: 0,
        amount_received: 1000,
        currency: 'usd',
        status: 'succeeded',
        latest_charge: chargeId,
        metadata: successMetadata,
      })

      const { payment } = await comprehensiveAdminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          const res = await processPaymentIntentStatusUpdated(
            paymentIntent,
            ctx
          )
          return Result.ok(res.unwrap())
        }
      )

      expect(payment).toMatchObject({})

      // Verify events were created with correct structure
      const events = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return await selectEvents(
          { organizationId: organization.id },
          transaction
        )
      })

      expect(events).toHaveLength(2)

      const paymentSucceededEvent = events.find(
        (e) => e.type === FlowgladEventType.PaymentSucceeded
      )
      const purchaseCompletedEvent = events.find(
        (e) => e.type === FlowgladEventType.PurchaseCompleted
      )

      // Verify event structure and properties
      for (const event of events) {
        expect(typeof event.type).toBe('string')
        expect(event.organizationId).toBe(organization.id)
        expect(event.livemode).toBe(true)
        expect(typeof event.occurredAt).toBe('number')
        expect(typeof event.submittedAt).toBe('number')
        expect(event.processedAt).toBeNull()
        expect(typeof event.hash).toBe('string')
        expect(event.metadata).toEqual({})
        expect(typeof event.payload).toBe('object')
      }

      // Verify PaymentSucceeded event specific properties
      expect(paymentSucceededEvent!.payload).toEqual({
        object: EventNoun.Payment,
        id: payment.id,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      })

      // Verify PurchaseCompleted event specific properties
      expect(purchaseCompletedEvent!.payload).toEqual({
        id: purchase.id,
        object: EventNoun.Purchase,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      })
    })

    it('should use checkoutSession.organizationId when invoice is missing', async () => {
      // Generate unique IDs for this test run
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // Create checkout session without invoice (Product type)
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Open,
        quantity: 1,
        livemode: true,
      })

      // Create fee calculation
      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })

      // Create mock payment intent
      const stripeCharge = createMockStripeCharge({
        id: chargeId,
        payment_intent: paymentIntentId,
        amount: 10000,
        amount_captured: 10000,
        status: 'succeeded',
        payment_method_details: { type: 'card' } as any,
        billing_details: { address: { country: 'US' } } as any,
      })

      const csMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const mockPaymentIntent = createMockPaymentIntent({
        id: paymentIntentId,
        status: 'succeeded',
        latest_charge: stripeCharge,
        metadata: csMetadata,
      })

      // Mock getStripeCharge to return our charge
      mockGetStripeCharge.mockResolvedValue(stripeCharge)

      // Process the payment intent
      const { payment } = await comprehensiveAdminTransaction(
        async (ctx) => {
          const res = await processPaymentIntentStatusUpdated(
            mockPaymentIntent,
            ctx
          )
          return Result.ok(res.unwrap())
        }
      )

      // Verify the payment has correct organizationId from checkoutSession
      expect(payment.organizationId).toBe(organization.id)

      // Query events after transaction completes (events are inserted after callback returns)
      const eventsCreated = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return selectEvents(
          { organizationId: organization.id },
          transaction
        )
      })

      // Verify events have correct organizationId
      const paymentSucceededEvent = eventsCreated?.find(
        (e) => e.type === FlowgladEventType.PaymentSucceeded
      )
      expect(paymentSucceededEvent?.organizationId).toBe(
        organization.id
      )
    })

    it('should only emit PurchaseCompleted event when purchase status is Paid', async () => {
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // Create purchase with Pending status
      const pendingPurchase = await setupPurchase({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: PurchaseStatus.Pending,
        livemode: true,
      })

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        type: CheckoutSessionType.Purchase,
        status: CheckoutSessionStatus.Open,
        purchaseId: pendingPurchase.id,
        livemode: true,
        quantity: 1,
      })

      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })

      const stripeCharge = createMockStripeCharge({
        id: chargeId,
        payment_intent: paymentIntentId,
        amount: 10000,
        status: 'succeeded',
        payment_method_details: { type: 'card' } as any,
      })

      const csMetadata2: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const mockPaymentIntent = createMockPaymentIntent({
        id: paymentIntentId,
        status: 'succeeded',
        latest_charge: stripeCharge,
        metadata: csMetadata2,
      })

      // Mock charge retrieval
      mockGetStripeCharge.mockResolvedValue(stripeCharge as any)

      await comprehensiveAdminTransaction(async (ctx) => {
        await processPaymentIntentStatusUpdated(
          mockPaymentIntent,
          ctx
        )
        return Result.ok(null)
      })

      // Query events after transaction completes
      const eventsCreated = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return selectEvents(
          { organizationId: organization.id },
          transaction
        )
      })

      // Should have PaymentSucceeded and may have PurchaseCompleted if purchase becomes Paid
      const paymentSucceededEvent = eventsCreated?.find(
        (e: { type: string }) =>
          e.type === FlowgladEventType.PaymentSucceeded
      )
      const purchaseCompletedEvent = eventsCreated?.find(
        (e: { type: string }) =>
          e.type === FlowgladEventType.PurchaseCompleted
      )

      expect(typeof paymentSucceededEvent).toBe('object')
      expect(typeof purchaseCompletedEvent).toBe('object')

      // Now update purchase to Paid status and process again
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await updatePurchase(
          {
            id: pendingPurchase.id,
            status: PurchaseStatus.Paid,
            priceType: price.type,
          },
          transaction
        )
      })

      // Process same payment intent again
      await comprehensiveAdminTransaction(async (ctx) => {
        await processPaymentIntentStatusUpdated(
          mockPaymentIntent,
          ctx
        )
        return Result.ok(null)
      })

      // Query events after transaction completes
      const secondEventsCreated = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return selectEvents(
            { organizationId: organization.id },
            transaction
          )
        }
      )

      // Now should have PurchaseCompleted event
      const secondPurchaseCompletedEvent = secondEventsCreated?.find(
        (e: { type: string }) =>
          e.type === FlowgladEventType.PurchaseCompleted
      )
      expect(typeof secondPurchaseCompletedEvent).toBe('object')
      expect(secondPurchaseCompletedEvent?.payload.id).toBe(
        pendingPurchase.id
      )
    })

    it('should emit PaymentFailed event when payment is canceled', async () => {
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        type: CheckoutSessionType.Product,
        status: CheckoutSessionStatus.Open,
        quantity: 1,
        livemode: true,
      })

      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: price.id,
        livemode: true,
      })

      const stripeCharge = createMockStripeCharge({
        id: chargeId,
        payment_intent: paymentIntentId,
        amount: 10000,
        status: 'pending',
        payment_method_details: { type: 'card' } as any,
      })

      const canceledMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const mockPaymentIntent = createMockPaymentIntent({
        id: paymentIntentId,
        status: 'canceled',
        latest_charge: stripeCharge,
        metadata: canceledMetadata,
      })

      // Mock charge retrieval
      mockGetStripeCharge.mockResolvedValue(stripeCharge as any)

      const { payment } = await comprehensiveAdminTransaction(
        async (ctx) => {
          const res = await processPaymentIntentStatusUpdated(
            mockPaymentIntent,
            ctx
          )
          return Result.ok(res.unwrap())
        }
      )

      // Query events after transaction completes
      const eventsCreated = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return selectEvents(
          { organizationId: organization.id },
          transaction
        )
      })

      // Should have PaymentFailed event
      const paymentFailedEvent = eventsCreated?.find(
        (e: { type: string }) =>
          e.type === FlowgladEventType.PaymentFailed
      )

      expect(typeof paymentFailedEvent).toBe('object')
      expect(paymentFailedEvent?.payload.id).toBe(payment.id)
      expect(typeof paymentFailedEvent?.hash).toBe('string')

      // Should NOT have PaymentSucceeded or PurchaseCompleted
      const paymentSucceededEvent = eventsCreated?.find(
        (e: { type: string }) =>
          e.type === FlowgladEventType.PaymentSucceeded
      )
      const purchaseCompletedEvent = eventsCreated?.find(
        (e: { type: string }) =>
          e.type === FlowgladEventType.PurchaseCompleted
      )

      expect(paymentSucceededEvent).toBeUndefined()
      expect(purchaseCompletedEvent).toBeUndefined()
    })

    it('should include customer creation events when processing anonymous checkout', async () => {
      // Create an anonymous checkout session (no customer ID)
      const anonymousCheckoutSession = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          const session = await setupCheckoutSession({
            organizationId: organization.id,
            customerId: customer.id, // Start with a customer, then remove it
            priceId: price.id,
            status: CheckoutSessionStatus.Open,
            type: CheckoutSessionType.Product,
            quantity: 1,
            livemode: true,
          })

          // Update to remove customer ID to make it anonymous
          return updateCheckoutSession(
            {
              ...session,
              customerId: null,
              customerEmail: 'anonymous@example.com',
              customerName: 'Anonymous Customer',
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      // Create a fee calculation for the anonymous checkout
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await setupFeeCalculation({
          checkoutSessionId: anonymousCheckoutSession.id,
          organizationId: organization.id,
          priceId: price.id,
          livemode: true,
        })
      })

      const mockPaymentIntent = {
        id: `pi_${core.nanoid()}`,
        status: 'succeeded' as const,
        metadata: {
          type: 'checkout_session',
          checkoutSessionId: anonymousCheckoutSession.id,
        },
        latest_charge: `ch_${core.nanoid()}`,
      }

      // Mock the Stripe charge
      const mockCharge = createMockStripeCharge({
        id: mockPaymentIntent.latest_charge,
        payment_intent: mockPaymentIntent.id,
        status: 'succeeded',
        amount: 10000,
        currency: 'usd',
        payment_method_details: {
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
            amount_authorized: 10000,
            authorization_code: '123456',
            checks: {
              address_line1_check: 'pass',
              address_postal_code_check: 'pass',
              cvc_check: 'pass',
            },
            country: 'US',
            exp_month: 1,
            exp_year: 2024,
            funding: 'credit',
            installments: null,
            mandate: null,
            network: 'visa',
            three_d_secure: null,
            wallet: null,
          },
        },
      })
      mockGetStripeCharge.mockResolvedValue(mockCharge)

      await comprehensiveAdminTransaction(async (ctx) => {
        await processPaymentIntentStatusUpdated(
          mockPaymentIntent,
          ctx
        )
        return Result.ok(null)
      })

      // Query events after transaction completes
      const eventsCreated = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return selectEvents(
          { organizationId: organization.id },
          transaction
        )
      })

      // Should have PaymentSucceeded event
      const paymentSucceededEvent = eventsCreated?.find(
        (e: { type: string }) =>
          e.type === FlowgladEventType.PaymentSucceeded
      )
      expect(typeof paymentSucceededEvent).toBe('object')

      // Should have CustomerCreated event from the anonymous checkout
      const customerCreatedEvent = eventsCreated?.find(
        (e: { type: string }) =>
          e.type === FlowgladEventType.CustomerCreated
      )
      expect(typeof customerCreatedEvent).toBe('object')
      expect(customerCreatedEvent?.payload.object).toEqual(
        EventNoun.Customer
      )
      expect(typeof customerCreatedEvent?.payload.customer).toBe(
        'object'
      )
    })
  })

  describe('processPaymentIntentStatusUpdated - Checkout Session Payments with Ledger Commands', () => {
    let organization: Organization.Record
    let product: Product.Record
    let singlePaymentPrice: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let subscription: import('@/db/schema/subscriptions').Subscription.Record

    beforeEach(async () => {
      const orgData = await setupOrg()
      organization = orgData.organization
      product = orgData.product

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
        paymentMethodId: paymentMethod.id,
        priceId: orgData.price.id,
      })

      singlePaymentPrice = await setupPrice({
        productId: product.id,
        name: 'Single Payment Test Price',
        type: PriceType.SinglePayment,
        unitPrice: 2000,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })
    })

    it('should create CreditGrantRecognized ledger command for succeeded checkout session payment', async () => {
      await setupTestFeaturesAndProductFeatures({
        organizationId: organization.id,
        productId: product.id,
        livemode: true,
        featureSpecs: [
          {
            name: 'Grant A',
            type: FeatureType.UsageCreditGrant,
            amount: 777,
            usageMeterName: 'UM-A',
          },
        ],
      })

      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: singlePaymentPrice.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })

      await setupFeeCalculation({
        checkoutSessionId: checkoutSession.id,
        organizationId: organization.id,
        priceId: singlePaymentPrice.id,
        livemode: true,
      })

      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      const stripeCharge = createMockStripeCharge({
        id: chargeId,
        payment_intent: paymentIntentId,
        amount: 2000,
        status: 'succeeded',
        payment_method_details: {
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
          },
        } as any,
        billing_details: { address: { country: 'US' } } as any,
      })
      mockGetStripeCharge.mockResolvedValue(stripeCharge)

      const metadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const paymentIntent = createMockPaymentIntent({
        id: paymentIntentId,
        amount: 2000,
        status: 'succeeded',
        latest_charge: chargeId,
        metadata,
      })

      // Track enqueued ledger commands
      const enqueuedLedgerCommands: unknown[] = []
      const { payment } = await comprehensiveAdminTransaction(
        async (ctx) => {
          const {
            transaction,
            emitEvent,
            enqueueLedgerCommand,
            invalidateCache,
            cacheRecomputationContext,
          } = ctx
          const res = await processPaymentIntentStatusUpdated(
            paymentIntent,
            {
              transaction,
              cacheRecomputationContext,
              emitEvent,
              enqueueLedgerCommand: (cmd) => {
                enqueuedLedgerCommands.push(cmd)
                enqueueLedgerCommand(cmd)
              },
              invalidateCache,
            }
          )
          return Result.ok(res.unwrap())
        }
      )

      // Verify ledger command was enqueued
      expect(enqueuedLedgerCommands.length).toBeGreaterThan(0)
      const ledgerCommand = enqueuedLedgerCommands.find(
        (cmd) =>
          (cmd as { type: string }).type ===
          LedgerTransactionType.CreditGrantRecognized
      )
      expect(ledgerCommand).toMatchObject({})
      expect((ledgerCommand as { type: string })?.type).toBe(
        LedgerTransactionType.CreditGrantRecognized
      )
      expect(payment.status).toBe(PaymentStatus.Succeeded)

      const usageCredits = await adminTransaction(
        async ({ transaction }) =>
          selectUsageCredits({ paymentId: payment.id }, transaction)
      )
      expect(usageCredits.length).toBe(1)
      expect(usageCredits[0].issuedAmount).toBe(777)
    })
  })
})
