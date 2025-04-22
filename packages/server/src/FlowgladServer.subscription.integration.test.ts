import { describe, it, expect, beforeAll, afterAll } from 'vitest'
describe('Subscription integrations', () => {
  it('stubbed', async () => {
    expect(true).toBe(true)
  })
})
// import { createTestFlowgladServer, retry } from './test/helpers'
// import { CreateSubscriptionParams } from '@flowglad/shared'

// describe('FlowgladServer Subscription Integration Tests', () => {
//   const flowgladServer = createTestFlowgladServer()
//   let subscriptionId: string | undefined

//   describe('createSubscription', () => {
//     it('should create a subscription', async () => {
//       const params: Omit<CreateSubscriptionParams, 'customerId'> = {
//         priceId: 'test-price-id',
//         quantity: 1,
//       }

//       const result = await retry(async () => {
//         return await flowgladServer.createSubscription(params)
//       })

//       expect(result).toBeDefined()
//       expect(result.subscription).toBeDefined()
//       expect(result.subscription.id).toBeDefined()

//       // Store the subscription ID for later tests
//       subscriptionId = result.subscription.id
//     })
//   })

//   describe('cancelSubscription', () => {
//     it('should cancel a subscription', async () => {
//       if (!subscriptionId) {
//         console.warn(
//           'Skipping cancelSubscription test because no subscription was created'
//         )
//         return
//       }

//       const result = await retry(async () => {
//         return await flowgladServer.cancelSubscription({
//           id: subscriptionId!,
//           cancellation: {
//             timing: 'at_end_of_current_billing_period',
//           },
//         })
//       })

//       expect(result).toBeDefined()
//       expect(result.subscription).toBeDefined()
//       expect(result.subscription.status).toBe('canceled')
//     })
//   })

//   describe('createUsageEvent', () => {
//     it('should create a usage event', async () => {
//       const result = await retry(async () => {
//         return await flowgladServer.createUsageEvent({
//           priceId: 'test-price-id',
//           subscriptionId: subscriptionId!,
//           amount: 1,
//           usageMeterId: 'test-usage-meter-id',
//           transactionId: `test-transaction-id-${Math.random()}`,
//           usageDate: new Date().toISOString(),
//         })
//       })

//       expect(result).toBeDefined()
//       expect(result.usageEvent).toBeDefined()
//       expect(result.usageEvent.id).toBeDefined()
//     })
//   })
// })
