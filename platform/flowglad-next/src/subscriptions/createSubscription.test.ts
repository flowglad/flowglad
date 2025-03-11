import { describe, it, expect } from 'vitest'
import { adminTransaction } from '@/db/databaseMethods'
import {
  setupOrg,
  setupCustomerProfile,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupBillingPeriod,
  setupBillingPeriodItems,
} from '../../seedDatabase'
import { createSubscriptionWorkflow } from './createSubscription'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  IntervalUnit,
  PaymentMethodType,
  SubscriptionStatus,
} from '@/types'
import {
  insertSubscription,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { core } from '@/utils/core'

describe('createSubscription', async () => {
  const { organization, product, variant } = await setupOrg()
  const customerProfile = await setupCustomerProfile({
    OrganizationId: organization.id,
  })
  const paymentMethod = await setupPaymentMethod({
    OrganizationId: organization.id,
    CustomerProfileId: customerProfile.id,
  })
  const {
    subscription,
    subscriptionItems,
    billingPeriod,
    billingRun,
  } = await adminTransaction(async ({ transaction }) => {
    const stripeSetupIntentId = `setupintent_${core.nanoid()}`
    return createSubscriptionWorkflow(
      {
        organization,
        product,
        variant,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        defaultPaymentMethod: paymentMethod,
        customerProfile,
        stripeSetupIntentId,
      },
      transaction
    )
  })

  it('creates a subscription with correct priced items, and billing run', async () => {
    expect(subscription).toBeDefined()
    expect(
      subscriptionItems[0].unitPrice * subscriptionItems[0].quantity
    ).toBe(variant.unitPrice * 1)
    expect(billingPeriod.status).toBe(BillingPeriodStatus.Active)
    expect(billingRun.status).toBe(BillingRunStatus.Scheduled)
  })
  it('throws an error if the customer profile already has an active subscription', async () => {
    await adminTransaction(async ({ transaction }) => {
      await updateSubscription(
        {
          id: subscription.id,
          status: SubscriptionStatus.Active,
        },
        transaction
      )
    })
    const stripeSetupIntentId = `setupintent_${core.nanoid()}`
    await expect(
      adminTransaction(async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            variant,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: paymentMethod,
            customerProfile,
            stripeSetupIntentId,
          },
          transaction
        )
      })
    ).rejects.toThrow()
  })
  it('does not throw an error if creating a subscription for a customer with no active subscriptions, but past non-active subscriptions', async () => {
    const newCustomerProfile = await setupCustomerProfile({
      OrganizationId: organization.id,
    })
    const newPaymentMethod = await setupPaymentMethod({
      OrganizationId: organization.id,
      CustomerProfileId: newCustomerProfile.id,
    })
    // Create a past subscription that is now cancelled
    await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_${core.nanoid()}`
      const sub = await createSubscriptionWorkflow(
        {
          organization,
          product,
          variant,
          quantity: 1,
          livemode: true,
          startDate: new Date('2023-01-01'),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: newPaymentMethod,
          customerProfile: newCustomerProfile,
          stripeSetupIntentId,
        },
        transaction
      )

      await updateSubscription(
        {
          id: sub.subscription.id,
          status: SubscriptionStatus.Canceled,
          canceledAt: new Date('2023-02-01'),
        },
        transaction
      )

      return sub
    })

    // Should be able to create a new subscription since the past one is cancelled
    await expect(
      adminTransaction(async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            variant,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: newPaymentMethod,
            customerProfile: newCustomerProfile,
            stripeSetupIntentId: 'test-intent-id',
          },
          transaction
        )
      })
    ).resolves.toBeDefined()
  })
  it('creates billing periods correctly for trial subscriptions', async () => {
    const { organization, product, variant } = await setupOrg()
    const newCustomerProfile = await setupCustomerProfile({
      OrganizationId: organization.id,
    })
    const newPaymentMethod = await setupPaymentMethod({
      OrganizationId: organization.id,
      CustomerProfileId: newCustomerProfile.id,
    })

    const startDate = new Date()
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const { subscription, billingPeriod } = await adminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            variant,
            quantity: 1,
            livemode: true,
            startDate,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: newPaymentMethod,
            customerProfile: newCustomerProfile,
            trialEnd,
            stripeSetupIntentId,
          },
          transaction
        )
      }
    )

    // Verify subscription details
    expect(subscription.trialEnd?.getTime()).toBe(trialEnd.getTime())

    // Verify billing period was created
    expect(billingPeriod).toBeDefined()
    expect(billingPeriod.startDate.getTime()).toBe(
      startDate.getTime()
    )
    expect(billingPeriod.endDate.getTime()).toBe(trialEnd.getTime())

    // Verify no billing period items exist for trial period
    await adminTransaction(async ({ transaction }) => {
      const billingPeriodItems = await selectBillingPeriodItems(
        {
          BillingPeriodId: billingPeriod.id,
        },
        transaction
      )
      expect(billingPeriodItems).toHaveLength(0)
    })
  })
  it("doesn't recreate subscriptions, billing periods, or billing period items for the same setup intent", async () => {
    const startDate = new Date()
    const newCustomerProfile = await setupCustomerProfile({
      OrganizationId: organization.id,
    })
    const newPaymentMethod = await setupPaymentMethod({
      OrganizationId: organization.id,
      CustomerProfileId: newCustomerProfile.id,
    })
    // Create initial subscription
    const firstSubscription = await setupSubscription({
      OrganizationId: organization.id,
      CustomerProfileId: newCustomerProfile.id,
      PaymentMethodId: newPaymentMethod.id,
      VariantId: variant.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: SubscriptionStatus.Incomplete,
    })
    await setupSubscriptionItem({
      SubscriptionId: firstSubscription.id,
      name: 'Test Item',
      quantity: 1,
      unitPrice: variant.unitPrice,
    })
    const billingPeriod = await setupBillingPeriod({
      SubscriptionId: firstSubscription.id,
      startDate,
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    await setupBillingPeriodItems({
      BillingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: variant.unitPrice,
    })
    // Attempt to create subscription with same setup intent
    const secondResult = await adminTransaction(
      async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            variant,
            quantity: 1,
            livemode: true,
            startDate,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: newPaymentMethod,
            customerProfile: newCustomerProfile,
            stripeSetupIntentId:
              firstSubscription.stripeSetupIntentId!,
          },
          transaction
        )
      }
    )

    // Verify same subscription and billing period returned
    expect(secondResult.subscription.id).toBe(firstSubscription.id)
  })
})
