import { describe, it, expect, beforeEach } from 'vitest'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  InvoiceStatus,
  PaymentStatus,
  PurchaseStatus,
  FlowgladEventType,
  EventNoun,
  PaymentMethodType,
  PriceType,
  IntervalUnit,
  FeatureType,
  LedgerTransactionType,
  UsageCreditStatus,
  UsageCreditSourceReferenceType,
} from '@/types'
import {
  chargeStatusToPaymentStatus,
  updatePaymentToReflectLatestChargeStatus,
  upsertPaymentForStripeCharge,
  processPaymentIntentStatusUpdated,
  ledgerCommandForPaymentSucceeded,
} from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { Payment } from '@/db/schema/payments'
import { Purchase } from '@/db/schema/purchases'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Organization } from '@/db/schema/organizations'
import {
  setupBillingPeriod,
  setupBillingRun,
  setupCustomer,
  setupFeeCalculation,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPurchase,
  setupSubscription,
  setupCheckoutSession,
  setupInvoice,
  setupPrice,
  setupTestFeaturesAndProductFeatures,
} from '@/../seedDatabase'
import { Customer } from '@/db/schema/customers'
import { Invoice } from '@/db/schema/invoices'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import {
  selectPurchaseById,
  updatePurchase,
} from '@/db/tableMethods/purchaseMethods'
import {
  safelyUpdateInvoiceStatus,
  selectInvoiceById,
} from '@/db/tableMethods/invoiceMethods'
import {
  IntentMetadataType,
  StripeIntentMetadata,
  getStripeCharge,
} from '../stripe'
import core from '../core'
import { vi } from 'vitest'
import Stripe from 'stripe'
import { selectEvents } from '@/db/tableMethods/eventMethods'
import {
  selectUsageCreditById,
  selectUsageCredits,
} from '@/db/tableMethods/usageCreditMethods'

// Mock helper functions
const createMockStripeCharge = (
  overrides: Partial<Stripe.Charge> = {}
): Stripe.Charge => {
  return {
    id: 'ch_test',
    object: 'charge',
    amount: 10000,
    amount_captured: 10000,
    amount_refunded: 0,
    application: null,
    application_fee: null,
    application_fee_amount: null,
    balance_transaction: 'txn_test',
    billing_details: {
      address: null,
      email: null,
      name: null,
      phone: null,
    },
    calculated_statement_descriptor: null,
    captured: true,
    created: 1234567890,
    currency: 'usd',
    customer: null,
    description: null,
    destination: null,
    dispute: null,
    disputed: false,
    failure_balance_transaction: null,
    failure_code: null,
    failure_message: null,
    fraud_details: null,
    invoice: null,
    livemode: false,
    metadata: {},
    on_behalf_of: null,
    outcome: null,
    paid: true,
    payment_intent: 'pi_test',
    payment_method: 'pm_test',
    payment_method_details: null,
    receipt_email: null,
    receipt_number: null,
    receipt_url: null,
    refunded: false,
    refunds: {
      object: 'list',
      data: [],
      has_more: false,
      url: '/v1/charges/ch_test/refunds',
    },
    review: null,
    shipping: null,
    source: null,
    source_transfer: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: 'succeeded',
    transfer_data: null,
    transfer_group: null,
    ...overrides,
  } as Stripe.Charge
}

const createMockPaymentIntent = (
  overrides: Partial<Stripe.PaymentIntent> = {}
): Stripe.PaymentIntent => {
  return {
    id: 'pi_test',
    object: 'payment_intent',
    amount: 10000,
    amount_capturable: 0,
    amount_details: {
      tip: {},
    },
    amount_received: 10000,
    application: null,
    application_fee_amount: null,
    automatic_payment_methods: null,
    canceled_at: null,
    cancellation_reason: null,
    capture_method: 'automatic',
    client_secret: 'pi_test_secret',
    confirmation_method: 'automatic',
    created: 1234567890,
    currency: 'usd',
    customer: null,
    description: null,
    invoice: null,
    last_payment_error: null,
    latest_charge: null,
    livemode: false,
    metadata: {},
    next_action: null,
    on_behalf_of: null,
    payment_method: null,
    payment_method_configuration_details: null,
    payment_method_options: null,
    payment_method_types: ['card'],
    processing: null,
    receipt_email: null,
    review: null,
    setup_future_usage: null,
    shipping: null,
    source: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: 'succeeded',
    transfer_data: null,
    transfer_group: null,
    ...overrides,
  } as Stripe.PaymentIntent
}

