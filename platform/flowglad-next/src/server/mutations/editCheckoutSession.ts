import { adminTransaction } from '@/db/adminTransaction'
import { editCheckoutSessionInputSchema } from '@/db/schema/checkoutSessions'
import { publicProcedure } from '@/server/trpc'
import { createNoopContext } from '@/test-utils/transactionCallbacks'
import { editCheckoutSession as editCheckoutSessionFn } from '@/utils/bookkeeping/checkoutSessions'

export const editCheckoutSession = publicProcedure
  .input(editCheckoutSessionInputSchema)
  .mutation(async ({ input }) => {
    return adminTransaction(async ({ transaction }) => {
      return editCheckoutSessionFn(
        input,
        createNoopContext(transaction)
      )
    })
  })
