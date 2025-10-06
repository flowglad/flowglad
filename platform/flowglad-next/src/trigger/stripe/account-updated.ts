import { updateOrganizationOnboardingStatus } from '@/utils/processStripeEvents'
import { task } from '@trigger.dev/sdk'
import Stripe from 'stripe'
import { storeTelemetry } from '@/utils/redis'

export const stripeAccountUpdatedTask = task({
  id: 'stripe-account-updated',
  run: async (payload: Stripe.AccountUpdatedEvent, { ctx }) => {
    const result = await updateOrganizationOnboardingStatus(
      payload.data.object.id,
      true
    )
    

    if (result?.organization) {
      await storeTelemetry(
        'organization',
        result.organization.id,
        ctx.run.id
      )
    }
    
    return {
      message: 'Success',
    }
  },
})
