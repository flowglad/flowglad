import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  paymentsClientSelectSchema,
  refundPaymentInputSchema,
} from '@/db/schema/payments'
import { refundPaymentTransaction } from '@/utils/paymentHelpers'
import { createPostOpenApiMetaWithIdParam } from '@/utils/openapi'
import { z } from 'zod'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import { adminTransaction } from '@/db/adminTransaction'

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
        return selectPaymentById(input.id, transaction)
      }
    )
    if (!payment) {
      throw new Error('Payment not found')
    }
    const updatedPayment = await adminTransaction(
      async ({ transaction }) => {
        return await refundPaymentTransaction(
          {
            id: input.id,
            partialAmount: input.partialAmount ?? null,
          },
          transaction
        )
      }
    )
    return { payment: updatedPayment }
  })
