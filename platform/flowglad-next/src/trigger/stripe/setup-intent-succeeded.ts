import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import { adminTransaction } from '@/db/adminTransaction'
import { processSetupIntentSucceeded } from '@/utils/bookkeeping/processSetupIntent'

export const setupIntentSucceededTask = task({
  id: 'setup-intent-succeeded',
  run: async (payload: Stripe.SetupIntentSucceededEvent, { ctx }) => {
    logger.log('Setup intent succeeded', { payload, ctx })
    const txResult = await adminTransaction(async (ctx) => {
      const innerResult = await processSetupIntentSucceeded(
        payload.data.object,
        ctx
      )
      return Result.ok(innerResult.unwrap())
    })
    txResult.unwrap()
    return {
      message: 'Setup intent succeeded',
    }
  },
})
