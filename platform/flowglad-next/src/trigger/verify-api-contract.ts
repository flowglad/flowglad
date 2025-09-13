import { logger, schedules } from '@trigger.dev/sdk'
import { StandardLogger } from '@/types'
import verifyApiContract from '@/api-contract/verify'

export const verifyApiContractTask = schedules.task({
  id: 'verify-api-contract',
  cron: '*/10 * * * *', // Every 10 minutes
  run: async ({ timestamp }) => {
    logger.log('Starting API contract verification', { timestamp })

    try {
      // Create a StandardLogger that wraps trigger.dev's logger
      const standardLogger: StandardLogger = {
        info: (message: string) => logger.log(message),
        warn: (message: string) => logger.warn(message),
        error: (message: string) => logger.error(message),
      }

      await verifyApiContract(standardLogger)

      logger.log('API contract verification completed successfully', {
        timestamp,
      })

      return {
        success: true,
        timestamp: timestamp.toISOString(),
      }
    } catch (error) {
      logger.error('API contract verification failed', {
        error: error instanceof Error ? error.message : String(error),
        timestamp,
      })
      throw error
    }
  },
})
