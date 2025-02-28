// src/mocks/handlers.ts
import { PaymentMethodType } from '@/types'
import core from '@/utils/core'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import Stripe from 'stripe'

const decodeStatusFromId = (
  id: string | readonly string[] | undefined
) => {
  if (typeof id === 'string' && id.includes('___')) {
    return id.split('___')[1]
  }
  return 'succeeded'
}

export const stripeHandlers = [
  http.post('https://api.stripe.com/v1/payment_intents', (req) => {
    return HttpResponse.json({
      id: 'pi_mock123',
      amount: 1000,
      currency: 'usd',
      status: 'processing',
    })
  }),
  http.get('https://api.stripe.com/v1/payment_intents/:id', (req) => {
    // All request path params are provided in the "params"
    // argument of the response resolver.
    const { id } = req.params
    let status = 'succeeded'
    if (typeof id === 'string' && id.includes('___')) {
      status = id.split('___')[1]
    }
    return HttpResponse.json({
      id,
      amount: 1000,
      currency: 'usd',
      status,
    })
  }),
  http.get('https://api.stripe.com/v1/charges/:id', (req) => {
    const { id } = req.params
    const status = decodeStatusFromId(id)
    return HttpResponse.json({
      id,
      amount: 1000,
      currency: 'usd',
      status,
      payment_intent: 'pi_mock123',
      created: new Date().getTime() / 1000,
      payment_method_details: {
        id: `pm_${core.nanoid()}`,
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
]

export const stripeServer = setupServer(...stripeHandlers)

const paymentIntentStatusToChargeStatus = (
  status: Stripe.PaymentIntent.Status
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
      throw new Error(`Unknown payment intent status: ${status}`)
  }
}

export const createStripePaymentIntentAndChargeId = (params: {
  paymentIntentStatus: Stripe.PaymentIntent.Status
}) => {
  const coreId = core.nanoid()
  const paymentIntentId = `pi_${coreId}__${params.paymentIntentStatus}`
  const chargeId = `ch_${coreId}__${paymentIntentStatusToChargeStatus(
    params.paymentIntentStatus
  )}`
  return {
    stripePaymentIntentId: paymentIntentId,
    stripeChargeId: chargeId,
  }
}
