import { describe, test, expect } from 'vitest'
import {
  setupOrg,
  setupUserAndApiKey,
  setupUserAndCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupBillingPeriod,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { subscriptionsRouter } from './subscriptionsRouter'
import {
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
  BillingPeriodStatus,
} from '@/types'
import { TRPCError } from '@trpc/server'

describe('Subscriptions Router - Adjust Endpoint', () => {
  test('should throw NOT_IMPLEMENTED error when adjust is called', async () => {
    // Minimal setup
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })

    const userData = await setupUserAndCustomer({
      organizationId: orgData.organization.id,
      livemode: true,
    })

    const paymentMethod = await setupPaymentMethod({
      organizationId: orgData.organization.id,
      customerId: userData.customer.id,
      livemode: true,
    })

    const subscription = await setupSubscription({
      organizationId: orgData.organization.id,
      customerId: userData.customer.id,
      priceId: orgData.price.id,
      paymentMethodId: paymentMethod.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart:
        Date.now() - 15 * 24 * 60 * 60 * 1000,
      currentBillingPeriodEnd: Date.now() + 15 * 24 * 60 * 60 * 1000,
      renews: true,
      livemode: true,
    })

    await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart || new Date(),
      endDate:
        subscription.currentBillingPeriodEnd ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: BillingPeriodStatus.Active,
      livemode: true,
    })

    await setupSubscriptionItem({
      subscriptionId: subscription.id,
      priceId: orgData.price.id,
      name: 'Basic Plan',
      quantity: 1,
      unitPrice: 999,
      addedDate: subscription.currentBillingPeriodStart || Date.now(),
      type: SubscriptionItemType.Static,
    })

    // Create context and caller
    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    } as any

    const caller = subscriptionsRouter.createCaller(ctx)

    // Expect the adjust call to throw a TRPCError with NOT_IMPLEMENTED code
    await expect(
      caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [],
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: false,
        },
      })
    ).rejects.toThrow(TRPCError)

    // More specific assertion - check the error code
    try {
      await caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [],
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: false,
        },
      })
      // If we get here, the test should fail
      expect.fail('Expected TRPCError to be thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      if (error instanceof TRPCError) {
        expect(error.code).toBe('NOT_IMPLEMENTED')
        expect(error.message).toContain('under development')
      }
    }
  }, 30000) // 30 second timeout
})

// TODO: uncomment after adjust route is finished:
// import { describe, test, expect, beforeEach } from 'vitest'
// import {
//   setupOrg,
//   setupUserAndApiKey,
//   setupUserAndCustomer,
//   setupPaymentMethod,
//   setupSubscription,
//   setupBillingPeriod,
//   setupSubscriptionItem,
// } from '@/../seedDatabase'
// import { subscriptionsRouter } from './subscriptionsRouter'
// import {
//   SubscriptionAdjustmentTiming,
//   SubscriptionItemType,
//   SubscriptionStatus,
//   BillingPeriodStatus,
// } from '@/types'

// describe('Simple Subscriptions Router Test', () => {
//   test('should call adjust endpoint successfully', async () => {
//     // Minimal setup
//     const orgData = await setupOrg()
//     const { apiKey } = await setupUserAndApiKey({
//       organizationId: orgData.organization.id,
//       livemode: true,
//     })

//     const userData = await setupUserAndCustomer({
//       organizationId: orgData.organization.id,
//       livemode: true,
//     })

//     const paymentMethod = await setupPaymentMethod({
//       organizationId: orgData.organization.id,
//       customerId: userData.customer.id,
//       livemode: true,
//     })

//     const subscription = await setupSubscription({
//       organizationId: orgData.organization.id,
//       customerId: userData.customer.id,
//       priceId: orgData.price.id,
//       paymentMethodId: paymentMethod.id,
//       status: SubscriptionStatus.Active,
//       currentBillingPeriodStart:
//         Date.now() - 15 * 24 * 60 * 60 * 1000,
//       currentBillingPeriodEnd: Date.now() + 15 * 24 * 60 * 60 * 1000,
//       renews: true,
//       livemode: true,
//     })

//     const billingPeriod = await setupBillingPeriod({
//       subscriptionId: subscription.id,
//       startDate: subscription.currentBillingPeriodStart || new Date(),
//       endDate:
//         subscription.currentBillingPeriodEnd ||
//         new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
//       status: BillingPeriodStatus.Active,
//       livemode: true,
//     })

//     await setupSubscriptionItem({
//       subscriptionId: subscription.id,
//       priceId: orgData.price.id,
//       name: 'Basic Plan',
//       quantity: 1,
//       unitPrice: 999,
//       addedDate: subscription.currentBillingPeriodStart || Date.now(),
//       type: SubscriptionItemType.Static,
//     })

//     // Create context and caller
//     const ctx = {
//       organizationId: orgData.organization.id,
//       apiKey: apiKey.token!,
//       livemode: true,
//       environment: 'live' as const,
//       isApi: true as any,
//       path: '',
//     } as any

//     const caller = subscriptionsRouter.createCaller(ctx)

//     // Make the API call with minimal adjustment
//     const result = await caller.adjust({
//       id: subscription.id,
//       adjustment: {
//         newSubscriptionItems: [],
//         timing: SubscriptionAdjustmentTiming.Immediately,
//         prorateCurrentBillingPeriod: false,
//       },
//     })

//     // Basic verification
//     expect(result).toHaveProperty('subscription')
//     expect(result).toHaveProperty('subscriptionItems')
//     expect(result.subscription.id).toBe(subscription.id)
//   }, 30000) // 30 second timeout
// })
