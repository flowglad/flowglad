import {
  selectOrganizations,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import { stripeAccountUpdatedTask } from '@/trigger/stripe/account-updated'
import { stripePaymentIntentProcessingTask } from '@/trigger/stripe/payment-intent-processing'
import { stripePaymentIntentSucceededTask } from '@/trigger/stripe/payment-intent-succeeded'
import Stripe from 'stripe'
import { getConnectedAccountOnboardingStatus } from './stripe'
import { adminTransaction } from '@/db/adminTransaction'
import { selectDiscounts } from '@/db/tableMethods/discountMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { BusinessOnboardingStatus } from '@/types'
import { stripePaymentIntentPaymentFailedTask } from '@/trigger/stripe/payment-intent-payment-failed'
import { stripePaymentIntentCanceledTask } from '@/trigger/stripe/payment-intent-canceled'
import { setupIntentSucceededTask } from '@/trigger/stripe/setup-intent-succeeded'
import { stripeChargeFailedTask } from '@/trigger/stripe/charge-failed'
import { createTriggerIdempotencyKey } from './backendCore'
import { idempotentSendPayoutNotification } from '@/trigger/notifications/send-payout-notification'

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
  const organization = await adminTransaction(
    async ({ transaction }) => {
      let [organization] = await selectOrganizations(
        {
          stripeAccountId,
        },
        transaction
      )

      const newOnboardingStatus = onboardingStatus.onboardingStatus

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

      if (
        newOnboardingStatus === BusinessOnboardingStatus.FullyOnboarded &&
        !organization.payoutsEnabled
      ) {
        await idempotentSendPayoutNotification(organization.id)
      }

      return organization
    }
  )
  return { onboardingStatus, organization }
}
