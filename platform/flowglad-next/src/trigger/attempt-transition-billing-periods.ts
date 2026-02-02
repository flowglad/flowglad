import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectBillingPeriodsDueForTransition } from '@/db/tableMethods/billingPeriodMethods'
import { attemptBillingPeriodTransitionTask } from './attempt-billing-period-transition'

export const attemptTransitionBillingPeriodsTask = task({
  id: 'attempt-transition-billing-periods',
  run: async (
    payload: {
      lastTimestamp: Date
      currentTimestamp: Date
    },
    { ctx }
  ) => {
    logger.log('Attempting to transition billing periods', {
      payload,
      ctx,
    })

    const billingPeriodsToTransition = (
      await adminTransaction(({ transaction }) =>
        selectBillingPeriodsDueForTransition(
          {
            rangeStart: payload.lastTimestamp,
            rangeEnd: payload.currentTimestamp,
          },
          transaction
        ).then((value) => Result.ok(value))
      )
    ).unwrap()

    if (billingPeriodsToTransition.length > 0) {
      await attemptBillingPeriodTransitionTask.batchTrigger(
        billingPeriodsToTransition.map((billingPeriod) => ({
          payload: { billingPeriod },
        }))
      )
    }

    return {
      message: 'Billing periods transitioned',
    }
  },
})
