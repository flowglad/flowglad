import { updateOrganizationOnboardingStatus } from '@/utils/processStripeEvents'
import { task } from '@trigger.dev/sdk/v3'
import Stripe from 'stripe'

export const stripeAccountUpdatedTask = task({
  id: 'stripe-account-updated',
  run: async (payload: Stripe.AccountUpdatedEvent, { ctx }) => {
    await updateOrganizationOnboardingStatus(
      payload.data.object.id,
      true
    )
    return {
      message: 'Success',
    }
  },
})
