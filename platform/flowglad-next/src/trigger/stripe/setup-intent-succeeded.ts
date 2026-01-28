import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import { adminTransaction } from '@/db/adminTransaction'
import { processSetupIntentSucceeded } from '@/utils/bookkeeping/processSetupIntent'

export const setupIntentSucceededTask = task({
  id: 'setup-intent-succeeded',
  run: async (payload: Stripe.SetupIntentSucceededEvent, { ctx }) => {
    logger.log('Setup intent succeeded', { payload, ctx })
    const txResult = await adminTransaction(async (ctx) => {
      return processSetupIntentSucceeded(payload.data.object, ctx)
    })
    txResult.unwrap()
    return {
      message: 'Setup intent succeeded',
    }
  },
})
