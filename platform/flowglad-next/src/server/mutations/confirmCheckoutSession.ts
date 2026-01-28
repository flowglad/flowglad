import { Result } from 'better-result'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
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
    return adminTransaction(async (ctx) => {
      const result = await confirmCheckoutSessionTransaction(
        input,
        ctx
      )
      return Result.ok(result)
    })
  })
