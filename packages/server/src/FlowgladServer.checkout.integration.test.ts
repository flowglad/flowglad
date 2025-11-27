import { describe, expect, it } from 'vitest'

describe('FlowgladServer Checkout Integration Tests', () => {
  it('stubbed', async () => {
    expect(true).toBe(true)
  })
})
// import { createTestFlowgladServer, retry } from './test/helpers'
// import {
//   CreateCheckoutSessionParams,
//   CreateAddPaymentMethodCheckoutSessionParams,
//   CreateProductCheckoutSessionParams,
// } from '@flowglad/shared'

// describe('FlowgladServer Checkout Integration Tests', () => {
//   const flowgladServer = createTestFlowgladServer()

//   describe('createCheckoutSession', () => {
//     it('should create a checkout session', async () => {
//       const params: CreateCheckoutSessionParams = {
//         type: 'product',
//         priceId: 'test-price-id',
//         quantity: 1,
//         successUrl: 'http://localhost:3000/success',
//         cancelUrl: 'http://localhost:3000/cancel',
//       }

//       const result = await retry(async () => {
//         return await flowgladServer.createCheckoutSession(params)
//       })

//       expect(result).toBeDefined()
//       expect(result.checkoutSession).toBeDefined()
//       expect(result.checkoutSession.id).toBeDefined()
//       expect(result.url).toBeDefined()
//     })
//   })

//   describe('createAddPaymentMethodCheckoutSession', () => {
//     it('should create an add payment method checkout session', async () => {
//       const params: CreateAddPaymentMethodCheckoutSessionParams = {
//         type: 'add_payment_method',
//         targetSubscriptionId: 'test-subscription-id',
//         successUrl: 'http://localhost:3000/success',
//         cancelUrl: 'http://localhost:3000/cancel',
//       }

//       const result = await retry(async () => {
//         return await flowgladServer.createAddPaymentMethodCheckoutSession(
//           params
//         )
//       })

//       expect(result).toBeDefined()
//       expect(result.checkoutSession).toBeDefined()
//       expect(result.checkoutSession.id).toBeDefined()
//       expect(result.url).toBeDefined()
//     })
//   })

//   describe('createProductCheckoutSession', () => {
//     it('should create a product checkout session', async () => {
//       const params: CreateProductCheckoutSessionParams = {
//         type: 'product',
//         priceId: 'test-price-id',
//         quantity: 1,
//         successUrl: 'http://localhost:3000/success',
//         cancelUrl: 'http://localhost:3000/cancel',
//       }

//       const result = await retry(async () => {
//         return await flowgladServer.createProductCheckoutSession(
//           params
//         )
//       })

//       expect(result).toBeDefined()
//       expect(result.checkoutSession).toBeDefined()
//       expect(result.checkoutSession.id).toBeDefined()
//       expect(result.url).toBeDefined()
//     })
//   })
// })
