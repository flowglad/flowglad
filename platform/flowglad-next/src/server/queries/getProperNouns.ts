import { protectedProcedure } from '../trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { z } from 'zod'
import { selectProperNounsByQuery } from '@/db/tableMethods/properNounMethods'

export const getProperNouns = protectedProcedure
  .input(
    z.object({
      query: z.string(),
    })
  )
  .query(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectProperNounsByQuery(input.query, transaction)
    })
  })
