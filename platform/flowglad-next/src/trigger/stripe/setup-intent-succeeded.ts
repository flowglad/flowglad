import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { processSetupIntentSucceeded } from '@/utils/bookkeeping/processSetupIntent'

export const setupIntentSucceededTask = task({
  id: 'setup-intent-succeeded',
  run: async (payload: Stripe.SetupIntentSucceededEvent, { ctx }) => {
    logger.log('Setup intent succeeded', { payload, ctx })
    await comprehensiveAdminTransaction(
      async ({ transaction, invalidateCache, emitEvent }) => {
        return processSetupIntentSucceeded(
          payload.data.object,
          transaction,
          invalidateCache!,
          emitEvent!
        )
      }
    )
    return {
      message: 'Setup intent succeeded',
    }
  },
})
