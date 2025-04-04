import { describe, it, expect, beforeEach } from 'vitest'
import {
  attemptToTransitionSubscriptionBillingPeriod,
  billingPeriodAndItemsInsertsFromSubscription,
  createBillingPeriodAndItems,
} from '@/subscriptions/billingPeriodHelpers'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  InvoiceStatus,
  PaymentStatus,
  SubscriptionStatus,
} from '@/types'
import {
  selectBillingPeriods,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  safelyUpdateSubscriptionStatus,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupBillingPeriodItems,
  setupPaymentMethod,
  setupSubscription,
  setupBillingRun,
  setupBillingPeriod,
} from '../../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { Customer } from '@/db/schema/customers'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'

describe('Subscription Billing Period Transition', async () => {
  const { organization, price } = await setupOrg()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let subscription: Subscription.Record
  beforeEach(async () => {
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
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      currentBillingPeriodEnd: new Date(Date.now() - 3000),
      currentBillingPeriodStart: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ),
    })
    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart,
      endDate: subscription.currentBillingPeriodEnd,
      status: BillingPeriodStatus.Active,
    })
    billingRun = await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
      status: BillingRunStatus.Scheduled,
    })
    await setupBillingPeriodItems({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: 100,
    })
  })

  // Test 1: When the current billing period is already terminal (e.g. Completed)…
  it('should create a new future billing period and billing run when current billing period is terminal and subscription is active', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Mark the current billing period as terminal (Completed)
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          status: BillingPeriodStatus.Completed,
        },
        transaction
      )
      // Call the transition function
      const { subscription: updatedSub, billingRun: newBillingRun } =
        await attemptToTransitionSubscriptionBillingPeriod(
          updatedBillingPeriod,
          transaction
        )

      // Expect that the subscription’s current billing period dates are updated (i.e. a new period was created)
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      // And because a valid payment method exists, a billing run should be created
      expect(newBillingRun).toBeDefined()
    })
  })

  // Test 2: Billing period endDate in the future should throw an error
  it('should throw an error if the billing period endDate is in the future', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Create a copy of billingPeriod with an endDate in the future
      const futureBillingPeriod = {
        ...billingPeriod,
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }
      await expect(
        attemptToTransitionSubscriptionBillingPeriod(
          futureBillingPeriod,
          transaction
        )
      ).rejects.toThrow(/Cannot close billing period/)
    })
  })

  // Test 3: When payment totals fully cover the billing period, mark it as Completed
  it('should mark the current billing period as Completed if fully paid', async () => {
    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      status: InvoiceStatus.Paid,
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
    })
    await setupPayment({
      billingPeriodId: billingPeriod.id,
      organizationId: organization.id,
      customerId: customer.id,
      stripeChargeId: `ch_123_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 100,
      invoiceId: invoice.id,
    })
    // Create a paid invoice for the billing period (simulate full payment)
    await adminTransaction(async ({ transaction }) => {
      // Set the billing period endDate in the past so closure logic runs
      const { subscription: updatedSub } =
        await attemptToTransitionSubscriptionBillingPeriod(
          billingPeriod,
          transaction
        )

      // Verify that the current (old) billing period is now Completed
      const allBPeriods = await selectBillingPeriods(
        { subscriptionId: subscription.id },
        transaction
      )
      const currentBp = allBPeriods.find(
        (bp) => bp.id === billingPeriod.id
      )
      expect(currentBp?.status).toBe(BillingPeriodStatus.Completed)

      // And a new billing period was created (its dates differ from the old one)
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        billingPeriod.startDate
      )
    })
  })

  // Test 4: If the subscription is in a terminal state, no future billing period should be created.
  it('should return early if the subscription is in a terminal state', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Mark subscription as terminal (Canceled)
      await safelyUpdateSubscriptionStatus(
        subscription,
        SubscriptionStatus.Canceled,
        transaction
      )
      const { subscription: updatedSub, billingRun: newBillingRun } =
        await attemptToTransitionSubscriptionBillingPeriod(
          billingPeriod,
          transaction
        )

      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.Canceled)
    })
  })

  //   // Test 5: If subscription.cancelScheduledAt is in the past, cancel the subscription.
  it('should cancel the subscription if cancelScheduledAt is in the past', async () => {
    await adminTransaction(async ({ transaction }) => {
      const pastDate = new Date(Date.now() - 1000)
      subscription.cancelScheduledAt = pastDate
      await updateSubscription(
        { id: subscription.id, cancelScheduledAt: pastDate },
        transaction
      )
      const updatedBillingPeriod = await updateBillingPeriod(
        { id: billingPeriod.id, endDate: pastDate },
        transaction
      )

      const { subscription: updatedSub, billingRun: newBillingRun } =
        await attemptToTransitionSubscriptionBillingPeriod(
          updatedBillingPeriod,
          transaction
        )

      expect(updatedSub.status).toBe(SubscriptionStatus.Canceled)
      expect(updatedSub.canceledAt).toBeDefined()
      expect(newBillingRun).toBeNull()
    })
  })

  // Test 6: Normal transition when subscription is active with a valid payment method.
  it('should create a new active billing period and billing run for active subscription with valid payment method', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Ensure the current billing period has already ended
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: new Date(Date.now() - 1000),
        },
        transaction
      )

      const { subscription: updatedSub, billingRun: newBillingRun } =
        await attemptToTransitionSubscriptionBillingPeriod(
          updatedBillingPeriod,
          transaction
        )

      // Verify that subscription billing period dates have been updated to new period values
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      expect(updatedSub.currentBillingPeriodEnd).toBeDefined()

      // And a billing run was created with scheduledFor equal to the new period’s start date
      expect(newBillingRun).toBeDefined()
      expect(newBillingRun?.scheduledFor.getTime()).toEqual(
        new Date(updatedSub.currentBillingPeriodStart).getTime()
      )
    })
  })

  // Test 7: Transition when no payment method is available.
  it('should create a new active billing period but set subscription to PastDue when no payment method exists', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Remove payment method(s) from subscription
      subscription.defaultPaymentMethodId = null
      subscription.backupPaymentMethodId = null
      await updateSubscription(
        {
          id: subscription.id,
          defaultPaymentMethodId: null,
          backupPaymentMethodId: null,
        },
        transaction
      )
      // Ensure current billing period endDate is in the past
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: new Date(Date.now() - 1000),
        },
        transaction
      )

      const { subscription: updatedSub, billingRun: newBillingRun } =
        await attemptToTransitionSubscriptionBillingPeriod(
          updatedBillingPeriod,
          transaction
        )

      // Expect no billing run is created and subscription status is updated to PastDue
      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.PastDue)
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        billingPeriod.startDate
      )
    })
  })

  // Test 8: No new future billing period should be created when subscription.cancelScheduledAt >= last billing period end.
  it('should not create a new billing period if subscription.cancelScheduledAt is set and >= current billing period end date', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Set subscription.cancelScheduledAt to just after the current billing period end
      const futureEnd = new Date(
        billingPeriod.endDate.getTime() + 50000
      )
      subscription.cancelScheduledAt = futureEnd
      await updateSubscription(
        { id: subscription.id, cancelScheduledAt: futureEnd },
        transaction
      )

      // Ensure current billing period is closed (endDate in past)
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: new Date(Date.now() - 1000),
        },
        transaction
      )
      const { subscription: updatedSub, billingRun: newBillingRun } =
        await attemptToTransitionSubscriptionBillingPeriod(
          updatedBillingPeriod,
          transaction
        )

      // Since attemptToCreateFutureBillingPeriodForSubscription returns null,
      // billingRun remains null and subscription status is set to PastDue.
      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.PastDue)
      // The subscription’s current billing period dates should remain unchanged.
      expect(updatedSub.currentBillingPeriodStart.getTime()).toEqual(
        subscription.currentBillingPeriodStart.getTime()
      )
      expect(updatedSub.currentBillingPeriodEnd.getTime()).toEqual(
        subscription.currentBillingPeriodEnd.getTime()
      )
    })
  })

  // Test 12: Edge-case when billing period payment totals exactly match billing item total.
  it('should mark the billing period as Completed when total due exactly equals total paid', async () => {
    // Simulate full payment by creating a paid invoice
    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      status: InvoiceStatus.Paid,
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
    })

    await setupPayment({
      billingPeriodId: billingPeriod.id,
      organizationId: organization.id,
      customerId: customer.id,
      stripeChargeId: `ch_123_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 100,
      invoiceId: invoice.id,
    })
    await adminTransaction(async ({ transaction }) => {
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: new Date(Date.now() - 1000),
        },
        transaction
      )
      const { subscription: updatedSub, updatedBillingPeriod: uBP } =
        await attemptToTransitionSubscriptionBillingPeriod(
          updatedBillingPeriod,
          transaction
        )
      const allBPeriods = await selectBillingPeriods(
        { subscriptionId: subscription.id },
        transaction
      )
      const currentBp = allBPeriods.find(
        (bp) => bp.id === billingPeriod.id
      )
      expect(currentBp?.status).toBe(BillingPeriodStatus.Completed)
    })
  })

  // Test 13: When required billing period data is missing (e.g. endDate), throw an error.
  it('should throw an error when billing period endDate is missing', async () => {
    await adminTransaction(async ({ transaction }) => {
      const invalidBillingPeriod = {
        ...billingPeriod,
        endDate: new Date('lol'),
      }
      await expect(
        attemptToTransitionSubscriptionBillingPeriod(
          invalidBillingPeriod,
          transaction
        )
      ).rejects.toThrow()
    })
  })

  it('should create a new future billing period and billing run when current billing period is terminal and subscription is active', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Mark the current billing period as terminal (Completed)
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          status: BillingPeriodStatus.Completed,
        },
        transaction
      )
      // Call the transition function
      const { subscription: updatedSub, billingRun: newBillingRun } =
        await attemptToTransitionSubscriptionBillingPeriod(
          updatedBillingPeriod,
          transaction
        )
      // Expect that the subscription’s current billing period dates are updated.
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      // And because a valid payment method exists, a billing run should be created.
      expect(newBillingRun).toBeDefined()
    })
  })

  // ... Other tests ...

  it('should throw an error when billing period endDate is missing', async () => {
    await adminTransaction(async ({ transaction }) => {
      const invalidBillingPeriod = {
        ...billingPeriod,
        endDate: new Date('lol'),
      }
      await expect(
        attemptToTransitionSubscriptionBillingPeriod(
          invalidBillingPeriod,
          transaction
        )
      ).rejects.toThrow()
    })
  })

  // New tests for handling trial period cases
  describe('Trial Billing Period Cases', () => {
    let dummySubscriptionItem: SubscriptionItem.Record

    beforeEach(() => {
      dummySubscriptionItem = {
        id: 'dummy1',
        quantity: 1,
        unitPrice: 50,
        metadata: {
          name: 'Test Item',
          description: 'Test Description',
        },
        livemode: subscription.livemode,
        subscriptionId: subscription.id,
        priceId: price.id,
        addedDate: new Date(),
        name: 'Test Item',
        createdAt: new Date(),
        updatedAt: new Date(),
        externalId: null,
      } as SubscriptionItem.Record
    })

    it('should generate trial billing period inserts with trialPeriod true and no billing period items', () => {
      const { billingPeriodInsert, billingPeriodItemInserts } =
        billingPeriodAndItemsInsertsFromSubscription({
          subscription,
          subscriptionItems: [dummySubscriptionItem],
          trialPeriod: true,
          isInitialBillingPeriod: true,
        })
      expect(billingPeriodInsert.trialPeriod).toBe(true)
      expect(billingPeriodItemInserts).toHaveLength(0)
    })

    it('should create a trial billing period in the database with no billing period items', async () => {
      await adminTransaction(async ({ transaction }) => {
        const { billingPeriod, billingPeriodItems } =
          await createBillingPeriodAndItems(
            {
              subscription,
              subscriptionItems: [dummySubscriptionItem],
              trialPeriod: true,
              isInitialBillingPeriod: true,
            },
            transaction
          )
        expect(billingPeriod.trialPeriod).toBe(true)
        expect(billingPeriodItems).toHaveLength(0)
      })
    })
  })
})
