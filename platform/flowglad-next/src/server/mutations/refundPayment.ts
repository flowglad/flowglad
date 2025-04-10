import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  paymentsClientSelectSchema,
  refundPaymentInputSchema,
} from '@/db/schema/payments'
import { refundPaymentTransaction } from '@/utils/paymentHelpers'
import {
  createPostOpenApiMeta,
  createPostOpenApiMetaWithIdParam,
} from '@/utils/openapi'
import { z } from 'zod'

export const refundPayment = protectedProcedure
  .meta(
    createPostOpenApiMetaWithIdParam({
      resource: 'payments',
      routeSuffix: 'refund',
      summary: 'Refund a Payment',
      tags: ['Payments', 'Refund'],
    })
  )
  .input(refundPaymentInputSchema)
  .output(z.object({ payment: paymentsClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const payment = await authenticatedTransaction(
      async ({ transaction, livemode }) => {
        return refundPaymentTransaction(
          {
            id: input.id,
            partialAmount: input.partialAmount ?? null,
            livemode,
          },
          transaction
        )
      }
    )

    return { payment }
  })
