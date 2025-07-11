import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { processSetupIntentSucceeded } from '@/utils/bookkeeping/processSetupIntent'
import { logger, task } from '@trigger.dev/sdk'
import Stripe from 'stripe'

export const setupIntentSucceededTask = task({
  id: 'setup-intent-succeeded',
  run: async (payload: Stripe.SetupIntentSucceededEvent, { ctx }) => {
    logger.log('Setup intent succeeded', { payload, ctx })
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      return processSetupIntentSucceeded(
        payload.data.object,
        transaction
      )
    })
    return {
      message: 'Setup intent succeeded',
    }
  },
})
