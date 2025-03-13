import { protectedProcedure } from '@/server/trpc'
import { z } from 'zod'

export const ping = protectedProcedure
  // .input(z.object({ productId: z.string() }))
  .query(({ input, ctx }) => {
    return {
      message: 'pong',
      // productId: input.productId,
      environment: ctx.environment,
      userId: ctx.auth.userId,
      organizationId: ctx.organizationId,
    }
  })
