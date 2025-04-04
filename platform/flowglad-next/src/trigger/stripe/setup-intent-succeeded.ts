import { adminTransaction } from '@/db/adminTransaction'
import { processSetupIntentUpdated } from '@/utils/bookkeeping/processSetupIntentUpdated'
import { logger, task } from '@trigger.dev/sdk/v3'
import Stripe from 'stripe'

export const setupIntentSucceededTask = task({
  id: 'setup-intent-succeeded',
  run: async (payload: Stripe.SetupIntentSucceededEvent, { ctx }) => {
    logger.log('Setup intent succeeded', { payload, ctx })
    await adminTransaction(async ({ transaction }) => {
      return processSetupIntentUpdated(
        payload.data.object,
        transaction
      )
    })
    return {
      message: 'Setup intent succeeded',
    }
  },
})
