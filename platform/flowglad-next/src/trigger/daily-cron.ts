import { adminTransaction } from '@/db/adminTransaction'
import { deleteExpiredCheckoutSessionsAndFeeCalculations } from '@/db/tableMethods/checkoutSessionMethods'
import { schedules } from '@trigger.dev/sdk/v3'
import { deleteExpiredBillingPortalApiKeysTask } from './delete-expired-billing-portal-api-keys'

export const dailyCron = schedules.task({
  id: 'daily-cron',
  cron: '0 0 * * *',
  run: async () => {
    await deleteExpiredBillingPortalApiKeysTask.trigger({})
    return adminTransaction(async ({ transaction }) => {
      return deleteExpiredCheckoutSessionsAndFeeCalculations(
        transaction
      )
    })
  },
})
