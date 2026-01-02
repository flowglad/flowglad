// src/mocks/handlers.ts

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { nanoid } from 'nanoid'
import type Stripe from 'stripe'
import { PaymentMethodType } from '@/types'

const decodeStatusFromId = (
  id: string | readonly string[] | undefined
) => {
  if (typeof id === 'string' && id.includes('___')) {
    return id.split('___')[1]
  }
  return 'succeeded'
}

const paymentIntentStatusToChargeStatus = (
  status: string
): Stripe.Charge.Status => {
  switch (status) {
    case 'succeeded':
      return 'succeeded'
    case 'processing':
      return 'pending'
    case 'requires_confirmation':
      return 'pending'
    case 'requires_payment_method':
      return 'pending'
    case 'requires_capture':
      return 'pending'
    case 'requires_action':
      return 'pending'
    case 'canceled':
      return 'failed'
    default:
      return 'pending'
  }
}

export const stripeHandlers = [
  http.post(
    'https://api.stripe.com/v1/tax/transactions/create_from_calculation',
    async ({ request }) => {
      const body = await request.text()
      const params = new URLSearchParams(body)
      const calculation = params.get('calculation')
      const reference = params.get('reference')
      return HttpResponse.json({
        id: `tax_txn_${nanoid()}`,
        object: 'tax.transaction',
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        calculation,
        reference,
      })
    }
  ),
  http.post(
    'https://api.stripe.com:443/v1/tax/transactions/create_from_calculation',
    async ({ request }) => {
      const body = await request.text()
      const params = new URLSearchParams(body)
      const calculation = params.get('calculation')
      const reference = params.get('reference')
      return HttpResponse.json({
        id: `tax_txn_${nanoid()}`,
        object: 'tax.transaction',
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        calculation,
        reference,
      })
    }
  ),
  http.post('https://api.stripe.com/v1/payment_intents', (req) => {
    return HttpResponse.json({
      id: 'pi_mock123',
      amount: 1000,
      currency: 'usd',
      status: 'processing',
    })
  }),
  // Some HTTP clients include the explicit :443 port in the URL. Handle that too.
  http.post(
    'https://api.stripe.com:443/v1/payment_intents',
    (req) => {
      return HttpResponse.json({
        id: 'pi_mock123',
        amount: 1000,
        currency: 'usd',
        status: 'processing',
      })
    }
  ),
  // Stripe SDK updates PaymentIntents via POST /v1/payment_intents/:id
  http.post(
    'https://api.stripe.com/v1/payment_intents/:id',
    (req) => {
      const { id } = req.params
      return HttpResponse.json({
        id,
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
      })
    }
  ),
  // Port-explicit variant
  http.post(
    'https://api.stripe.com:443/v1/payment_intents/:id',
    (req) => {
      const { id } = req.params
      return HttpResponse.json({
        id,
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
      })
    }
  ),
  http.get('https://api.stripe.com/v1/payment_intents/:id', (req) => {
    // All request path params are provided in the "params"
    // argument of the response resolver.
    const { id } = req.params
    let status = 'succeeded'
    if (typeof id === 'string' && id.includes('___')) {
      status = id.split('___')[1]
    }
    const chargeStatus = paymentIntentStatusToChargeStatus(status)
    return HttpResponse.json({
      id,
      amount: 1000,
      currency: 'usd',
      status,
      latest_charge: `ch_${nanoid()}___${chargeStatus}`,
    })
  }),
  // Port-explicit variant
  http.get(
    'https://api.stripe.com:443/v1/payment_intents/:id',
    (req) => {
      const { id } = req.params
      let status = 'succeeded'
      if (typeof id === 'string' && id.includes('___')) {
        status = id.split('___')[1]
      }
      const chargeStatus = paymentIntentStatusToChargeStatus(status)
      return HttpResponse.json({
        id,
        amount: 1000,
        currency: 'usd',
        status,
        latest_charge: `ch_${nanoid()}___${chargeStatus}`,
      })
    }
  ),
  http.post(
    'https://api.stripe.com/v1/payment_intents/:id/confirm',
    (req) => {
      const { id } = req.params
      return HttpResponse.json({
        id,
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
        latest_charge: `ch_${nanoid()}___succeeded`,
      })
    }
  ),
  http.post(
    'https://api.stripe.com:443/v1/payment_intents/:id/confirm',
    (req) => {
      const { id } = req.params
      return HttpResponse.json({
        id,
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
        latest_charge: `ch_${nanoid()}___succeeded`,
      })
    }
  ),
  http.get('https://api.stripe.com/v1/charges/:id', (req) => {
    const { id } = req.params
    const status = decodeStatusFromId(id)
    return HttpResponse.json({
      id,
      amount: 1000,
      currency: 'usd',
      status,
      payment_intent: 'pi_mock123',
      created: Date.now() / 1000,
      payment_method_details: {
        id: `pm_${nanoid()}`,
        type: PaymentMethodType.Card,
      },
      billing_details: {
        name: 'John Doe',
        email: 'john.doe@example.com',
        address: {
          country: 'US',
        },
      },
    })
  }),
  // Port-explicit variant
  http.get('https://api.stripe.com:443/v1/charges/:id', (req) => {
    const { id } = req.params
    const status = decodeStatusFromId(id)
    return HttpResponse.json({
      id,
      amount: 1000,
      currency: 'usd',
      status,
      payment_intent: 'pi_mock123',
      created: Date.now() / 1000,
      payment_method_details: {
        id: `pm_${nanoid()}`,
        type: PaymentMethodType.Card,
      },
      billing_details: {
        name: 'John Doe',
        email: 'john.doe@example.com',
        address: {
          country: 'US',
        },
      },
    })
  }),
  http.get('https://api.stripe.com/v1/payment_methods/:id', (req) => {
    const { id } = req.params
    return HttpResponse.json({
      id,
      type: PaymentMethodType.Card,
      billing_details: {
        name: 'John Doe',
        email: 'john.doe@example.com',
        address: {
          line1: '123 Test St',
          line2: 'Apt 1',
          city: 'Test City',
          state: 'Test State',
          postal_code: '12345',
          country: 'US',
        },
      },
      card: {
        brand: 'visa',
        last4: '1234',
      },
    })
  }),
  // Port-explicit variant
  http.get(
    'https://api.stripe.com:443/v1/payment_methods/:id',
    (req) => {
      const { id } = req.params
      return HttpResponse.json({
        id,
        type: PaymentMethodType.Card,
        billing_details: {
          name: 'John Doe',
          email: 'john.doe@example.com',
          address: {
            line1: '123 Test St',
            line2: 'Apt 1',
            city: 'Test City',
            state: 'Test State',
            postal_code: '12345',
            country: 'US',
          },
        },
        card: {
          brand: 'visa',
          last4: '1234',
        },
      })
    }
  ),
  http.post(
    'https://api.stripe.com/v1/customers',
    async ({ request }) => {
      const customerId = `cus_${nanoid()}`
      const body = (await request.json()) as {
        email?: string
        name?: string
      }
      return HttpResponse.json({
        id: customerId,
        object: 'customer',
        email: body.email,
        name: body.name,
        livemode: false,
        created: Math.floor(Date.now() / 1000),
      })
    }
  ),
  // Port-explicit variant
  http.post(
    'https://api.stripe.com:443/v1/customers',
    async ({ request }) => {
      const customerId = `cus_${nanoid()}`
      const body = (await request.json()) as {
        email?: string
        name?: string
      }
      return HttpResponse.json({
        id: customerId,
        object: 'customer',
        email: body.email,
        name: body.name,
        livemode: false,
        created: Math.floor(Date.now() / 1000),
      })
    }
  ),
  http.get(
    'https://api.stripe.com/v1/customers/:id',
    ({ params }) => {
      const { id } = params
      // Simply return a mock customer object. The existence is what matters.
      return HttpResponse.json({
        id,
        object: 'customer',
        email: 'mock.customer@example.com',
        name: 'Mock Customer',
        livemode: false,
        created: Math.floor(Date.now() / 1000),
      })
    }
  ),
  // Port-explicit variant
  http.get(
    'https://api.stripe.com:443/v1/customers/:id',
    ({ params }) => {
      const { id } = params
      return HttpResponse.json({
        id,
        object: 'customer',
        email: 'mock.customer@example.com',
        name: 'Mock Customer',
        livemode: false,
        created: Math.floor(Date.now() / 1000),
      })
    }
  ),
  http.post(
    'https://api.stripe.com/v1/setup_intents',
    ({ request }) => {
      return HttpResponse.json({
        id: `seti_${nanoid()}`,
        object: 'setup_intent',
        status: 'succeeded',
        client_secret: 'seti_123_secret_456',
      })
    }
  ),
  // Port-explicit variant
  http.post(
    'https://api.stripe.com:443/v1/setup_intents',
    ({ request }) => {
      return HttpResponse.json({
        id: `seti_${nanoid()}`,
        object: 'setup_intent',
        status: 'succeeded',
        client_secret: 'seti_123_secret_456',
      })
    }
  ),
  http.get('https://api.stripe.com/v1/setup_intents/:id', (req) => {
    const { id } = req.params
    const status = decodeStatusFromId(id)
    return HttpResponse.json({
      id,
      status,
      object: 'setup_intent',
      customer: `cus_${nanoid()}`,
      payment_method: `pm_${nanoid()}`,
      metadata: {},
    })
  }),
  // Port-explicit variant
  http.get(
    'https://api.stripe.com:443/v1/setup_intents/:id',
    (req) => {
      const { id } = req.params
      const status = decodeStatusFromId(id)
      return HttpResponse.json({
        id,
        status,
        object: 'setup_intent',
        customer: `cus_${nanoid()}`,
        payment_method: `pm_${nanoid()}`,
        metadata: {},
      })
    }
  ),
]

export const stripeServer = setupServer(...stripeHandlers)

export const createStripePaymentIntentAndChargeId = (params: {
  paymentIntentStatus: Stripe.PaymentIntent.Status
}) => {
  const coreId = nanoid()
  const paymentIntentId = `pi_${coreId}__${params.paymentIntentStatus}`
  const chargeId = `ch_${coreId}__${paymentIntentStatusToChargeStatus(
    params.paymentIntentStatus
  )}`
  return {
    stripePaymentIntentId: paymentIntentId,
    stripeChargeId: chargeId,
  }
}
