import {
  selectOrganizations,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import { stripeAccountUpdatedTask } from '@/trigger/stripe/account-updated'
import { stripePaymentIntentProcessingTask } from '@/trigger/stripe/payment-intent-processing'
import { stripePaymentIntentSucceededTask } from '@/trigger/stripe/payment-intent-succeeded'
import Stripe from 'stripe'
import { getConnectedAccountOnboardingStatus } from './stripe'
import { adminTransaction } from '@/db/databaseMethods'
import { selectDiscounts } from '@/db/tableMethods/discountMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { BusinessOnboardingStatus } from '@/types'
import { stripePaymentIntentPaymentFailedTask } from '@/trigger/stripe/payment-intent-payment-failed'
import { stripePaymentIntentCanceledTask } from '@/trigger/stripe/payment-intent-canceled'
import { setupIntentSucceededTask } from '@/trigger/stripe/setup-intent-succeeded'

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
      break
    }
    case 'setup_intent.succeeded': {
      await setupIntentSucceededTask.trigger(event)
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
      const discounts = await selectDiscounts(
        {
          organizationId: organization.id,
        },
        transaction
      )
      const products = await selectProducts(
        {
          organizationId: organization.id,
        },
        transaction
      )

      let newOnboardingStatus: BusinessOnboardingStatus =
        onboardingStatus.onboardingStatus
      /**
       * If there are any discounts or products, we consider the organization
       * partially onboarded.
       */
      if (discounts.length > 0 || products.length > 0) {
        newOnboardingStatus =
          BusinessOnboardingStatus.PartiallyOnboarded
      }

      organization = await updateOrganization(
        {
          id: organization.id,
          onboardingStatus: newOnboardingStatus,
          payoutsEnabled: onboardingStatus.payoutsEnabled,
        },
        transaction
      )
      return organization
    }
  )
  return { onboardingStatus, organization }
}
