import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure } from '@/server/trpc'
import {
  buildDiscordOAuthUrl,
  getDiscordConfig,
} from '@/utils/discord'
import {
  createDiscordOAuthCsrfToken,
  encodeDiscordOAuthState,
} from '@/utils/discordOAuthState'

export const createDiscordConciergeChannelSchema = z.object({})

export const createDiscordConciergeChannel = protectedProcedure
  .input(createDiscordConciergeChannelSchema)
  .output(z.object({ oauthUrl: z.string() }))
  .mutation(async ({ ctx }) => {
    const { organizationId } = ctx
    const userId = ctx.user?.id

    if (!organizationId || !userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Organization context required',
      })
    }

    try {
      const config = getDiscordConfig()
      const csrfToken = await createDiscordOAuthCsrfToken({
        userId,
        organizationId,
      })
      const state = encodeDiscordOAuthState(csrfToken)
      const oauthUrl = buildDiscordOAuthUrl({ state, config })

      return { oauthUrl }
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to initiate Discord OAuth',
        cause: error,
      })
    }
  })
