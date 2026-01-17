import { logger, task } from '@trigger.dev/sdk'
import { and, eq, gte, isNotNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { subscriptions } from '@/db/schema/subscriptions'
import { SubscriptionStatus } from '@/types'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { safeZodDate } from '@/utils/core'
import { idempotentSendCustomerSubscriptionRenewalReminderNotification } from './notifications/send-customer-subscription-renewal-reminder-notification'

/**
 * Default number of days before renewal to send reminder.
 * Can be overridden per invocation.
 */
const DEFAULT_REMINDER_DAYS = 7

/**
 * Zod schema to validate and transform the task payload.
 * - timestamp: Coerced to Date (handles string/number/Date from JSON serialization)
 * - reminderDays: Optional positive integer, defaults to DEFAULT_REMINDER_DAYS
 */
const payloadSchema = z.object({
  timestamp: safeZodDate,
  reminderDays: z
    .number()
    .int()
    .positive()
    .optional()
    .default(DEFAULT_REMINDER_DAYS),
})

export const sendSubscriptionRenewalRemindersTask = task({
  id: 'send-subscription-renewal-reminders',
  maxDuration: 300, // 5 minutes
  queue: { concurrencyLimit: 1 },
  run: async (
    payload: {
      timestamp: Date | string | number
      reminderDays?: number
    },
    { ctx }
  ) => {
    const parsed = payloadSchema.parse(payload)
    const { timestamp, reminderDays } = parsed

    logger.log('Starting subscription renewal reminders task', {
      timestamp,
      reminderDays,
      attempt: ctx.attempt,
    })

    // Calculate the window for subscriptions renewing soon
    // We want subscriptions renewing between `reminderDays` from now and `reminderDays - 1` from now
    // This ensures we only send one reminder per subscription per renewal cycle
    const now = timestamp.getTime()
    const windowStart = now + (reminderDays - 1) * 24 * 60 * 60 * 1000
    const windowEnd = now + reminderDays * 24 * 60 * 60 * 1000

    // Find all active subscriptions with renewal in the window
    // Excludes trialing subscriptions (they get trial-specific reminders)
    const subscriptionsToRemind = await adminTransaction(
      async ({ transaction }) => {
        const results = await transaction
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.status, SubscriptionStatus.Active),
              eq(subscriptions.renews, true),
              isNotNull(subscriptions.currentBillingPeriodEnd),
              gte(subscriptions.currentBillingPeriodEnd, windowStart),
              lte(subscriptions.currentBillingPeriodEnd, windowEnd)
            )
          )

        return results
      }
    )

    logger.log(
      `Found ${subscriptionsToRemind.length} subscriptions renewing in ${reminderDays} days`,
      {
        subscriptionIds: subscriptionsToRemind.map((s) => s.id),
      }
    )

    // Trigger reminder notifications for each subscription
    const results = await Promise.allSettled(
      subscriptionsToRemind.map(async (subscription) => {
        try {
          await idempotentSendCustomerSubscriptionRenewalReminderNotification(
            {
              subscriptionId: subscription.id,
              daysUntilRenewal: reminderDays,
            }
          )
          return { subscriptionId: subscription.id, success: true }
        } catch (error) {
          logger.error(
            `Failed to trigger renewal reminder for subscription ${subscription.id}`,
            { error }
          )
          return {
            subscriptionId: subscription.id,
            success: false,
            error,
          }
        }
      })
    )

    const successful = results.filter(
      (r) => r.status === 'fulfilled' && r.value.success
    ).length
    const failed = results.filter(
      (r) => r.status === 'rejected' || !r.value?.success
    ).length

    logger.log('Subscription renewal reminders task completed', {
      total: subscriptionsToRemind.length,
      successful,
      failed,
    })

    return {
      message: `Processed ${subscriptionsToRemind.length} renewal reminders (${successful} successful, ${failed} failed)`,
      total: subscriptionsToRemind.length,
      successful,
      failed,
    }
  },
})

export const triggerSendSubscriptionRenewalReminders =
  testSafeTriggerInvoker(
    async (params: { timestamp: Date; reminderDays?: number }) => {
      await sendSubscriptionRenewalRemindersTask.trigger(params, {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-subscription-renewal-reminders-${params.timestamp.toISOString()}-${params.reminderDays ?? DEFAULT_REMINDER_DAYS}`
        ),
      })
    }
  )
