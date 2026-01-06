import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectStalePayments,
  updatePayment,
} from '@/db/tableMethods/paymentMethods'
import { PaymentStatus } from '@/types'

export const failStalePaymentsTask = task({
  id: 'fail-stale-payments',
  run: async (payload: { timestamp: Date }, { ctx }) => {
    logger.log('Starting fail-stale-payments task', { payload, ctx })

    const sixHoursAgo = new Date(
      payload.timestamp.getTime() - 6 * 60 * 60 * 1000
    )

    return adminTransaction(
      async ({ transaction }) => {
        // Find all payments that are in Processing, RequiresConfirmation, or RequiresAction status
        // and were last updated more than 6 hours ago
        const stalePayments = await selectStalePayments(
          sixHoursAgo,
          transaction
        )

        logger.log(
          `Found ${stalePayments.length} stale payments to mark as failed`,
          {
            stalePaymentIds: stalePayments.map((p) => p.id),
          }
        )

        const failedPaymentIds: string[] = []
        const errors: Array<{ paymentId: string; error: string }> = []

        // Update each stale payment to Failed status
        for (const payment of stalePayments) {
          try {
            await updatePayment(
              {
                id: payment.id,
                status: PaymentStatus.Failed,
                failureMessage:
                  'Payment timed out after 6 hours in pending state',
                failureCode: 'payment_timeout',
              },
              transaction
            )
            failedPaymentIds.push(payment.id)
            logger.log(
              `Successfully marked payment ${payment.id} as failed`,
              {
                previousStatus: payment.status,
                organizationId: payment.organizationId,
                customerId: payment.customerId,
              }
            )
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error)
            errors.push({
              paymentId: payment.id,
              error: errorMessage,
            })
            logger.error(`Failed to update payment ${payment.id}`, {
              error: errorMessage,
              payment,
            })
          }
        }

        const result = {
          totalStalePayments: stalePayments.length,
          successfullyFailed: failedPaymentIds.length,
          failedPaymentIds,
          errors,
        }

        logger.log('Completed fail-stale-payments task', result)

        return result
      },
      { operationName: 'failStalePayments' }
    )
  },
})
