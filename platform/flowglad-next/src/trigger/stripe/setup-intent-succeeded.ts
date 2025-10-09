import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { processSetupIntentSucceeded } from '@/utils/bookkeeping/processSetupIntent'
import { logger, task } from '@trigger.dev/sdk'
import Stripe from 'stripe'
import { attemptBillingRunTask } from '../attempt-billing-run'

export const setupIntentSucceededTask = task({
  id: 'setup-intent-succeeded',
  run: async (payload: Stripe.SetupIntentSucceededEvent, { ctx }) => {
    logger.log('Setup intent succeeded', { payload, ctx })
    const result = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        return processSetupIntentSucceeded(
          payload.data.object,
          transaction
        )
      }
    )
    /**
     * If processing the setup intent resulted in a billing run,
     * attempt to execute it
     */
    if (result.billingRun) {
      await attemptBillingRunTask.trigger({
        billingRun: result.billingRun,
      })
    }
    return {
      message: 'Setup intent succeeded',
    }
  },
})
