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
  FeatureFlag,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'

describe('Simple Subscriptions Router Test', () => {
  test('should throw error when immediate adjustment is called without feature flag', async () => {
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
      organization: orgData.organization,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    } as any

    const caller = subscriptionsRouter.createCaller(ctx)

    // Expect the adjust call to throw an error about feature flag
    await expect(
      caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [],
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: false,
        },
      })
    ).rejects.toThrow()

    // More specific assertion - check the error message
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
      expect.fail('Expected error to be thrown')
    } catch (error) {
      // The error from adjustSubscription gets wrapped by tRPC
      expect(error).toBeDefined()
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      expect(errorMessage).toContain(
        'Immediate adjustments are in private preview'
      )
    }
  }, 30000) // 30 second timeout

  test('should call adjust endpoint successfully with feature flag enabled', async () => {
    // Minimal setup
    const orgData = await setupOrg()

    // Enable feature flag for immediate adjustments
    let updatedOrg = orgData.organization
    await adminTransaction(async ({ transaction }) => {
      updatedOrg = await updateOrganization(
        {
          id: orgData.organization.id,
          featureFlags: {
            [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
          },
        },
        transaction
      )
    })

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

    const billingPeriod = await setupBillingPeriod({
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

    // Create context and caller with updated organization
    const ctx = {
      organizationId: updatedOrg.id,
      organization: updatedOrg,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true as any,
      path: '',
    } as any

    const caller = subscriptionsRouter.createCaller(ctx)

    // Make the API call with minimal adjustment
    const result = await caller.adjust({
      id: subscription.id,
      adjustment: {
        newSubscriptionItems: [],
        timing: SubscriptionAdjustmentTiming.Immediately,
        prorateCurrentBillingPeriod: false,
      },
    })

    // Basic verification
    expect(result).toHaveProperty('subscription')
    expect(result).toHaveProperty('subscriptionItems')
    expect(result.subscription.id).toBe(subscription.id)
  }, 30000) // 30 second timeout
})
