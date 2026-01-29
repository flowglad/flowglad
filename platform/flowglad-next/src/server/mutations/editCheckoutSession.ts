import { editCheckoutSessionInputSchema } from '@db-core/schema/checkoutSessions'
import { Result } from 'better-result'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { publicProcedure } from '@/server/trpc'
import { editCheckoutSession as editCheckoutSessionFn } from '@/utils/bookkeeping/checkoutSessions'

export const editCheckoutSession = publicProcedure
  .input(editCheckoutSessionInputSchema)
  .mutation(async ({ input }) => {
    return comprehensiveAdminTransaction(async (ctx) => {
      const result = await editCheckoutSessionFn(input, ctx)
      return Result.ok(result)
    })
  })
