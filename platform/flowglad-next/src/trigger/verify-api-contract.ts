import { logger, schedules } from '@trigger.dev/sdk'
import verifyApiContract from '@/api-contract/verify'
import { StandardLogger } from '@/types'

export const verifyApiContractTask = schedules.task({
  id: 'verify-api-contract',
  cron: {
    pattern: '*/10 * * * *',
    environments: ['PRODUCTION'],
  }, // Every 10 minutes
  run: async ({ timestamp }) => {
    logger.log('Starting API contract verification', { timestamp })
    try {
      await verifyApiContract(logger)

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
