import { protectedProcedure } from '@/server/trpc'
import { z } from 'zod'
import { setReferralSelection as setReferralSelectionInRedis } from '@/utils/redis'
import { referralOptionEnum } from '@/utils/referrals'
import { TRPCError } from '@trpc/server'

export async function innerSetReferralSelectionHandler(params: {
  organizationId: string
  source: z.infer<typeof referralOptionEnum>
}) {
  const { organizationId, source } = params
  await setReferralSelectionInRedis({
    subjectId: organizationId,
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
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required',
      })
    }
    return innerSetReferralSelectionHandler({
      organizationId,
      source: input.source,
    })
  })
