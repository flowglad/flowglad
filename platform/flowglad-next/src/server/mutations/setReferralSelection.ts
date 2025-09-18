import { protectedProcedure } from '@/server/trpc'
import { z } from 'zod'
import { setReferralSelection as setReferralSelectionInRedis } from '@/utils/redis'
import { referralOptionEnum } from '@/utils/referrals'
import { TRPCError } from '@trpc/server'

export async function innerSetReferralSelectionHandler(params: {
  userId: string
  source: z.infer<typeof referralOptionEnum>
}) {
  const { userId, source } = params
  await setReferralSelectionInRedis({
    subjectId: userId,
    source,
  })
  return { success: true }
}

export const setReferralSelection = protectedProcedure
  .input(
    z.object({
      source: referralOptionEnum,
    })
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.id
    return innerSetReferralSelectionHandler({
      userId,
      source: input.source,
    })
  })


