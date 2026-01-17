import { describe, expect, it } from 'bun:test'
import type Stripe from 'stripe'
import { PaymentMethodType } from '@/types'
import { paymentMethodInsertFromStripeCardPaymentMethod } from './paymentMethodHelpers'

describe('paymentMethodInsertFromStripeCardPaymentMethod', () => {
  it('should correctly transform Stripe payment method to insert', () => {
    const mockStripePaymentMethod: Stripe.PaymentMethod = {
      id: 'pm_1Qp9kURasdfasfasfda6tcYh',
      object: 'payment_method',
      allow_redisplay: 'unspecified',
      billing_details: {
        address: {
          city: 'New York City',
          country: 'US',
          line1: '___ ____ ____',
          line2: null,
          postal_code: '00000',
          state: 'NY',
        },
        email: 'test@example.com',
        name: 'Test User',
        phone: null,
      },
      card: {
        brand: 'visa',
        checks: {
          address_line1_check: 'pass',
          address_postal_code_check: 'pass',
          cvc_check: 'pass',
        },
        country: 'US',
        display_brand: 'visa',
        exp_month: 2,
        exp_year: 2029,
        fingerprint: 'BLKJALFKJSLGJSF',
        funding: 'credit',
        generated_from: null,
        last4: '4242',
        networks: {
          available: ['visa'],
          preferred: null,
        },
        three_d_secure_usage: {
          supported: true,
        },
        wallet: null,
      },
      created: 1738766322,
      customer: 'cus_BLKJSLKJGB',
      livemode: false,
      metadata: {},
      type: 'card',
    }
    const params = {
      livemode: false,
      customerId: 'cust_123',
    }
    const result = paymentMethodInsertFromStripeCardPaymentMethod(
      mockStripePaymentMethod,
      params
    )
    expect(result.type).toEqual(PaymentMethodType.Card)
    expect(result.livemode).toEqual(params.livemode)
    expect(result.customerId).toEqual(params.customerId)
    expect(result.billingDetails).toEqual({
      name: 'Test User',
      email: 'test@example.com',
      address: {
        city: 'New York City',
        country: 'US',
        line1: '___ ____ ____',
        line2: null,
        postal_code: '00000',
        state: 'NY',
      },
    })
    // should not have nested address
    expect(result.billingDetails.address.address).toBeUndefined()
  })
})
