import { adminTransaction } from '@/db/adminTransaction'
import { editCheckoutSessionInputSchema } from '@/db/schema/checkoutSessions'
import { publicProcedure } from '@/server/trpc'
import { editCheckoutSession as editCheckoutSessionFn } from '@/utils/bookkeeping/checkoutSessions'

export const editCheckoutSession = publicProcedure
  .input(editCheckoutSessionInputSchema)
  .mutation(async ({ input }) => {
    return adminTransaction(async ({ transaction }) => {
      return editCheckoutSessionFn(input, transaction)
    })
  })
