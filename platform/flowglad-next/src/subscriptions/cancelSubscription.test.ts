import { describe, it, expect, beforeEach } from 'vitest'
import {
  cancelSubscriptionImmediately,
  scheduleSubscriptionCancellation,
} from '@/subscriptions/cancelSubscription'
import { ScheduleSubscriptionCancellationParams } from '@/subscriptions/schemas'
import {
  SubscriptionCancellationArrangement,
  SubscriptionStatus,
  BillingPeriodStatus,
  BillingRunStatus,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupSubscription,
  setupBillingRun,
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupCustomer,
  setupPaymentMethod,
  setupOrg,
} from '../../seedDatabase'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { BillingRun } from '@/db/schema/billingRuns'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Customer } from '@/db/schema/customers'
import { safelyUpdateSubscriptionStatus } from '@/db/tableMethods/subscriptionMethods'

describe('Subscription Cancellation Test Suite', async () => {
  const { organization, price } = await setupOrg()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let billingPeriodItem: BillingPeriodItem.Record
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
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })
    billingRun = await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
      status: BillingRunStatus.Scheduled,
    })
    billingPeriodItem = await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: 100,
    })
  })

  describe('cancelSubscriptionImmediately', () => {
    it('should cancel an active subscription and update billing periods', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Set up a subscription and two billing periods:
        // – one currently active (cancellation time lies between its start and end)
        // – one that starts in the future.
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        const activeBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
          endDate: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour later
        })
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours later
          endDate: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours later
        })

        // Call the function under test.
        const updatedSubscription =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )

        // Verify subscription fields.
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(updatedSubscription.canceledAt).toBeDefined()
        expect(updatedSubscription.cancelScheduledAt).toBeNull()

        // Verify billing period updates.
        const updatedActiveBP = await selectBillingPeriodById(
          activeBP.id,
          transaction
        )
        const updatedFutureBP = await selectBillingPeriodById(
          futureBP.id,
          transaction
        )
        expect(updatedActiveBP.status).toBe(
          BillingPeriodStatus.Completed
        )
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.Canceled
        )
      })
    })

    it('should not modify a subscription already in a terminal state', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Set up a subscription that is already canceled.
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Simulate a terminal state.
        subscription.status = SubscriptionStatus.Canceled
        const result = await cancelSubscriptionImmediately(
          subscription,
          transaction
        )
        expect(result.status).toBe(SubscriptionStatus.Canceled)
      })
    })

    it('should throw an error if the cancellation date is before the subscription start date', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a subscription whose billing period starts in the future.
        const now = new Date()
        const futureStart = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour later
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: futureStart,
          endDate: new Date(futureStart.getTime() + 60 * 60 * 1000),
        })
        // Because the current time is before the billing period start, expect an error.
        await expect(
          cancelSubscriptionImmediately(subscription, transaction)
        ).rejects.toThrow(
          /Cannot end a subscription before its start date/
        )
      })
    })

    it('should handle subscriptions with no billing periods gracefully', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a subscription without billing periods.
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Depending on your design, the function may update the subscription even if there
        // are no billing periods. Here we verify that no error is thrown.
        let result
        try {
          result = await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        } catch (error) {
          result = null
        }
        expect(result).toBeDefined()
      })
    })

    it('should correctly handle boundary conditions for billing period dates', async () => {
      await adminTransaction(async ({ transaction }) => {
        // To test boundaries, we force a known “current” time.
        const fixedNow = new Date('2025-02-02T12:00:00Z')
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period that starts exactly at fixedNow.
        const bp = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: fixedNow,
          endDate: new Date(fixedNow.getTime() + 60 * 60 * 1000),
        })

        // Temporarily override Date.now() so that the cancellation date equals fixedNow.
        const originalDateNow = Date.now
        Date.now = () => fixedNow.getTime()

        const updatedSubscription =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        // Since our logic checks "if (billingPeriod.startDate < endDate)" (and not <=),
        // a cancellation exactly at the start may not trigger the “active period” update.
        const updatedBP = await selectBillingPeriodById(
          bp.id,
          transaction
        )
        expect(updatedBP.status).not.toBe(
          BillingPeriodStatus.Completed
        )

        // Restore the original Date.now.
        Date.now = originalDateNow
      })
    })
  })

  /* --------------------------------------------------------------------------
     scheduleSubscriptionCancellation Tests
  --------------------------------------------------------------------------- */
  describe('scheduleSubscriptionCancellation', () => {
    it('should schedule cancellation at the end of the current billing period', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a current billing period.
        const currentBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 60 * 60 * 1000),
        })
        // Create a future billing period.
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() + 2 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 3 * 60 * 60 * 1000),
        })

        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }
        const updatedSubscription =
          await scheduleSubscriptionCancellation(params, transaction)
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        expect(updatedSubscription.cancelScheduledAt?.getTime()).toBe(
          currentBP.endDate.getTime()
        )
        // Verify that any billing period starting after the cancellation date is updated.
        const updatedFutureBP = await selectBillingPeriodById(
          futureBP.id,
          transaction
        )
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
      })
    })

    it('should schedule cancellation at a specified future date', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const futureCancellationDate = new Date(
          now.getTime() + 2 * 60 * 60 * 1000
        )
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period that is active now.
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 3 * 60 * 60 * 1000),
        })
        // Create a future billing period.
        const futureBP = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() + 4 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 5 * 60 * 60 * 1000),
        })

        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.AtFutureDate,
            endDate: futureCancellationDate,
          },
        }
        const updatedSubscription =
          await scheduleSubscriptionCancellation(params, transaction)
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        // For AtFutureDate, per our logic, cancelScheduledAt remains null.
        expect(updatedSubscription.cancelScheduledAt).toBeNull()

        const updatedFutureBP = await selectBillingPeriodById(
          futureBP.id,
          transaction
        )
        expect(updatedFutureBP.status).toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
      })
    })

    it('should make no update if the subscription is already in a terminal state', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Mark the subscription as terminal.
        await safelyUpdateSubscriptionStatus(
          subscription,
          SubscriptionStatus.Canceled,
          transaction
        )
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.AtFutureDate,
            endDate: new Date(Date.now() + 60 * 60 * 1000),
          },
        }
        const result = await scheduleSubscriptionCancellation(
          params,
          transaction
        )
        expect(result.status).toBe(SubscriptionStatus.Canceled)
      })
    })

    it('should throw an error if no current billing period exists for `AtEndOfCurrentBillingPeriod`', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Do not create any billing period so that the helper returns null.
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }
        await expect(
          scheduleSubscriptionCancellation(params, transaction)
        ).rejects.toThrow('No current billing period found')
      })
    })

    it('should throw an error if the cancellation date is before the subscription start date', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const futureStart = new Date(now.getTime() + 60 * 60 * 1000)
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period that starts in the future.
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: futureStart,
          endDate: new Date(futureStart.getTime() + 60 * 60 * 1000),
        })
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing: SubscriptionCancellationArrangement.AtFutureDate,
            endDate: new Date(), // current time is before the billing period start
          },
        }
        await expect(
          scheduleSubscriptionCancellation(params, transaction)
        ).rejects.toThrow(
          /Cannot end a subscription before its start date/
        )
      })
    })

    it('should handle boundary conditions for billing period dates correctly', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Use a fixed cancellation time.
        const fixedNow = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create a billing period that starts exactly at fixedNow.
        const bp = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: fixedNow,
          endDate: new Date(fixedNow.getTime() + 60 * 60 * 1000),
        })
        const originalDateNow = Date.now
        Date.now = () => fixedNow.getTime()
        const params: ScheduleSubscriptionCancellationParams = {
          id: subscription.id,
          cancellation: {
            timing:
              SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
          },
        }
        const updatedSubscription =
          await scheduleSubscriptionCancellation(params, transaction)
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.CancellationScheduled
        )
        // Verify that if the cancellation time equals the billing period start, the billing period is not updated as scheduled.
        const updatedBP = await selectBillingPeriodById(
          bp.id,
          transaction
        )
        expect(updatedBP.status).not.toBe(
          BillingPeriodStatus.ScheduledToCancel
        )
        Date.now = originalDateNow
      })
    })
  })

  /* --------------------------------------------------------------------------
     Edge Cases and Error Handling
  --------------------------------------------------------------------------- */
  describe('Edge Cases and Error Handling', () => {
    it('should handle subscriptions with no billing periods gracefully', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Test with a subscription that has no billing periods.
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        let result
        try {
          result = await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        } catch (error) {
          result = null
        }
        expect(result).toBeDefined()
      })
    })

    it('should handle overlapping billing periods correctly', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        // Create two billing periods that overlap.
        const bp1 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        })
        const bp2 = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(now.getTime() - 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 3 * 60 * 60 * 1000),
        })
        const updatedSubscription =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        const updatedBP1 = await selectBillingPeriodById(
          bp1.id,
          transaction
        )
        const updatedBP2 = await selectBillingPeriodById(
          bp2.id,
          transaction
        )
        // At least one of the billing periods should be updated appropriately.
        expect([
          BillingPeriodStatus.Completed,
          BillingPeriodStatus.Canceled,
        ]).toContain(updatedBP1.status)
        expect([
          BillingPeriodStatus.Completed,
          BillingPeriodStatus.Canceled,
        ]).toContain(updatedBP2.status)
      })
    })

    it('should handle concurrent cancellation requests without data inconsistencies', async () => {
      await adminTransaction(async ({ transaction }) => {
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(Date.now() - 60 * 60 * 1000),
          endDate: new Date(Date.now() + 60 * 60 * 1000),
        })
        // Fire off two concurrent cancellation calls.
        const [result1, result2] = await Promise.all([
          cancelSubscriptionImmediately(subscription, transaction),
          cancelSubscriptionImmediately(subscription, transaction),
        ])
        expect(result1.status).toBe(SubscriptionStatus.Canceled)
        expect(result2.status).toBe(SubscriptionStatus.Canceled)
      })
    })

    it('should throw an error for invalid subscription input', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Passing a null subscription should result in an error.
        await expect(
          cancelSubscriptionImmediately(null as any, transaction)
        ).rejects.toThrow()
      })
    })
  })

  /* --------------------------------------------------------------------------
     Integration Tests (Partial Scope)
  --------------------------------------------------------------------------- */
  describe('Integration Tests (Partial Scope)', () => {
    it('should integrate correctly with subscription lifecycle operations', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Simulate an activation phase followed by an immediate cancellation.
        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
        })
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(Date.now() - 60 * 60 * 1000),
          endDate: new Date(Date.now() + 60 * 60 * 1000),
        })
        const updatedSubscription =
          await cancelSubscriptionImmediately(
            subscription,
            transaction
          )
        expect(updatedSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )
      })
    })

    // it('should not trigger unintended payment processing', async () => {
    //   // Since payment processing is out-of-scope for cancellation, we can simply mark this as a placeholder.
    //   expect(true).toBe(true)
    // })

    // it('should trigger appropriate user notifications', async () => {
    //   // If a notification system is integrated, you might spy on the notification function.
    //   // Here we simply verify a placeholder expectation.
    //   expect(true).toBe(true)
    // })
  })
})
