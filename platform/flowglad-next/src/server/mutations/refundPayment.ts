import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { refundPaymentInputSchema } from '@/db/schema/payments'
import { refundPaymentTransaction } from '@/utils/paymentHelpers'
import {
  createGetOpenApiMeta,
  createPostOpenApiMeta,
} from '@/utils/openapi'

export const refundPayment = protectedProcedure
  .meta(
    createPostOpenApiMeta({
      resource: 'payments',
      routeSuffix: 'refund',
      summary: 'Refund a Payment',
      tags: ['Payments', 'Refund'],
    })
  )
  .input(refundPaymentInputSchema)
  .mutation(async ({ input, ctx }) => {
    const payment = await authenticatedTransaction(
      async ({ transaction, livemode }) => {
        return refundPaymentTransaction(
          {
            id: input.id,
            partialAmount: input.partialAmount,
            livemode,
          },
          transaction
        )
      }
    )

    return {
      data: { payment },
    }
  })
