import { protectedProcedure } from '@/server/trpc'

export const ping = protectedProcedure
  // .input(z.object({ productId: z.string() }))
  .query(({ ctx }) => {
    return {
      message: 'pong',
      // productId: input.productId,
      environment: ctx.environment,
      userId: ctx.auth.userId,
      organizationId: ctx.organizationId,
    }
  })
