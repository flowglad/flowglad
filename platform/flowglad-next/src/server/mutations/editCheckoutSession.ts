import { editCheckoutSessionInputSchema } from '@db-core/schema/checkoutSessions'
import { Result } from 'better-result'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { publicProcedure } from '@/server/trpc'
import { editCheckoutSession as editCheckoutSessionFn } from '@/utils/bookkeeping/checkoutSessions'

export const editCheckoutSession = publicProcedure
  .input(editCheckoutSessionInputSchema)
  .mutation(async ({ input }) => {
    const result = await adminTransactionWithResult(async (ctx) => {
      const value = await editCheckoutSessionFn(input, ctx)
      return Result.ok(value)
    })
    return result.unwrap()
  })
