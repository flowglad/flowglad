import { adminTransaction } from '@/db/databaseMethods'
import { deleteExpiredCheckoutSessionsAndFeeCalculations } from '@/db/tableMethods/checkoutSessionMethods'
import { schedules } from '@trigger.dev/sdk/v3'

export const dailyCron = schedules.task({
  id: 'daily-cron',
  cron: '0 0 * * *',
  run: async () => {
    return adminTransaction(async ({ transaction }) => {
      return deleteExpiredCheckoutSessionsAndFeeCalculations(
        transaction
      )
    })
  },
})
