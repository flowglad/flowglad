import type Stripe from 'stripe'
import core from '@/utils/core'

/**
 * Common mock functions for Stripe objects used across tests
 * This avoids re-implementing the same mock functions in multiple test files
 */

export const createMockPaymentIntentResponse = (
  overrides: Partial<Stripe.PaymentIntent> = {}
): Stripe.Response<Stripe.PaymentIntent> => {
  const id = `pi_test_${core.nanoid()}`
  return {
    id,
    client_secret: `pi_secret_${id}`,
    status: 'requires_confirmation',
    amount: 1000,
    currency: 'usd',
    customer: `cus_${core.nanoid()}`,
    payment_method: `pm_${core.nanoid()}`,
    metadata: {
      billingRunId: `br_${core.nanoid()}`,
      type: 'BillingRun',
      billingPeriodId: `bp_${core.nanoid()}`,
    },
    object: 'payment_intent',
    // Stripe responds with timestamp in seconds
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    lastResponse: {
      headers: {},
      requestId: 'req_test_123',
      statusCode: 200,
    },
    ...overrides,
  } as Stripe.Response<Stripe.PaymentIntent>
}

export const createMockPaymentIntent = (
  overrides: Partial<Stripe.PaymentIntent> = {}
): Stripe.PaymentIntent => {
  const id = `pi_test_${core.nanoid()}`
  return {
    id,
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
    client_secret: `pi_secret_${id}`,
    confirmation_method: 'automatic',
    created: Math.floor(Date.now() / 1000),
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

export const createMockConfirmationResult = (
  paymentIntentId: string,
  overrides: Partial<Stripe.PaymentIntent> = {}
): Stripe.Response<Stripe.PaymentIntent> =>
  ({
    id: paymentIntentId,
    status: 'succeeded',
    latest_charge: {
      id: `ch_test_${core.nanoid()}`,
      object: 'charge',
      amount: 1000,
      currency: 'usd',
      status: 'succeeded',
    } as Stripe.Charge,
    object: 'payment_intent',
    // Stripe responds with timestamp in seconds
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    lastResponse: {
      headers: {},
      requestId: 'req_test_123',
      statusCode: 200,
    },
    ...overrides,
  }) as Stripe.Response<Stripe.PaymentIntent>

export const createMockStripeCharge = (
  overrides: Partial<Stripe.Charge> = {}
): Stripe.Charge => {
  return {
    id: `ch_test_${core.nanoid()}`,
    object: 'charge',
    amount: 10000,
    amount_captured: 10000,
    amount_refunded: 0,
    application: null,
    application_fee: null,
    application_fee_amount: null,
    balance_transaction: `txn_test_${core.nanoid()}`,
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
    payment_intent: `pi_test_${core.nanoid()}`,
    payment_method: `pm_test_${core.nanoid()}`,
    payment_method_details: null,
    receipt_email: null,
    receipt_number: null,
    receipt_url: null,
    refunded: false,
    refunds: {
      object: 'list',
      data: [],
      has_more: false,
      url: `/v1/charges/ch_test_${core.nanoid()}/refunds`,
    },
    review: null,
    shipping: null,
    source: null,
    source_transfer: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: 'succeeded',
    transfer_data: null,
    ...overrides,
  } as Stripe.Charge
}

export const createMockCustomer = (
  overrides: Partial<Stripe.Customer> = {}
): Stripe.Response<Stripe.Customer> => {
  const id = `cus_test_${core.nanoid()}`
  return {
    id,
    object: 'customer',
    balance: 0,
    created: Date.now(),
    default_source: null,
    delinquent: false,
    description: null,
    email: 'test@example.com',
    invoice_prefix: null,
    livemode: false,
    metadata: {},
    name: 'Test Customer',
    phone: null,
    preferred_locales: [],
    shipping: null,
    tax_exempt: 'none',
    test_clock: null,
    lastResponse: {
      headers: {},
      requestId: 'req_test_123',
      statusCode: 200,
    },
    invoice_settings: {
      default_payment_method: null,
      footer: null,
      rendering_options: null,
      custom_fields: [],
    },
    ...overrides,
  } as Stripe.Response<Stripe.Customer>
}

// Mock for a stripe payment intent which is basically just a wrapper
// of a typical payment intent response with extra attributes
export const createMockPaymentIntentEventResponse = (
  status:
    | 'succeeded'
    | 'requires_payment_method'
    | 'canceled'
    | 'processing'
    | 'requires_action',
  paymentIntentOverrides: Partial<Stripe.PaymentIntent> = {},
  eventOverrides: Partial<{
    created: number
    livemode: boolean
    pending_webhooks: number
    request: { id: string | null; idempotency_key: string | null }
    data: { previous_attributes: Record<string, any> }
  }> = {}
):
  | Stripe.PaymentIntentSucceededEvent
  | Stripe.PaymentIntentPaymentFailedEvent
  | Stripe.PaymentIntentCanceledEvent
  | Stripe.PaymentIntentProcessingEvent
  | Stripe.PaymentIntentRequiresActionEvent => {
  // Map status to event type
  let eventType: string
  switch (status) {
    case 'succeeded':
      eventType = 'payment_intent.succeeded'
      break
    case 'requires_payment_method':
      eventType = 'payment_intent.payment_failed'
      break
    case 'canceled':
      eventType = 'payment_intent.canceled'
      break
    case 'processing':
      eventType = 'payment_intent.processing'
      break
    case 'requires_action':
      eventType = 'payment_intent.requires_action'
      break
    default:
      eventType = 'payment_intent.requires_action'
  }

  const paymentIntent = createMockPaymentIntent({
    status,
    ...paymentIntentOverrides,
  })

  const event = {
    created: eventOverrides.created ?? Math.floor(Date.now() / 1000),
    type: eventType,
    data: {
      object: paymentIntent,
      previous_attributes:
        eventOverrides.data?.previous_attributes ?? {},
    },
    livemode: eventOverrides.livemode ?? false,
    pending_webhooks: eventOverrides.pending_webhooks ?? 0,
    request: eventOverrides.request ?? {
      id: null,
      idempotency_key: null,
    },
  }

  if (status === 'succeeded') {
    return event as Stripe.PaymentIntentSucceededEvent
  } else if (status === 'requires_payment_method') {
    return event as Stripe.PaymentIntentPaymentFailedEvent
  } else if (status === 'canceled') {
    return event as Stripe.PaymentIntentCanceledEvent
  } else if (status === 'processing') {
    return event as Stripe.PaymentIntentProcessingEvent
  } else {
    return event as Stripe.PaymentIntentRequiresActionEvent
  }
}
