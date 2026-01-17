import { logger, task } from '@trigger.dev/sdk'
import { and, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { subscriptions } from '@/db/schema/subscriptions'
import { SubscriptionStatus } from '@/types'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { safeZodDate } from '@/utils/core'
import { idempotentSendCustomerTrialEndingReminderNotification } from './notifications/send-customer-trial-ending-reminder-notification'

/**
 * Default number of days before trial end to send reminder.
 * Can be overridden per invocation.
 */
const DEFAULT_REMINDER_DAYS = 3

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

export const sendTrialEndingRemindersTask = task({
  id: 'send-trial-ending-reminders',
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

    logger.log('Starting trial ending reminders task', {
      timestamp,
      reminderDays,
      attempt: ctx.attempt,
    })

    // Calculate the window for trials ending soon
    // We want trials ending between `reminderDays` from now and `reminderDays - 1` from now
    // This ensures we only send one reminder per trial
    const now = timestamp.getTime()
    const windowStart = now + (reminderDays - 1) * 24 * 60 * 60 * 1000
    const windowEnd = now + reminderDays * 24 * 60 * 60 * 1000

    // Find all trialing subscriptions with trial ending in the window
    const subscriptionsToRemind = await adminTransaction(
      async ({ transaction }) => {
        const results = await transaction
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.status, SubscriptionStatus.Trialing),
              gte(subscriptions.trialEnd, windowStart),
              lte(subscriptions.trialEnd, windowEnd)
            )
          )

        return results
      }
    )

    logger.log(
      `Found ${subscriptionsToRemind.length} subscriptions with trials ending in ${reminderDays} days`,
      {
        subscriptionIds: subscriptionsToRemind.map((s) => s.id),
      }
    )

    // Trigger reminder notifications for each subscription
    const results = await Promise.allSettled(
      subscriptionsToRemind.map(async (subscription) => {
        try {
          await idempotentSendCustomerTrialEndingReminderNotification(
            {
              subscriptionId: subscription.id,
              daysRemaining: reminderDays,
            }
          )
          return { subscriptionId: subscription.id, success: true }
        } catch (error) {
          logger.error(
            `Failed to trigger reminder for subscription ${subscription.id}`,
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

    logger.log('Trial ending reminders task completed', {
      total: subscriptionsToRemind.length,
      successful,
      failed,
    })

    return {
      message: `Processed ${subscriptionsToRemind.length} trial reminders (${successful} successful, ${failed} failed)`,
      total: subscriptionsToRemind.length,
      successful,
      failed,
    }
  },
})

export const triggerSendTrialEndingReminders = testSafeTriggerInvoker(
  async (params: { timestamp: Date; reminderDays?: number }) => {
    await sendTrialEndingRemindersTask.trigger(params, {
      idempotencyKey: await createTriggerIdempotencyKey(
        `send-trial-ending-reminders-${params.timestamp.toISOString()}-${params.reminderDays ?? DEFAULT_REMINDER_DAYS}`
      ),
    })
  }
)
