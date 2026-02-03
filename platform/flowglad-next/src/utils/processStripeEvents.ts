import { BusinessOnboardingStatus } from '@db-core/enums'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectOrganizations,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import { idempotentSendOrganizationOnboardingCompletedNotification } from '@/trigger/notifications/send-organization-onboarding-completed-notification'
import { stripeAccountUpdatedTask } from '@/trigger/stripe/account-updated'
import { stripeChargeFailedTask } from '@/trigger/stripe/charge-failed'
import { stripePaymentIntentCanceledTask } from '@/trigger/stripe/payment-intent-canceled'
import { stripePaymentIntentPaymentFailedTask } from '@/trigger/stripe/payment-intent-payment-failed'
import { stripePaymentIntentProcessingTask } from '@/trigger/stripe/payment-intent-processing'
import { stripePaymentIntentSucceededTask } from '@/trigger/stripe/payment-intent-succeeded'
import { setupIntentSucceededTask } from '@/trigger/stripe/setup-intent-succeeded'
import { createTriggerIdempotencyKey } from './backendCore'
import { getConnectedAccountOnboardingStatus } from './stripe'

export const handleStripePrimaryWebhookEvent = async (
  event: Stripe.Event
) => {
  switch (event.type) {
    case 'payment_intent.processing': {
      /**
       * - only applies in the case of an ACH debit
       * - never should be hit in the case of a credit card
       */
      await stripePaymentIntentProcessingTask.trigger(event)
      break
    }
    case 'payment_intent.canceled': {
      await stripePaymentIntentCanceledTask.trigger(event)
      break
    }
    case 'payment_intent.payment_failed': {
      await stripePaymentIntentPaymentFailedTask.trigger(event)
      break
    }
    /**
     * - if it's for a credit card - that's it somewhat automically.
     * - if it's for ACH, this is like final final v3 final final.
     */
    case 'payment_intent.succeeded':
      await stripePaymentIntentSucceededTask.trigger(event)
      break
    case 'charge.failed': {
      await stripeChargeFailedTask.trigger(event)
      break
    }
    case 'setup_intent.succeeded': {
      await setupIntentSucceededTask.trigger(event, {
        idempotencyKey: await createTriggerIdempotencyKey(
          event.data.object.id
        ),
      })
      break
    }
    case 'setup_intent.setup_failed': {
      // await stripeSetupIntentSetupFailedTask.trigger(event)
      break
    }
    case 'setup_intent.canceled': {
      // await stripeSetupIntentSetupPendingTask.trigger(event)
      break
    }
    case 'setup_intent.requires_action': {
      // await stripeSetupIntentRequiresActionTask.trigger(event)
      break
    }
    default:
      // eslint-disable-next-line no-console
      console.log(`Unhandled event type: ${event.type}`)
  }
}

export const handleStripeConnectWebhookEvent = async (
  event: Stripe.Event
) => {
  switch (event.type) {
    case 'account.updated':
      await stripeAccountUpdatedTask.trigger(event)
      break
  }
}

export const updateOrganizationOnboardingStatus = async (
  stripeAccountId: string | null,
  livemode: boolean
) => {
  if (!stripeAccountId) {
    return
  }
  const onboardingStatus = await getConnectedAccountOnboardingStatus(
    stripeAccountId,
    livemode
  )
  const organization = (
    await adminTransaction(async ({ transaction }) => {
      let [organization] = await selectOrganizations(
        {
          stripeAccountId,
        },
        transaction
      )

      if (!organization) {
        throw new Error(
          `Organization not found for stripeAccountId: ${stripeAccountId}`
        )
      }

      const newOnboardingStatus = onboardingStatus.onboardingStatus
      const oldOnboardingStatus = organization.onboardingStatus

      /**
       * NOTE: Intentionally not setting payoutsEnabled here to manually vet organizations
       * before enabling payouts. The onboardingStatus.payoutsEnabled value is available
       * but we keep it false by default for manual review.
       */
      organization = await updateOrganization(
        {
          id: organization.id,
          onboardingStatus: newOnboardingStatus,
          //payoutsEnabled: onboardingStatus.payoutsEnabled, <-- We don't want to set this here because we want to manually vet organizations before enabling payouts
        },
        transaction
      )

      // Only send notification when status transitions to FullyOnboarded
      if (
        newOnboardingStatus ===
          BusinessOnboardingStatus.FullyOnboarded &&
        oldOnboardingStatus !==
          BusinessOnboardingStatus.FullyOnboarded &&
        !organization.payoutsEnabled
      ) {
        await idempotentSendOrganizationOnboardingCompletedNotification(
          organization.id
        )
      }

      return Result.ok(organization)
    })
  ).unwrap()
  return { onboardingStatus, organization }
}
