import { publicProcedure } from '@/server/trpc'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { idInputSchema } from '@/db/tableUtils'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'

/**
 * Idempotently creates a stripe customer and customer for a purchase session,
 * if they don't already exist.
 */
export const confirmCheckoutSession = publicProcedure
  .input(idInputSchema)
  .mutation(async ({ input }) => {
    return comprehensiveAdminTransaction(async ({ transaction }) => {
      return await confirmCheckoutSessionTransaction(
        input,
        transaction
      )
    })
  })
