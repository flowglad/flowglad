import { Result } from 'better-result'
import { z } from 'zod'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { publicProcedure } from '@/server/trpc'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'

const confirmCheckoutSessionInputSchema = z.object({
  id: z.string(),
  savePaymentMethodForFuture: z.boolean().optional(),
})

/**
 * Idempotently creates a stripe customer and customer for a purchase session,
 * if they don't already exist.
 */
export const confirmCheckoutSession = publicProcedure
  .input(confirmCheckoutSessionInputSchema)
  .mutation(async ({ input }) => {
    const result = await adminTransactionWithResult(async (ctx) => {
      const value = await confirmCheckoutSessionTransaction(
        input,
        ctx
      )
      return Result.ok(value)
    })
    return result.unwrap()
  })