// Mock getStripeCharge
vi.mock('../stripe', async () => {
  const actual = await vi.importActual('../stripe')
  return {
    ...actual,
    getStripeCharge: vi.fn(),
  }
})

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
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      setupFeeAmount: 0,
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
    const result = await adminTransaction(async ({ transaction }) => {
      return ledgerCommandForPaymentSucceeded(
        { priceId: subscriptionPrice.id, payment },
        transaction
      )
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when product has no features', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
    })
    expect(result).toBeUndefined()
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
    const result = await adminTransaction(async ({ transaction }) => {
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
    })
    expect(result).toBeUndefined()
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
    const result = await adminTransaction(async ({ transaction }) => {
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment: altPayment },
        transaction
      )
    })
    expect(result).toBeUndefined()
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
    const command = await adminTransaction(
      async ({ transaction }) => {
        return ledgerCommandForPaymentSucceeded(
          { priceId: singlePaymentPrice.id, payment },
          transaction
        )
      }
    )
    expect(command).toBeDefined()
    expect(command!.type).toBe(
      LedgerTransactionType.CreditGrantRecognized
    )
    expect(command!.organizationId).toBe(organization.id)
    expect(command!.subscriptionId).toBe(subscription!.id)
    expect(command!.livemode).toBe(true)
    const usageCredit = command!.payload.usageCredit
    expect(usageCredit.issuedAmount).toBe(777)
    expect(usageCredit.usageMeterId).toBeDefined()
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
    const command = await adminTransaction(
      async ({ transaction }) => {
        return ledgerCommandForPaymentSucceeded(
          { priceId: singlePaymentPrice.id, payment },
          transaction
        )
      }
    )
    expect(command).toBeDefined()
    expect(command!.payload.usageCredit.issuedAmount).toBe(111)
  })

  it('fails when usage credit grant amount is zero', async () => {
    await setupTestFeaturesAndProductFeatures({
      organizationId: organization.id,
      productId: product.id,
      livemode: true,
      featureSpecs: [
        {
          name: 'Grant Zero',
          type: FeatureType.UsageCreditGrant,
          amount: 0,
          usageMeterName: 'UM-Z',
        },
      ],
    })
    await expect(
      adminTransaction(async ({ transaction }) => {
        return ledgerCommandForPaymentSucceeded(
          { priceId: singlePaymentPrice.id, payment },
          transaction
        )
      })
    ).rejects.toThrow('Value must be a positive integer')
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
    const command = await adminTransaction(
      async ({ transaction }) => {
        return ledgerCommandForPaymentSucceeded(
          { priceId: singlePaymentPrice.id, payment },
          transaction
        )
      }
    )
    expect(command).toBeDefined()
    // additionally re-select the usage credit to ensure it was persisted via the same transactional flow
    const reselected = await adminTransaction(
      async ({ transaction }) => {
        const id = command!.payload.usageCredit.id
        return selectUsageCreditById(id, transaction)
      }
    )
    expect(reselected).toBeDefined()
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
    await adminTransaction(async ({ transaction }) => {
      return ledgerCommandForPaymentSucceeded(
        { priceId: singlePaymentPrice.id, payment },
        transaction
      )
    })

    // Second call should no-op due to unique index and bulkInsertOrDoNothing
    const secondLedgerCommand = await adminTransaction(
      async ({ transaction }) => {
        return ledgerCommandForPaymentSucceeded(
          { priceId: singlePaymentPrice.id, payment },
          transaction
        )
      }
    )
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
 * TODO: many test cases in this file are commented out
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
        async ({ transaction }) => {
          return updatePaymentToReflectLatestChargeStatus(
            fakePayment,
            succeededCharge,
            transaction
          )
        }
      )
      expect(result.status).toEqual(PaymentStatus.Succeeded)
    })

    it('does not update the payment status if the current status already matches the charge status', async () => {
      fakePayment.status = PaymentStatus.Succeeded
      const result = await adminTransaction(async ({ transaction }) =>
        updatePaymentToReflectLatestChargeStatus(
          fakePayment,
          succeededCharge,
          transaction
        )
      )
      expect(result.status).toEqual(PaymentStatus.Succeeded)
    })

    it('updates the associated invoice status when an invoiceId exists', async () => {
      const updatedPayment = {
        ...fakePayment,
        status: PaymentStatus.Succeeded,
      }
      await adminTransaction(async ({ transaction }) => {
        await updatePaymentToReflectLatestChargeStatus(
          fakePayment,
          succeededCharge,
          transaction
        )
        const invoice = await selectInvoiceById(
          fakePayment.invoiceId,
          transaction
        )
        expect(invoice.status).toEqual(InvoiceStatus.Paid)
      })
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
      await adminTransaction(async ({ transaction }) => {
        await updatePaymentToReflectLatestChargeStatus(
          updatedPayment,
          succeededCharge,
          transaction
        )
        const updatedPurchase = await selectPurchaseById(
          purchase.id,
          transaction
        )
        expect(updatedPurchase.status).toEqual(PurchaseStatus.Paid)
      })
    })

    it('throws an error if there is no associated invoice', async () => {
      // @ts-expect-error - no invoice id
      fakePayment.invoiceId = null
      await expect(
        adminTransaction(async ({ transaction }) =>
          updatePaymentToReflectLatestChargeStatus(
            fakePayment,
            succeededCharge,
            transaction
          )
        )
      ).rejects.toThrow()
    })

    it('handles cases gracefully when there is no associated purchase', async () => {
      fakePayment.purchaseId = null
      const updatedPayment = {
        ...fakePayment,
        status: PaymentStatus.Succeeded,
      }
      await adminTransaction(async ({ transaction }) => {
        const result = await updatePaymentToReflectLatestChargeStatus(
          fakePayment,
          succeededCharge,
          transaction
        )
        expect(result.status).toEqual(PaymentStatus.Succeeded)
      })
    })

    it('maintains idempotency when called multiple times with the same charge status', async () => {
      fakePayment.status = PaymentStatus.Succeeded
      await adminTransaction(async ({ transaction }) => {
        const result1 =
          await updatePaymentToReflectLatestChargeStatus(
            fakePayment,
            succeededCharge,
            transaction
          )
        const result2 =
          await updatePaymentToReflectLatestChargeStatus(
            fakePayment,
            succeededCharge,
            transaction
          )
        expect(result1).toEqual(result2)
      })
    })

    it('updates the payment status to Failed when the charge status is failed', async () => {
      fakePayment.status = PaymentStatus.Processing
      await adminTransaction(async ({ transaction }) => {
        const result = await updatePaymentToReflectLatestChargeStatus(
          fakePayment,
          failedCharge,
          transaction
        )
        expect(result.status).toEqual(PaymentStatus.Failed)
      })
    })

    it('updates the failure message when the charge status is failed', async () => {
      fakePayment.status = PaymentStatus.Processing
      await adminTransaction(async ({ transaction }) => {
        const result = await updatePaymentToReflectLatestChargeStatus(
          fakePayment,
          failedCharge,
          transaction
        )
        expect(result.failureMessage).toEqual(
          failedCharge.failure_message
        )
      })
    })
  })

  describe('upsertPaymentForStripeCharge', () => {
    it('throws an error if the charge does not include a payment_intent', async () => {
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
        invoiceId: invoice.id,
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
      await expect(
        adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            transaction
          )
        )
      ).rejects.toThrow(/No payment intent id found/)
    })

    it('throws an error if payment intent metadata is missing', async () => {
      const fakeCharge = createMockStripeCharge({
        id: 'ch1',
        payment_intent: 'pi_1',
        created: 123456,
        status: 'succeeded',
        billing_details: { address: { country: 'US' } } as any,
      })
      await expect(
        adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: null as any,
            },
            transaction
          )
        )
      ).rejects.toThrow()
    })

    it('throws an error if metadata does not contain any of billingRunId or checkoutSessionId', async () => {
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
      const fakeMetadata: any = {}
      await expect(
        adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            transaction
          )
        )
      ).rejects.toThrow()
    })

    it('throws an error if the checkout session cannot be found', async () => {
      const fakeCharge = createMockStripeCharge({
        id: 'ch1',
        payment_intent: 'pi_1',
        created: 123456,
        status: 'succeeded',
        billing_details: { address: { country: 'US' } } as any,
      })
      const fakeMetadata: any = {
        checkoutSessionId: 'chckt_session_missing',
        type: IntentMetadataType.CheckoutSession,
      }
      await expect(
        adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            transaction
          )
        )
      ).rejects.toThrow()
    })

    it('correctly maps payment record fields in a valid invoice flow through checkout session', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
        invoiceId: invoice.id,
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
      const fakeInvoice = {
        id: 'inv_123',
        organizationId: 'org123',
        purchaseId: 'pur123',
        taxCountry: 'US',
        customerId: 'cp123',
      }

      const result = await adminTransaction(async ({ transaction }) =>
        upsertPaymentForStripeCharge(
          { charge: fakeCharge, paymentIntentMetadata: fakeMetadata },
          transaction
        )
      )
      expect(result.amount).toBe(5000)
      expect(result.stripeChargeId).toBe('ch1')
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
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
        invoiceId: invoice.id,
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
      const result1 = await adminTransaction(
        async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            transaction
          )
      )
      const result2 = await adminTransaction(
        async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            transaction
          )
      )
      expect(result2.id).toEqual(result1.id)
      expect(result2.amount).toEqual(result1.amount)
      expect(result2.stripeChargeId).toEqual(result1.stripeChargeId)
      expect(result2.paymentMethodId).toEqual(result1.paymentMethodId)
      expect(result2.invoiceId).toEqual(result1.invoiceId)
      expect(result2.purchaseId).toEqual(result1.purchaseId)
      expect(result2.status).toEqual(result1.status)
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
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
        invoiceId: invoice.id,
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
      const result = await adminTransaction(async ({ transaction }) =>
        upsertPaymentForStripeCharge(
          { charge: fakeCharge, paymentIntentMetadata: fakeMetadata },
          transaction
        )
      )
      expect(result.amount).toBe(0)
    })

    it('handles charges with missing billing details gracefully', async () => {
      const fakeCharge = createMockStripeCharge({
        id: 'ch_nobilling',
        payment_intent: 'pi_nobilling',
        created: 1610000000,
        amount: 3000,
        status: 'succeeded',
        billing_details: {} as any, // missing address
      })
      const fakeMetadata: any = { invoiceId: 'inv_nobilling' }
      await expect(
        adminTransaction(async ({ transaction }) =>
          upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            transaction
          )
        )
      ).rejects.toThrow()
      // TODO: test that it fails when there's no taxCountry
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
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
        invoiceId: invoice.id,
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
      const result = await adminTransaction(async ({ transaction }) =>
        upsertPaymentForStripeCharge(
          { charge: fakeCharge, paymentIntentMetadata: fakeMetadata },
          transaction
        )
      )
      expect(result.refunded).toBe(false)
    })
    it('marks the invoice as paid when the charge is successful and the invoice total is met', async () => {
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const checkoutSession = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
        invoiceId: invoice.id,
      })
      const metadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const fakeCharge = createMockStripeCharge({
        id: `ch_paid_${core.nanoid()}`,
        payment_intent: `pi_paid_${core.nanoid()}`,
        created: new Date().getTime() / 1000,
        amount: 5000,
        status: 'succeeded',
        metadata,
        payment_method_details: {
          id: paymentMethod.stripePaymentMethodId,
          type: paymentMethod.type,
        } as any,
      })
      const fakeMetadata: StripeIntentMetadata = {
        checkoutSessionId: checkoutSession.id,
        type: IntentMetadataType.CheckoutSession,
      }
      const updatedInvoice = await adminTransaction(
        async ({ transaction }) => {
          await upsertPaymentForStripeCharge(
            {
              charge: fakeCharge,
              paymentIntentMetadata: fakeMetadata,
            },
            transaction
          )
          return selectInvoiceById(invoice.id, transaction)
        }
      )
      expect(updatedInvoice.status).toBe(InvoiceStatus.Paid)
    })
  })

  describe('processPaymentIntentStatusUpdated', () => {
    it('throws an error when the PaymentIntent has no metadata', async () => {
      const fakePI: any = {
        id: 'pi_test',
        metadata: null,
        latest_charge: 'ch_test',
        status: 'succeeded',
      }
      await expect(
        adminTransaction(async ({ transaction }) =>
          processPaymentIntentStatusUpdated(fakePI, transaction)
        )
      ).rejects.toThrow(/No metadata found/)
    })

    it('throws an error when the PaymentIntent has no latest_charge', async () => {
      const metadata: StripeIntentMetadata = {
        checkoutSessionId: 'inv_test',
        type: IntentMetadataType.CheckoutSession,
      }
      const fakePI: any = {
        id: 'pi_test',
        metadata,
        latest_charge: null,
        status: 'succeeded',
      }
      await expect(
        adminTransaction(async ({ transaction }) =>
          processPaymentIntentStatusUpdated(fakePI, transaction)
        )
      ).rejects.toThrow(/No latest charge/)
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
          endDate: new Date(
            new Date().getTime() + 1000 * 60 * 60 * 24 * 30
          ),
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
        vi.mocked(getStripeCharge).mockResolvedValue(fakeCharge)
        const result = await adminTransaction(
          async ({ transaction }) =>
            processPaymentIntentStatusUpdated(fakePI, transaction)
        )
        expect(result.result.payment).toBeDefined()
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
        vi.mocked(getStripeCharge).mockResolvedValue(
          fakeCharge as any
        )
        await expect(
          adminTransaction(async ({ transaction }) =>
            processPaymentIntentStatusUpdated(fakePI, transaction)
          )
        ).rejects.toThrow('No billing runs found with id: br_err')
      })
    })

    describe('Invoice Flow through Checkout Session', () => {
      it('correctly processes a payment when metadata contains a checkoutSessionId for an invoice', async () => {
        const paymentMethod = await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
        const checkoutSession = await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Invoice,
          quantity: 1,
          livemode: true,
          invoiceId: invoice.id,
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
        vi.mocked(getStripeCharge).mockResolvedValue(fakeCharge)

        const {
          result: { payment },
        } = await adminTransaction(async ({ transaction }) =>
          processPaymentIntentStatusUpdated(fakePI, transaction)
        )
        expect(payment).toBeDefined()
        expect(payment.taxCountry).toBe('US')
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
    //   //   expect(result.payment).toBeDefined()
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
    //   expect(result.payment).toBeDefined()
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
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
        invoiceId: invoice.id,
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
      vi.mocked(getStripeCharge).mockResolvedValue(fakeCharge)
      const {
        result: { payment },
      } = await adminTransaction(async ({ transaction }) =>
        processPaymentIntentStatusUpdated(fakePI, transaction)
      )
      expect(payment).toBeDefined()
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
        type: CheckoutSessionType.Invoice,
        quantity: 1,
        livemode: true,
        invoiceId: invoice.id,
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
      vi.mocked(getStripeCharge).mockResolvedValue(fakeCharge)
      const {
        result: { payment: payment1 },
      } = await adminTransaction(async ({ transaction }) =>
        processPaymentIntentStatusUpdated(fakePI, transaction)
      )
      const {
        result: { payment: payment2 },
      } = await adminTransaction(async ({ transaction }) =>
        processPaymentIntentStatusUpdated(fakePI, transaction)
      )
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
      vi.mocked(getStripeCharge).mockResolvedValue({
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
      const paymentIntent: any = {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: 1000,
        amount_capturable: 0,
        amount_received: 1000,
        currency: 'usd',
        status: 'succeeded' as const,
        latest_charge: chargeId,
        metadata,
      }

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return await processPaymentIntentStatusUpdated(
            paymentIntent,
            transaction
          )
        }
      )

      expect(result.payment).toBeDefined()
      expect(result.payment.status).toBe(PaymentStatus.Succeeded)

      // Verify events were created
      const events = await adminTransaction(
        async ({ transaction }) => {
          return await selectEvents(
            { organizationId: organization.id },
            transaction
          )
        }
      )

      expect(events).toHaveLength(2)

      const paymentSucceededEvent = events.find(
        (e) => e.type === FlowgladEventType.PaymentSucceeded
      )
      const purchaseCompletedEvent = events.find(
        (e) => e.type === FlowgladEventType.PurchaseCompleted
      )

      expect(paymentSucceededEvent).toBeDefined()
      expect(purchaseCompletedEvent).toBeDefined()

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
        id: result.payment.id,
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
      })
      expect(purchaseCompletedEvent!.processedAt).toBeNull()
    })

    it('should create only PaymentSucceeded event when payment succeeds without associated purchase', async () => {
      // Generate unique IDs for this test run
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // Mock getStripeCharge to return succeeded charge
      vi.mocked(getStripeCharge).mockResolvedValue({
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
      const paymentIntent: any = {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: 1000,
        amount_capturable: 0,
        amount_received: 1000,
        currency: 'usd',
        status: 'succeeded' as const,
        latest_charge: chargeId,
        metadata: brMetadata,
      }

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return await processPaymentIntentStatusUpdated(
            paymentIntent,
            transaction
          )
        }
      )

      expect(result.payment).toBeDefined()
      expect(result.payment.status).toBe(PaymentStatus.Succeeded)
      expect(result.payment.purchaseId).toBeNull()

      // Verify only PaymentSucceeded event was created
      const events = await adminTransaction(
        async ({ transaction }) => {
          return await selectEvents(
            { organizationId: organization.id },
            transaction
          )
        }
      )

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe(FlowgladEventType.PaymentSucceeded)
    })

    it('should create no events when payment intent status is processing', async () => {
      // Generate unique IDs for this test run
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // Mock getStripeCharge to return pending charge
      vi.mocked(getStripeCharge).mockResolvedValue({
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
      const paymentIntent: any = {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: 1000,
        amount_capturable: 1000,
        amount_received: 0,
        currency: 'usd',
        status: 'processing' as const,
        latest_charge: chargeId,
        metadata: processingMetadata,
      }

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return await processPaymentIntentStatusUpdated(
            paymentIntent,
            transaction
          )
        }
      )

      expect(result.payment).toBeDefined()
      expect(result.payment.status).toBe(PaymentStatus.Processing)

      // Verify no events were created
      const events = await adminTransaction(
        async ({ transaction }) => {
          return await selectEvents(
            { organizationId: organization.id },
            transaction
          )
        }
      )

      expect(events).toHaveLength(0)
    })

    it('should create events with correct properties and structure', async () => {
      // Generate unique IDs for this test run
      const chargeId = `ch_test_${core.nanoid()}`
      const paymentIntentId = `pi_test_${core.nanoid()}`

      // Mock getStripeCharge to return succeeded charge
      vi.mocked(getStripeCharge).mockResolvedValue({
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
      const paymentIntent: any = {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: 1000,
        amount_capturable: 0,
        amount_received: 1000,
        currency: 'usd',
        status: 'succeeded' as const,
        latest_charge: chargeId,
        metadata: successMetadata,
      }

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return await processPaymentIntentStatusUpdated(
            paymentIntent,
            transaction
          )
        }
      )

      expect(result.payment).toBeDefined()

      // Verify events were created with correct structure
      const events = await adminTransaction(
        async ({ transaction }) => {
          return await selectEvents(
            { organizationId: organization.id },
            transaction
          )
        }
      )

      expect(events).toHaveLength(2)

      const paymentSucceededEvent = events.find(
        (e) => e.type === FlowgladEventType.PaymentSucceeded
      )
      const purchaseCompletedEvent = events.find(
        (e) => e.type === FlowgladEventType.PurchaseCompleted
      )

      // Verify event structure and properties
      for (const event of events) {
        expect(event.type).toBeDefined()
        expect(event.organizationId).toBe(organization.id)
        expect(event.livemode).toBe(true)
        expect(event.occurredAt).toBeInstanceOf(Date)
        expect(event.submittedAt).toBeInstanceOf(Date)
        expect(event.processedAt).toBeNull()
        expect(event.hash).toBeDefined()
        expect(event.metadata).toEqual({})
        expect(event.payload).toBeDefined()
      }

      // Verify PaymentSucceeded event specific properties
      expect(paymentSucceededEvent!.payload).toEqual({
        object: EventNoun.Payment,
        id: result.payment.id,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      })

      // Verify PurchaseCompleted event specific properties
      expect(purchaseCompletedEvent!.payload).toEqual({
        id: purchase.id,
        object: EventNoun.Purchase,
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
      vi.mocked(getStripeCharge).mockResolvedValue(stripeCharge)

      // Process the payment intent
      const { result, eventsToInsert } = await adminTransaction(
        async ({ transaction }) =>
          processPaymentIntentStatusUpdated(
            mockPaymentIntent,
            transaction
          )
      )

      // Verify the payment has correct organizationId from checkoutSession
      expect(result.payment.organizationId).toBe(organization.id)

      // Verify events have correct organizationId
      const paymentSucceededEvent = eventsToInsert?.find(
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
      vi.mocked(getStripeCharge).mockResolvedValue(
        stripeCharge as any
      )

      const { result, eventsToInsert } = await adminTransaction(
        async ({ transaction }) =>
          processPaymentIntentStatusUpdated(
            mockPaymentIntent,
            transaction
          )
      )

      // Should have PaymentSucceeded and may have PurchaseCompleted if purchase becomes Paid
      const paymentSucceededEvent = eventsToInsert?.find(
        (e) => e.type === FlowgladEventType.PaymentSucceeded
      )
      const purchaseCompletedEvent = eventsToInsert?.find(
        (e) => e.type === FlowgladEventType.PurchaseCompleted
      )

      expect(paymentSucceededEvent).toBeDefined()
      expect(purchaseCompletedEvent).toBeDefined()

      // Now update purchase to Paid status and process again
      await adminTransaction(async ({ transaction }) => {
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
      const { eventsToInsert: secondeventsToInsert } =
        await adminTransaction(async ({ transaction }) =>
          processPaymentIntentStatusUpdated(
            mockPaymentIntent,
            transaction
          )
        )

      // Now should have PurchaseCompleted event
      const secondPurchaseCompletedEvent = secondeventsToInsert?.find(
        (e) => e.type === FlowgladEventType.PurchaseCompleted
      )
      expect(secondPurchaseCompletedEvent).toBeDefined()
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
      vi.mocked(getStripeCharge).mockResolvedValue(
        stripeCharge as any
      )

      const { result, eventsToInsert } = await adminTransaction(
        async ({ transaction }) =>
          processPaymentIntentStatusUpdated(
            mockPaymentIntent,
            transaction
          )
      )

      // Should have PaymentFailed event
      const paymentFailedEvent = eventsToInsert?.find(
        (e) => e.type === FlowgladEventType.PaymentFailed
      )

      expect(paymentFailedEvent).toBeDefined()
      expect(paymentFailedEvent?.payload.id).toBe(result.payment.id)
      expect(paymentFailedEvent?.hash).toBeDefined()

      // Should NOT have PaymentSucceeded or PurchaseCompleted
      const paymentSucceededEvent = eventsToInsert?.find(
        (e) => e.type === FlowgladEventType.PaymentSucceeded
      )
      const purchaseCompletedEvent = eventsToInsert?.find(
        (e) => e.type === FlowgladEventType.PurchaseCompleted
      )

      expect(paymentSucceededEvent).toBeUndefined()
      expect(purchaseCompletedEvent).toBeUndefined()
    })
  })
})
