import { z } from 'zod'
import { publicProcedure } from '@/server/trpc'

export const pong = publicProcedure
  .input(z.object({ foo: z.string() }))
  .mutation(async ({ input, ctx }) => {
    return {
      data: { bar: 'baz' },
    }
  })
