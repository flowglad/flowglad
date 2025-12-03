import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectProperNounsByQuery } from '@/db/tableMethods/properNounMethods'
import { protectedProcedure } from '../trpc'

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
