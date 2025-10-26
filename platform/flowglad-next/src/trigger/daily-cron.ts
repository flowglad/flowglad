import { logger, schedules } from '@trigger.dev/sdk'

export const dailyCron = schedules.task({
  id: 'daily-cron',
  cron: '0 0 * * *',
  run: async () => {
    logger.log('Daily cron job started')
    logger.log('Daily cron job completed')
  },
})
